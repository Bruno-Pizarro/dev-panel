import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { collectNudges, gitNudges, holidayNudges, isWorkday, nextWorkdayName, serviceNudges, testDataNudges, workdayNudges, type RepoState } from './nudges.js';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute); // noviembre 2026: 6 = viernes, 9 = lunes
const repo = (over: Partial<RepoState> = {}): RepoState => ({ repo: 'front', branch: 'feature/33939', dirty: 0, ahead: 0, lastCommitAt: at(6, 9), ...over });
const rules = (now: Date) => ({ now, exit: '18:00', protectedBranches: ['desarrollo', 'main'], workday: true });

describe('avisos de git', () => {
  it('cambios sin commitear en una rama protegida: el más importante', () => {
    const [nudge] = gitNudges([repo({ branch: 'desarrollo', dirty: 2 })], rules(at(6, 11)));
    expect(nudge).toMatchObject({ kind: 'git-wrong-branch', priority: 90 });
    expect(nudge!.detail).toContain('2 archivos modificados');
  });

  it('sin commitear hace más de 3 h avisa; con un commit reciente, no', () => {
    expect(gitNudges([repo({ dirty: 3, lastCommitAt: at(6, 9) })], rules(at(6, 14))).map((n) => n.kind)).toEqual(['git-dirty']);
    expect(gitNudges([repo({ dirty: 3, lastCommitAt: at(6, 13) })], rules(at(6, 14)))).toEqual([]);
    expect(gitNudges([repo({ dirty: 0 })], rules(at(6, 14)))).toEqual([]);
  });

  it('commits sin pushear: solo desde una hora antes de la salida', () => {
    expect(gitNudges([repo({ ahead: 2 })], rules(at(6, 15)))).toEqual([]);
    const [nudge] = gitNudges([repo({ ahead: 2 })], rules(at(6, 17, 10)));
    expect(nudge).toMatchObject({ kind: 'git-unpushed' });
    expect(nudge!.detail).toContain('2 commits');
  });

  it('en fin de semana solo avisa lo de la rama protegida; lo demás no', () => {
    const weekend = { ...rules(at(7, 17, 30)), workday: false };
    expect(gitNudges([repo({ dirty: 3, ahead: 2, lastCommitAt: null })], weekend)).toEqual([]);
    expect(gitNudges([repo({ branch: 'main', dirty: 1 })], weekend)).toHaveLength(1);
  });

  it('el id cambia cuando cambia la condición (para que no se repita mientras sea la misma)', () => {
    const a = gitNudges([repo({ dirty: 3, lastCommitAt: null })], rules(at(6, 14)))[0]!.id;
    const b = gitNudges([repo({ dirty: 4, lastCommitAt: null })], rules(at(6, 14)))[0]!.id;
    expect(a).not.toBe(b);
  });
});

describe('avisos de servicios y datos de prueba', () => {
  const containers = [{ name: 'a', service: 'panel', state: 'running', status: 'Up' }, { name: 'b', service: 'security', state: 'exited', status: 'Exited' }];
  it('un corte parcial de obligatorios avisa; todo apagado, no', () => {
    expect(serviceNudges(['panel', 'security'], containers)[0]).toMatchObject({ kind: 'service-down', detail: 'No están corriendo: security.' });
    expect(serviceNudges(['panel', 'security'], [])).toEqual([]);
    expect(serviceNudges(['panel'], containers)).toEqual([]);
  });
  it('un contenedor con el healthcheck en rojo avisa', () => {
    expect(serviceNudges([], [{ name: 'legajo', service: 'legajo', state: 'running', status: 'Up (unhealthy)' }])[0]).toMatchObject({ kind: 'service-down' });
  });
  it('datos de prueba que quedaron en tickets aprobados', () => {
    expect(testDataNudges([{ ticket: '33526', count: 12 }, { ticket: '33527', count: 0 }])).toMatchObject([{ kind: 'test-data', title: 'Datos de prueba sin limpiar (#33526)' }]);
  });
});

describe('avisos de la jornada', () => {
  const base = { entry: '09:00', exit: '18:00', workday: true, done: { 'marcar-entrada': true, 'marcar-salida': false, 'cargar-horas': false, 'cargar-notas': false }, dailySaved: false };
  it('antes de la salida no pide salida, horas ni notas', () => {
    expect(workdayNudges({ ...base, now: at(6, 15) })).toEqual([]);
  });
  it('pasada la salida pide marcar, cargar horas y notas, y el daily si falta', () => {
    const titles = workdayNudges({ ...base, now: at(6, 18, 5) }).map((n) => n.title);
    expect(titles).toEqual(expect.arrayContaining(['Marcar la salida', 'Falta cargar las horas y las notas', 'El daily de hoy no está guardado']));
  });
  it('lo ya hecho no se avisa', () => {
    const titles = workdayNudges({ ...base, now: at(6, 18, 5), dailySaved: true, done: { ...base.done, 'marcar-salida': true, 'cargar-horas': true } }).map((n) => n.title);
    expect(titles).toEqual(['Falta cargar las notas']);
  });
  it('la entrada se avisa pasados 15 minutos, y solo un rato', () => {
    const pending = { ...base, done: { ...base.done, 'marcar-entrada': false } };
    expect(workdayNudges({ ...pending, now: at(6, 9, 10) })).toEqual([]);
    expect(workdayNudges({ ...pending, now: at(6, 9, 20) })[0]).toMatchObject({ title: 'Marcar la entrada' });
    expect(workdayNudges({ ...pending, now: at(6, 14) }).map((n) => n.title)).not.toContain('Marcar la entrada');
  });
  it('en fin de semana o feriado, nada', () => {
    expect(workdayNudges({ ...base, now: at(7, 19), workday: false })).toEqual([]);
  });
});

describe('feriados', () => {
  const holidays = [{ date: '2026-11-09', name: 'Visita del papa León XIV', type: 'inamovible' }];
  const off = ['2026-11-09'];
  it('el viernes avisa del lunes feriado y dice que se vuelve el martes', () => {
    const [nudge] = holidayNudges(at(6, 12), holidays, off);
    expect(nudge).toMatchObject({ id: 'holiday:2026-11-09', title: 'Feriado el lunes: Visita del papa León XIV' });
    expect(nudge!.detail).toContain('el martes');
  });
  it('sin feriado cerca, o en un día sin trabajo, no avisa', () => {
    expect(holidayNudges(at(4, 12), holidays, off)).toEqual([]);
    expect(holidayNudges(at(7, 12), holidays, off)).toEqual([]);
  });
  it('días hábiles y próximo día hábil', () => {
    expect(isWorkday(at(9, 10), off)).toBe(false);
    expect(isWorkday(at(10, 10), off)).toBe(true);
    expect(nextWorkdayName(at(6, 12), off)).toBe('el martes');
    expect(nextWorkdayName(at(4, 12), off)).toBe('mañana');
  });
});

describe('collectNudges (todo simulado)', () => {
  it('reúne las fuentes, ordena por prioridad y una fuente que falla no tira las demás', async () => {
    const config = { ...defaultConfig('/x'), workday: { entry: '09:00', exit: '18:00', punchUrl: '' } };
    const nudges = await collectNudges(config, {
      now: at(6, 18, 5),
      holidays: async () => [{ date: '2026-11-09', name: 'Feriado de prueba', type: 'inamovible' }],
      repoStates: async () => [repo({ branch: 'desarrollo', dirty: 1 })],
      containers: async () => {
        throw new Error('docker caído');
      },
      leftovers: async () => [],
      checklist: () => ({ 'marcar-entrada': true, 'marcar-salida': false, 'cargar-horas': true, 'cargar-notas': true }),
      dailySaved: () => true,
    });
    expect(nudges.map((n) => n.kind)).toEqual(['git-wrong-branch', 'workday', 'holiday']);
    expect(nudges.map((n) => n.priority)).toEqual([...nudges.map((n) => n.priority)].sort((a, b) => b - a));
  });
});

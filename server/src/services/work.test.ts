import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, paths } from '../config.js';
import { KEEP_DAYS, classifyDoc, collectTickets, mergeActivity, pruneActivity, windowDays, type ActivityEvent } from './activity.js';
import { ChecklistError, getDailyChecklist, itemId, setDailyItem, setTestRun, testStatusOf, getTestState } from './checklists.js';
import { buildSpHistory, clearBoardCache, fetchBoard, firstDelivery, mondayOf, orderStatuses } from './redmine.js';

const NOW = new Date(2026, 9, 27, 18, 0);
const ev = (id: string, at: Date, type: ActivityEvent['type'] = 'commit'): ActivityEvent => ({ id, type, at: at.toISOString(), title: id });

describe('historial de actividad (5 días)', () => {
  beforeEach(() => {
    const dir = join(paths.data, 'activity');
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) writeFileSync(join(dir, name), '[]');
  });

  it('la ventana son 5 días incluido hoy', () => {
    expect(windowDays(NOW)).toEqual(['2026-10-27', '2026-10-26', '2026-10-25', '2026-10-24', '2026-10-23']);
    expect(KEEP_DAYS).toBe(5);
  });

  it('agrupa por día, no repite eventos y conserva lo ya visto', () => {
    const a = ev('a', new Date(2026, 9, 27, 10));
    const first = mergeActivity([a, ev('b', new Date(2026, 9, 26, 9))], NOW);
    expect(first['2026-10-27']!.map((e) => e.id)).toEqual(['a']);
    const second = mergeActivity([a], NOW);
    expect(second['2026-10-26']!.map((e) => e.id)).toEqual(['b']);
    expect(second['2026-10-27']).toHaveLength(1);
  });

  it('borra los archivos de días que pasaron de 5 días', () => {
    const dir = join(paths.data, 'activity');
    writeFileSync(join(dir, '2026-10-20.json'), '[{"id":"x"}]');
    writeFileSync(join(dir, '2026-10-23.json'), '[]');
    expect(pruneActivity(NOW)).toContain('2026-10-20');
    expect(readdirSync(dir)).not.toContain('2026-10-20.json');
    expect(readdirSync(dir)).toContain('2026-10-23.json');
  });

  it('clasifica documentos de análisis, estimación y pruebas', () => {
    expect(classifyDoc('33526_ARQUITECTO_v1.0.md')).toBe('analysis');
    expect(classifyDoc('ESTIMACION_v1.md')).toBe('estimation');
    expect(classifyDoc('33526_EJECUCION_v1.0.md')).toBe('test');
    expect(classifyDoc('notas.md')).toBeNull();
  });

  it('toma de ticket.json las fechas de pruebas, reviews y MRs, y de las carpetas los archivos modificados', () => {
    const extra = mkdtempSync(join(tmpdir(), 'dp-act-'));
    const folder = join(extra, '33526-x');
    mkdirSync(folder);
    writeFileSync(join(folder, 'ticket.json'), JSON.stringify({ ticket: '33526', titulo: 'Algo', pruebas: [{ fecha: '2026-10-26', resultado: '3/3' }], codeReview: [{ fecha: '2026-10-25', veredicto: 'aprobado' }], mrs: [{ fecha: '2026-10-27', repo: 'front', iid: 7 }, { repo: 'sin-fecha', iid: 8 }] }));
    writeFileSync(join(folder, 'ARQUITECTO.md'), 'x');
    writeFileSync(join(folder, 'viejo_PLAN.md'), 'x');
    utimesSync(join(folder, 'viejo_PLAN.md'), new Date(2026, 8, 1), new Date(2026, 8, 1));
    const events = collectTickets({ ...defaultConfig('/x'), paths: { ...defaultConfig('/x').paths, extra } }, new Date(2026, 9, 20));
    const types = events.map((e) => e.type).sort();
    expect(types).toEqual(['analysis', 'mr', 'review', 'test']);
    expect(events.find((e) => e.type === 'mr')!.title).toContain('front !7');
  });
});

describe('checklists', () => {
  // El estado vive en archivos de la carpeta temporal de tests: cada prueba parte limpia.
  beforeEach(() => {
    mkdirSync(paths.data, { recursive: true });
    for (const name of ['daily-checklist.json', 'test-checklists.json']) writeFileSync(join(paths.data, name), '{}');
  });

  it('el checklist diario se tilda por día y no se mezcla con otros días', () => {
    const labels = ['Marcar entrada', 'Marcar salida', 'Cargar horas'];
    expect(getDailyChecklist(labels, '2026-10-27').items.every((i) => !i.done)).toBe(true);
    setDailyItem(labels, itemId('Marcar entrada'), true, '2026-10-27');
    expect(getDailyChecklist(labels, '2026-10-27').items.map((i) => i.done)).toEqual([true, false, false]);
    expect(getDailyChecklist(labels, '2026-10-28').items.every((i) => !i.done)).toBe(true);
    expect(() => setDailyItem(labels, 'inventado', true, '2026-10-27')).toThrow(ChecklistError);
    expect(() => getDailyChecklist(labels, '../x')).toThrow(/Fecha/);
  });

  it('cada tanda de pruebas tiene su propio checklist y conclusión; lo del panel manda sobre la skill', () => {
    const labels = ['Actualizar el ticket en Redmine', 'Subir los comentarios'];
    const dir = 'tkt-pruebas';
    setTestRun(dir, '0', { item: { id: itemId(labels[0]!), done: true } }, labels.map(itemId));
    setTestRun(dir, '0', { conclusion: 'requiere-cambios' }, labels.map(itemId));
    const runs = [{ conclusion: 'aprobado' }, {}];
    const state = getTestState(dir);
    // la última tanda (índice 1) todavía no tiene nada tildado
    expect(testStatusOf(runs, state, labels)).toEqual({ runs: 2, conclusion: 'sin-conclusion', checklistDone: 0, checklistTotal: 2 });
    // con una sola tanda, se ve el estado de la panel (requiere cambios) aunque la skill haya escrito "aprobado"
    expect(testStatusOf([{ conclusion: 'aprobado' }], state, labels)).toEqual({ runs: 1, conclusion: 'requiere-cambios', checklistDone: 1, checklistTotal: 2 });
    expect(testStatusOf([], {}, labels).conclusion).toBe('sin-conclusion');
    expect(() => setTestRun(dir, 'x', {}, [])).toThrow(/inválida/);
    expect(() => setTestRun(dir, '0', { item: { id: 'otro', done: true } }, [])).toThrow(/inexistente/);
  });
});

describe('kanban de Redmine', () => {
  const config = { ...defaultConfig('/x'), redmine: { enabled: true, configFile: '', baseUrl: 'https://r.test', doneStatuses: [] } };
  const env = process.env['REDMINE_API_KEY'];
  beforeEach(() => {
    process.env['REDMINE_API_KEY'] = 'clave-de-prueba';
    clearBoardCache();
  });
  const afterAll = () => (env === undefined ? delete process.env['REDMINE_API_KEY'] : (process.env['REDMINE_API_KEY'] = env));

  it('ordena las columnas por el flujo del equipo y deja los desconocidos al final', () => {
    const ordered = orderStatuses([{ id: 99, name: 'Raro', closed: false }, { id: 14, name: 'Entregado', closed: true }, { id: 9, name: 'Análisis', closed: false }, { id: 16, name: 'Desarrollo', closed: false }]);
    expect(ordered.map((s) => s.name)).toEqual(['Análisis', 'Desarrollo', 'Entregado', 'Raro']);
  });

  it('pide los ticket con cambios, pagina, filtra por asignado y manda la key por cabecera', async () => {
    const calls: Array<{ url: string; key: string | undefined }> = [];
    const mk = (id: number) => ({ id, subject: `[3 SP] Tarea ${id}`, status: { name: 'Desarrollo' }, updated_on: '2026-10-27T10:00:00Z' });
    const fetcher = async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, key: init.headers['X-Redmine-API-Key'] });
      if (url.includes('issue_statuses')) return { ok: true, status: 200, json: async () => ({ issue_statuses: [{ id: 16, name: 'Desarrollo', is_closed: false }] }) };
      const offset = Number(new URL(url).searchParams.get('offset'));
      return { ok: true, status: 200, json: async () => ({ total_count: 130, issues: Array.from({ length: offset === 0 ? 100 : 30 }, (_, i) => mk(offset + i + 1)) }) };
    };
    const board = await fetchBoard(config, 'me', 30, fetcher, Date.parse('2026-10-27T12:00:00Z'));
    expect(board.issues).toHaveLength(130);
    expect(board.issues[0]).toMatchObject({ storyPoints: 3, title: 'Tarea 1' });
    expect(board.truncated).toBe(false);
    const list = calls.filter((c) => c.url.includes('/issues.json'));
    expect(list).toHaveLength(2);
    expect(list[0]!.url).toContain('assigned_to_id=me');
    expect(list[0]!.url).toContain('updated_on=%3E%3D2026-09-27');
    expect(list.every((c) => c.key === 'clave-de-prueba' && !c.url.includes('clave-de-prueba'))).toBe(true);
    afterAll();
  });
});

describe('historial semanal de story points', () => {
  const now = new Date(2026, 9, 28, 12); // miércoles 28/10/2026
  const at = (day: number, month = 9) => new Date(2026, month, day, 10).toISOString();

  it('la semana empieza el lunes', () => {
    expect(mondayOf(now).getDate()).toBe(26);
    expect(mondayOf(new Date(2026, 9, 25)).getDate()).toBe(19); // domingo pertenece a la semana anterior
  });

  it('reparte las entregas en 4 semanas y calcula los dos promedios', () => {
    const history = buildSpHistory(
      [
        { id: 1, title: 'a', sp: 5, at: at(27) }, // semana actual
        { id: 2, title: 'b', sp: 3, at: at(21) }, // semana pasada
        { id: 3, title: 'c', sp: 8, at: at(15) },
        { id: 4, title: 'd', sp: 2, at: at(8) },
        { id: 5, title: 'viejo', sp: 13, at: at(1) }, // fuera de las 4 semanas
        { id: 6, title: 'sin sp', sp: null, at: at(27) },
      ],
      ['Revisión'],
      'redmine',
      now,
    );
    expect(history.weeks.map((week) => [week.weekStart, week.sp])).toEqual([['2026-10-26', 5], ['2026-10-19', 3], ['2026-10-12', 8], ['2026-10-05', 2]]);
    expect(history.weeks[0]).toMatchObject({ sp: 5, withoutSp: 1 });
    expect(history.average).toBe(4.5);
    expect(history.averageClosed).toBe(4.3);
  });

  it('toma solo el primer cambio a un estado entregado, comparando por id', () => {
    const journals = [
      { created_on: '2026-10-20T10:00:00Z', details: [{ property: 'attr', name: 'status_id', new_value: '16' }] },
      { created_on: '2026-10-22T10:00:00Z', details: [{ property: 'attr', name: 'status_id', new_value: '20' }] },
      { created_on: '2026-10-25T10:00:00Z', details: [{ property: 'attr', name: 'status_id', new_value: '21' }] },
      { created_on: '2026-10-21T10:00:00Z', details: [{ property: 'attr', name: 'assigned_to_id', new_value: '20' }] },
    ];
    expect(firstDelivery(journals, new Set(['20', '21']))).toBe('2026-10-22T10:00:00Z');
    expect(firstDelivery(journals, new Set(['99']))).toBeNull();
  });
});

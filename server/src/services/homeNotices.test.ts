import { describe, expect, it } from 'vitest';
import type { MrInfo } from './gitlab.js';
import { currentSprint, dayOf, plainNote, reminderNotices, sprintsOfToday, dueNotices, holidayNotices, mrNotices, parseSprintDates, reviewNotices, routineNotices, sprintNotice } from './homeNotices.js';
import { mapIssue, type RedmineIssue } from './redmine.js';

const issue = (over: Record<string, unknown> = {}): RedmineIssue =>
  mapIssue({ id: 1, subject: '[5 SP] [Módulo : X] Un ticket', status: { name: 'Desarrollo', is_closed: false }, tracker: { name: 'Nueva funcionalidad' }, updated_on: '2026-11-04T10:00:00Z', ...over } as never, 'https://r.example');

describe('1. vencimientos (solo del sprint actual)', () => {
  const today = '2026-11-04';
  const inSprint = (...ids: number[]) => new Set(ids);
  it('avisa los vencidos, los de hoy, mañana y los próximos dentro del umbral, del más urgente al menos', () => {
    const notices = dueNotices(
      [issue({ id: 3, due_date: '2026-11-07' }), issue({ id: 1, due_date: '2026-11-02' }), issue({ id: 2, due_date: '2026-11-04' }), issue({ id: 4, due_date: '2026-11-05' }), issue({ id: 5, due_date: '2026-11-20' })],
      today,
      3,
      ['Revisión'],
      inSprint(1, 2, 3, 4, 5),
    );
    expect(notices.map((n) => [n.id, n.level])).toEqual([['due-1', 'important'], ['due-2', 'important'], ['due-4', 'important'], ['due-3', 'info']]);
    expect(notices.map((n) => n.title)).toEqual(['#1 venció hace 2 días', '#2 vence hoy', '#4 vence mañana', '#3 vence en 3 días']);
    expect(notices[0]!.link).toBe('https://r.example/issues/1');
  });
  it('solo los tickets del sprint actual: un ticket viejo que quedó perdido, aunque esté vencido, no se avisa', () => {
    const issues = [issue({ id: 30392, due_date: '2025-10-17' }), issue({ id: 33528, due_date: '2026-11-06' }), issue({ id: 33000, due_date: '2026-11-05' })];
    expect(dueNotices(issues, today, 3, [], inSprint(33528)).map((n) => n.id)).toEqual(['due-33528']);
    // Un ticket del sprint vencido hace mucho SÍ se avisa: está en el sprint.
    expect(dueNotices(issues, today, 3, [], inSprint(30392)).map((n) => n.id)).toEqual(['due-30392']);
  });
  it('sin sprint actual (null) o con un sprint vacío no se avisa ningún vencimiento', () => {
    const issues = [issue({ id: 1, due_date: '2026-11-04' })];
    expect(dueNotices(issues, today, 3, [], null)).toEqual([]);
    expect(dueNotices(issues, today, 3, [], inSprint())).toEqual([]);
  });
  it('no avisa lo sin fecha, lo cerrado ni lo ya entregado (estado "listo")', () => {
    const all = inSprint(7, 8, 9);
    expect(dueNotices([issue({ id: 9 }), issue({ id: 8, due_date: '2026-11-01', status: { name: 'Revisión', is_closed: false } }), issue({ id: 7, due_date: '2026-11-01', status: { name: 'Terminado', is_closed: true } })], today, 3, ['Revisión'], all)).toEqual([]);
  });
});

const mr = (over: Partial<MrInfo> = {}): MrInfo => ({ repo: 'front', iid: 171, order: 1, title: 'Pantalla Firmas por legajo', url: 'https://g/mr/171', state: 'opened', draft: false, sourceBranch: null, targetBranch: null, mergeStatus: null, hasConflicts: false, discussionsResolved: null, notes: 0, pipeline: null, updatedAt: '2026-11-04T09:00:00Z', level: 'ok', summary: 'Listo para mergear', error: null, ...over });
const NOW = new Date('2026-11-04T12:00:00Z');

describe('2. MRs que esperan algo', () => {
  it('conflictos y pipeline caído son importantes', () => {
    const { notices } = mrNotices([{ ticket: '33527', mr: mr({ hasConflicts: true }) }, { ticket: null, mr: mr({ iid: 9, repo: 'legajo', pipeline: { status: 'failed', url: null } }) }], {}, NOW, 3);
    expect(notices.map((n) => [n.id, n.level])).toEqual([['mr-conflict-front!171', 'important'], ['mr-pipeline-legajo!9', 'important']]);
    expect(notices[0]!.title).toBe('front !171 (#33527) tiene conflictos');
  });
  it('comentarios nuevos respecto del chequeo anterior; el primer chequeo no avisa de comentarios', () => {
    expect(mrNotices([{ ticket: null, mr: mr({ notes: 5 }) }], { 'front!171': 3 }, NOW, 3).notices[0]).toMatchObject({ id: 'mr-notes-front!171', level: 'important', title: 'front !171: 2 comentarios nuevos' });
    expect(mrNotices([{ ticket: null, mr: mr({ notes: 5 }) }], {}, NOW, 3).notices).toEqual([]);
    expect(mrNotices([{ ticket: null, mr: mr({ notes: 3 }) }], { 'front!171': 3 }, NOW, 3).notices).toEqual([]);
  });
  it('sin movimiento: avisa desde el umbral de días y solo si no hay un problema más urgente', () => {
    const stale = mr({ updatedAt: '2026-10-30T09:00:00Z' });
    expect(mrNotices([{ ticket: null, mr: stale }], {}, NOW, 3).notices[0]).toMatchObject({ id: 'mr-stale-front!171', level: 'info' });
    expect(mrNotices([{ ticket: null, mr: mr({ updatedAt: '2026-11-03T09:00:00Z' }) }], {}, NOW, 3).notices).toEqual([]);
    expect(mrNotices([{ ticket: null, mr: { ...stale, hasConflicts: true } }], {}, NOW, 3).notices.map((n) => n.id)).toEqual(['mr-conflict-front!171']);
  });
  it('ignora los MRs que no están abiertos y devuelve los comentarios actuales para comparar la próxima vez', () => {
    const result = mrNotices([{ ticket: null, mr: mr({ state: 'merged', hasConflicts: true }) }, { ticket: null, mr: mr({ iid: 2, notes: 7 }) }], {}, NOW, 3);
    expect(result.notices).toEqual([]);
    expect(result.notes).toEqual({ 'front!2': 7 });
  });
});

describe('3. revisiones nuevas', () => {
  const item = (over: Record<string, unknown> = {}) => ({ id: 33527, title: 'Pantalla Firmas por legajo', tracker: 'Nueva funcionalidad', url: 'https://r/issues/33527', parentId: null, journals: [], ...over });
  it('avisa los comentarios de otras personas posteriores a la última revisión', () => {
    const notices = reviewNotices([item({ journals: [{ user: 'Mariano Buglio', at: '2026-11-04T08:00:00Z', notes: 'Revisé el código\ny encontré dos cosas' }, { user: 'Mariano Buglio', at: '2026-11-01T08:00:00Z', notes: 'viejo' }] })], '2026-11-03T00:00:00Z', 'Bruno Pizarro');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ id: 'review-33527', kind: 'review', level: 'important', title: 'Mariano Buglio comentó en #33527' });
    expect(notices[0]!.detail).toContain('«Revisé el código y encontré dos cosas»');
  });
  it('no avisa los comentarios propios, los viejos ni los vacíos; en una subtarea (Control QA) lo aclara', () => {
    expect(reviewNotices([item({ journals: [{ user: 'Bruno Pizarro', at: '2026-11-04T08:00:00Z', notes: 'mío' }, { user: 'Otro', at: '2026-11-04T08:00:00Z', notes: '  ' }] })], '2026-11-03T00:00:00Z', 'Bruno Pizarro')).toEqual([]);
    const qa = reviewNotices([item({ id: 33945, tracker: 'Control QA', parentId: 33527, journals: [{ user: 'Mariano Buglio', at: '2026-11-04T09:00:00Z', notes: 'Probé todo' }] })], '2026-11-03T00:00:00Z', 'Bruno Pizarro');
    expect(qa[0]!.title).toBe('Mariano Buglio comentó en Control QA #33945 (de #33527)');
  });
});

describe('recordatorios como avisos', () => {
  const reminder = (over: Record<string, unknown>) => ({ id: 'a1', text: 'Probar lo de Mariano', at: null, createdAt: '2026-11-04T10:00:00Z', done: false, doneAt: null, ...over }) as never;
  it('uno con fecha es importante, un pendiente sin fecha es informativo, y lleva su id para marcarlo como hecho', () => {
    const [dated, undated] = reminderNotices([reminder({ at: '2026-11-05' }), reminder({ id: 'b2', text: 'Revisar X' })]);
    expect(dated).toMatchObject({ id: 'reminder-a1', kind: 'reminder', level: 'important', title: 'Probar lo de Mariano', detail: 'Recordatorio para 05/11/2026', reminderId: 'a1', link: null });
    expect(undated).toMatchObject({ level: 'info', detail: 'Recordatorio sin fecha', reminderId: 'b2' });
    expect(reminderNotices([reminder({ at: new Date(2026, 0, 2, 9, 5).toISOString() })])[0]!.detail).toBe('Recordatorio para 02/01 09:05');
    expect(reminderNotices([])).toEqual([]);
  });
});

describe('plainNote', () => {
  it('saca el formato Textile de un comentario de Redmine', () => {
    expect(plainNote('h3. Segunda revisión\n\n* Menú funciona\n* Revisé @b3d3ab412@ y el "front !165":https://g/mr/165#note_1')).toBe('Segunda revisión Menú funciona Revisé b3d3ab412 y el front !165');
    expect(plainNote('Probé *todo* y _anda_')).toBe('Probé todo y anda');
    expect(plainNote('  sin formato  ')).toBe('sin formato');
  });
});

describe('7. sprint', () => {
  it('lee las fechas del título y elige el sprint de hoy', () => {
    expect(parseSprintDates('Sprint Semana 02/11/26 al 06/11/26')).toEqual({ start: '2026-11-02', end: '2026-11-06' });
    expect(parseSprintDates('sin fechas')).toBeNull();
    const sprints = [{ id: 1, subject: 'Sprint Semana 26/10/26 al 30/10/26' }, { id: 2, subject: 'Sprint Semana 02/11/26 al 06/11/26' }];
    expect(currentSprint(sprints, '2026-11-04')?.id).toBe(2);
    expect(currentSprint(sprints, '2026-11-06')?.id).toBe(2);
    expect(currentSprint(sprints, '2026-11-09')).toBeNull();
    // Dos tickets de tipo Sprint en las mismas fechas: primero el que se llama "Sprint…".
    const both = [{ id: 7, subject: 'ICONO - Requerimientos semana del 02/11/2026 al 06/11/2026' }, { id: 5, subject: 'Sprint Semana 02/11/26 al 06/11/26' }];
    expect(sprintsOfToday(both, '2026-11-04').map((s) => s.id)).toEqual([5, 7]);
  });
  it('días que quedan y SP entregados (Revisión cuenta como entregado) contra los planificados', () => {
    const sprint = { id: 2, subject: 'Sprint Semana 02/11/26 al 06/11/26', start: '2026-11-02', end: '2026-11-06' };
    const tickets = [issue({ id: 10, subject: '[5 SP] A', status: { name: 'Revisión', is_closed: false } }), issue({ id: 11, subject: '[8 SP] B', status: { name: 'Desarrollo', is_closed: false } }), issue({ id: 12, subject: 'Sin SP', status: { name: 'Análisis', is_closed: false } })];
    const notice = sprintNotice(sprint, tickets, ['Revisión', 'Testeado'], '2026-11-04', 'https://r/issues/2');
    expect(notice).toMatchObject({ kind: 'sprint', level: 'info', title: 'Quedan 3 días del sprint', link: 'https://r/issues/2' });
    expect(notice.detail).toContain('5 de 13 SP entregados');
    expect(notice.detail).toContain('pendientes: #11, #12');
    expect(notice.detail).toContain('1 ticket sin SP');
  });
  it('el último día con trabajo pendiente es importante; con todo entregado, no', () => {
    const sprint = { id: 2, subject: 'Sprint Semana 02/11/26 al 06/11/26', start: '2026-11-02', end: '2026-11-06' };
    const pending = sprintNotice(sprint, [issue({ id: 11, subject: '[8 SP] B', status: { name: 'Desarrollo', is_closed: false } })], ['Revisión'], '2026-11-06', 'l');
    expect(pending).toMatchObject({ level: 'important', title: 'Hoy es el último día del sprint' });
    const done = sprintNotice(sprint, [issue({ id: 10, subject: '[5 SP] A', status: { name: 'Revisión', is_closed: false } })], ['Revisión'], '2026-11-06', 'l');
    expect(done.level).toBe('info');
    expect(done.detail).toContain('todo entregado');
  });
});

describe('feriados', () => {
  const holidays = [{ date: '2026-11-04', name: 'Día de prueba', type: '' }, { date: '2026-11-09', name: 'Día de la Tradición', type: 'trasladable' }, { date: '2026-12-08', name: 'Inmaculada', type: '' }];
  it('hoy y el próximo dentro de 7 días', () => {
    expect(holidayNotices(holidays, '2026-11-04').map((n) => n.title)).toEqual(['Hoy es feriado: Día de prueba', 'Feriado en 5 días: Día de la Tradición']);
    expect(holidayNotices(holidays, '2026-11-08').map((n) => n.title)).toEqual(['Mañana es feriado: Día de la Tradición']);
    expect(holidayNotices(holidays, '2026-11-20')).toEqual([]);
  });
});

describe('6. rutinas', () => {
  const config = { workday: { entry: '09:00', exit: '18:00', punchUrl: '' } };
  it('el viernes avisa el resumen semanal; los otros días no', () => {
    expect(routineNotices(new Date(2026, 10, 6, 10, 0), config, true).map((n) => n.id)).toEqual(['routine-weekly-2026-11-06']);
    expect(routineNotices(new Date(2026, 10, 4, 10, 0), config, true)).toEqual([]);
  });
  it('avisa las horas sin cargar solo pasado el horario de salida, en un día de semana y si hay horario configurado', () => {
    expect(routineNotices(new Date(2026, 10, 4, 18, 30), config, false)[0]).toMatchObject({ id: 'routine-hours-2026-11-04', level: 'important' });
    expect(routineNotices(new Date(2026, 10, 4, 17, 0), config, false)).toEqual([]);
    expect(routineNotices(new Date(2026, 10, 4, 19, 0), config, true)).toEqual([]);
    expect(routineNotices(new Date(2026, 10, 7, 19, 0), config, false)).toEqual([]);
    expect(routineNotices(new Date(2026, 10, 4, 19, 0), { workday: { ...config.workday, exit: '' } }, false)).toEqual([]);
  });
  it('dayOf usa el día local', () => {
    expect(dayOf(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
  });
});

import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from './activity.js';
import { REPORT_EXAMPLE, buildReportPrompt, formatWeekData, groupByTicket, ticketOfEvent, weekRange } from './weekly.js';

const ev = (partial: Partial<ActivityEvent> & Pick<ActivityEvent, 'id' | 'type' | 'title'>): ActivityEvent => ({ at: '2026-10-27T12:00:00.000Z', ...partial });

describe('weekRange', () => {
  it('va de lunes a domingo, y "previous" es la semana anterior completa', () => {
    const wednesday = new Date(2026, 9, 28, 15);
    const current = weekRange('current', wednesday);
    expect([current.start.getDate(), current.end.getDate(), current.label]).toEqual([26, 2, '2026-10-26 al 2026-11-01']);
    const previous = weekRange('previous', wednesday);
    expect([previous.start.getDate(), previous.end.getDate(), previous.label]).toEqual([19, 26, '2026-10-19 al 2026-10-25']);
  });
  it('un domingo sigue siendo parte de la semana que empezó el lunes anterior', () => {
    expect(weekRange('current', new Date(2026, 10, 1, 10)).label).toBe('2026-10-26 al 2026-11-01');
  });
});

describe('agrupar por ticket', () => {
  it('toma el número del evento o del texto (#33526, [33526]) y deja el resto "sin ticket"', () => {
    expect(ticketOfEvent(ev({ id: '1', type: 'commit', title: 'feat: algo (#33526)' }))).toBe('33526');
    expect(ticketOfEvent(ev({ id: '2', type: 'commit', title: 'fix [32973] otra cosa' }))).toBe('32973');
    expect(ticketOfEvent(ev({ id: '3', type: 'review', title: 'Code review · x', ticket: '33118' }))).toBe('33118');
    expect(ticketOfEvent(ev({ id: '4', type: 'commit', title: 'chore: limpieza' }))).toBeNull();
  });

  it('reúne commits, revisiones, MRs, análisis y estimaciones de cada ticket, sin repetir', () => {
    const tickets = groupByTicket([
      ev({ id: 'a', type: 'commit', title: 'feat(perfil): pestaña (#33526)', repo: 'front' }),
      ev({ id: 'b', type: 'commit', title: 'feat(legajo): endpoint (#33526)', repo: 'legajo' }),
      ev({ id: 'c', type: 'review', title: 'Code review · #32935 Estructura de cargo', ticket: '32935', detail: 'con cambios' }),
      ev({ id: 'd', type: 'estimation', title: 'Estimación · #33347 Filtros', ticket: '33347' }),
      ev({ id: 'e', type: 'analysis', title: 'Análisis · #33347 Filtros', ticket: '33347' }),
      ev({ id: 'f', type: 'commit', title: 'chore: algo sin ticket', repo: 'front' }),
    ]);
    expect(tickets.map((t) => t.ticket)).toEqual(['32935', '33347', '33526', null]);
    expect(tickets.find((t) => t.ticket === '33526')!.commits).toHaveLength(2);
    expect(tickets.find((t) => t.ticket === '32935')!.reviews[0]).toContain('con cambios');
    expect(tickets.find((t) => t.ticket === '33347')).toMatchObject({ analyses: expect.any(Array), estimations: expect.any(Array) });
  });
});

describe('texto del pedido', () => {
  const range = weekRange('current', new Date(2026, 9, 28));
  const data = formatWeekData(range, [{ ticket: '33526', title: 'Pestaña Pendientes de firma', redmineStatus: 'Revisión', commits: [{ repo: 'front', subject: 'feat: pestaña' }], pushes: 1, reviews: [], mergeRequests: [], tests: ['31/31'], analyses: [], estimations: [] }]);

  it('los datos listan el ticket con su título, estado, commits y pruebas', () => {
    expect(data).toContain('Ticket 33526 — Pestaña Pendientes de firma [estado en Redmine: Revisión]');
    expect(data).toContain('1 commits en front: feat: pestaña');
    expect(data).toContain('Pruebas: 31/31');
  });

  it('el pedido incluye el formato de ejemplo, las reglas contra inventar datos y los datos de la semana', () => {
    const prompt = buildReportPrompt(range, data);
    expect(prompt).toContain(REPORT_EXAMPLE);
    expect(prompt).toContain('No inventes');
    expect(prompt).toContain('2026-10-26 al 2026-11-01');
    expect(prompt).toContain('Ticket 33526');
    expect(REPORT_EXAMPLE).toContain('Se avanzaron los tickets:');
  });
});

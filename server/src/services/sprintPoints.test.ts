import { describe, expect, it } from 'vitest';
import { mapIssue } from './redmine.js';
import { normalizeStatus, stateOf, statusIn, summarizeSprintPoints } from './sprintPoints.js';

const statuses = { review: ['Revisión'], approved: ['Testeado', 'Testing Consultoría', 'Terminado', 'Entregado'] };
const issue = (id: number, sp: number | null, status: string) =>
  mapIssue({ id, subject: sp === null ? 'Sin SP' : `[${sp} SP] Ticket ${id}`, status: { name: status, is_closed: false }, tracker: { name: 'Nueva funcionalidad' }, priority: { name: 'Normal' }, updated_on: '2026-11-05T10:00:00Z' } as never, 'https://r');

describe('SP del sprint: entregados de verdad y en revisión', () => {
  it('compara los estados sin importar tildes ni mayúsculas', () => {
    expect(normalizeStatus('  Testing Consultoría ')).toBe('testing consultoria');
    expect(statusIn('Testing Consultoria', statuses.approved)).toBe(true);
    expect(statusIn('TERMINADO', statuses.approved)).toBe(true);
    expect(statusIn('Desarrollo', statuses.approved)).toBe(false);
  });

  it('solo Testeado, Testing Consultoría, Terminado y Entregado son entregados; Revisión va aparte', () => {
    expect(stateOf('Testeado', statuses)).toBe('approved');
    expect(stateOf('Testing Consultoría', statuses)).toBe('approved');
    expect(stateOf('Terminado', statuses)).toBe('approved');
    expect(stateOf('Entregado', statuses)).toBe('approved');
    expect(stateOf('Revisión', statuses)).toBe('review');
    expect(stateOf('Revision', statuses)).toBe('review');
    expect(stateOf('Desarrollo', statuses)).toBe('other');
    // no está en la lista: ni entregado ni en revisión
    expect(stateOf('Testing Aprobado Consultoría', statuses)).toBe('other');
  });

  it('suma los SP de cada grupo, y los tickets sin SP no suman', () => {
    const summary = summarizeSprintPoints([issue(1, 5, 'Entregado'), issue(2, 3, 'Terminado'), issue(3, 8, 'Revisión'), issue(4, 2, 'Revisión'), issue(5, 13, 'Desarrollo'), issue(6, null, 'Revisión')], statuses);
    expect(summary).toMatchObject({ approved: 8, review: 10, other: 13, planned: 31, withoutSp: 1 });
    expect(summary.tickets.find((ticket) => ticket.id === 6)).toMatchObject({ sp: null, state: 'review' });
  });

  it('sin tickets devuelve todo en cero', () => {
    expect(summarizeSprintPoints([], statuses)).toMatchObject({ planned: 0, approved: 0, review: 0, other: 0, withoutSp: 0, tickets: [] });
  });
});

import { describe, expect, it } from 'vitest';
import { agentHits, searchHits, ticketHits, ticketPath } from './globalSearch';
import type { AgentRun, TicketSummary } from './types';

const ticket = (over: Partial<TicketSummary>): TicketSummary => ({ dir: '33527-firmas', ticket: '33527', title: 'Firmas por legajo', estado: 'Pruebas', rama: 'feature/33527', repos: [], mrs: 0, lastUpdated: 0, docs: 0, images: 0, hasMeta: true, lastTest: null, review: null, ...over });
const run = (over: Partial<AgentRun>): AgentRun => ({ id: 'a1', sessionId: 's', type: 'Explore', description: 'Buscar consumidor', startedAt: '', endedAt: null, status: 'done', agentId: null, project: null, ticket: '33527', hasRequest: true, hasResponse: true, ...over });

describe('globalSearch', () => {
  it('manda los tickets de revisión a Pruebas y el resto a Planificación', () => {
    expect(ticketPath(ticket({}))).toBe('/planificacion/33527-firmas');
    expect(ticketPath(ticket({ kind: 'revision' }))).toBe('/pruebas/33527-firmas');
  });

  it('encuentra por número y por palabras sueltas del título', () => {
    const hits = [...ticketHits([ticket({}), ticket({ dir: '1-otro', ticket: '1', title: 'Otro', rama: null })]), ...agentHits([run({})])];
    expect(searchHits(hits, '33527').map((hit) => hit.group)).toEqual(['Tickets', 'Agentes']);
    expect(searchHits(hits, 'legajo firmas').map((hit) => hit.id)).toEqual(['ticket:33527-firmas']);
  });

  it('sin texto no devuelve nada y limita cada grupo', () => {
    const many = ticketHits(Array.from({ length: 20 }, (_, i) => ticket({ dir: `d${i}`, ticket: String(i) })));
    expect(searchHits(many, '  ')).toEqual([]);
    expect(searchHits(many, 'firmas')).toHaveLength(8);
  });
});

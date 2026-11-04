import type { AgentRun, TicketSummary } from './types';

export interface SearchHit {
  id: string;
  group: 'Tickets' | 'Agentes';
  title: string;
  detail: string;
  path: string;
  /** Texto contra el que filtra cmdk: número, título, carpeta, rama, etc. */
  value: string;
}

const MAX_PER_GROUP = 8;

/** Los tickets de revisión van a Pruebas; el resto a Planificación. */
export const ticketPath = (ticket: TicketSummary): string => `/${ticket.kind === 'revision' ? 'pruebas' : 'planificacion'}/${encodeURIComponent(ticket.dir)}`;

export const ticketHits = (tickets: TicketSummary[]): SearchHit[] =>
  tickets.map((ticket) => ({
    id: `ticket:${ticket.dir}`,
    group: 'Tickets',
    title: `${ticket.ticket ? `#${ticket.ticket} ` : ''}${ticket.title}`,
    detail: [ticket.estado, ticket.rama].filter(Boolean).join(' · ') || ticket.dir,
    path: ticketPath(ticket),
    value: `ticket ${ticket.ticket ?? ''} ${ticket.title} ${ticket.dir} ${ticket.rama ?? ''} ${ticket.estado ?? ''}`,
  }));

export const agentHits = (runs: AgentRun[]): SearchHit[] =>
  runs.map((run) => ({
    id: `agent:${run.id}`,
    group: 'Agentes',
    title: run.description || run.type,
    detail: [run.type, run.ticket ? `#${run.ticket}` : null, run.status].filter(Boolean).join(' · '),
    path: '/agentes',
    value: `agente ${run.type} ${run.description} ${run.ticket ?? ''}`,
  }));

/** Filtra y limita cada grupo; sin texto no muestra nada para no tapar las vistas. */
export const searchHits = (hits: SearchHit[], query: string): SearchHit[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const counts: Record<string, number> = {};
  return hits.filter((hit) => {
    const text = hit.value.toLowerCase();
    if (!words.every((word) => text.includes(word))) return false;
    counts[hit.group] = (counts[hit.group] ?? 0) + 1;
    return counts[hit.group]! <= MAX_PER_GROUP;
  });
};

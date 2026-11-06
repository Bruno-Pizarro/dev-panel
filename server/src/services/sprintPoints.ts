import type { RedmineIssue } from './redmine.js';

/** Un estado sin mayúsculas, espacios de más ni tildes: «Testing Consultoria» y «Testing Consultoría» son el mismo. */
export const normalizeStatus = (status: string): string =>
  status
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();

export const statusIn = (status: string, list: readonly string[]): boolean => list.some((item) => normalizeStatus(item) === normalizeStatus(status));

export type PointsState = 'approved' | 'review' | 'other';

export interface SprintPointsTicket {
  id: number;
  title: string;
  status: string;
  /** null = el ticket no tiene SP. */
  sp: number | null;
  state: PointsState;
}

/** Los SP de mis tickets del sprint, separados: ya integrados o aprobados, en revisión y todo lo demás. */
export interface SprintPointsSummary {
  planned: number;
  approved: number;
  review: number;
  other: number;
  /** Tickets sin SP (no suman en ninguna cuenta). */
  withoutSp: number;
  tickets: SprintPointsTicket[];
}

export interface PointsStatuses {
  review: readonly string[];
  approved: readonly string[];
}

export const stateOf = (status: string, statuses: PointsStatuses): PointsState => (statusIn(status, statuses.approved) ? 'approved' : statusIn(status, statuses.review) ? 'review' : 'other');

/**
 * Separa los SP del sprint: «entregado de verdad» son solo los tickets en los estados `approved` (Testeado, Testing Consultoría,
 * Terminado, Entregado…); los que están en `review` (Revisión) se cuentan aparte, y el resto es trabajo que sigue en curso.
 */
export const summarizeSprintPoints = (tickets: RedmineIssue[], statuses: PointsStatuses): SprintPointsSummary => {
  const rows = tickets.map((ticket): SprintPointsTicket => ({ id: ticket.id, title: ticket.title, status: ticket.status, sp: ticket.storyPoints, state: stateOf(ticket.status, statuses) }));
  const sum = (state: PointsState) => rows.filter((row) => row.state === state).reduce((total, row) => total + (row.sp ?? 0), 0);
  const approved = sum('approved');
  const review = sum('review');
  const other = sum('other');
  return { planned: approved + review + other, approved, review, other, withoutSp: rows.filter((row) => row.sp === null).length, tickets: rows };
};

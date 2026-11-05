import type { DevPanelConfig } from '../config.js';
import type { AgentSummary } from './agents.js';
import { httpProblem, loadCredentials, parseSubject, type JsonFetcher } from './redmine.js';

/**
 * Lo que el borrador del Daily suma además de commits y carpetas: el trabajo de los agentes de Claude, los cambios de estado de
 * mis tickets en Redmine y una SUGERENCIA de horas por ticket. La sugerencia sale de las ventanas de actividad (commits y agentes),
 * que no ven reuniones, lecturas ni pruebas a mano: es un punto de partida para que cada uno ajuste, no una medida.
 */
export interface ActivityPoint {
  /** Número de ticket o null si no se sabe. */
  ticket: string | null;
  /** Milisegundos desde epoch. */
  at: number;
  /** Fin, si es un intervalo (un agente). */
  endAt?: number;
}

/** Dos puntos de actividad separados por menos de esto se consideran el mismo bloque de trabajo. */
export const BLOCK_GAP_MS = 45 * 60_000;
/** Cada bloque suma este margen (el trabajo previo al primer commit) y como mínimo dura esto. */
export const BLOCK_PADDING_MS = 20 * 60_000;
export const BLOCK_MIN_MS = 30 * 60_000;

const roundHalf = (hours: number) => Math.max(0.5, Math.round(hours * 2) / 2);

export interface HoursSuggestion {
  ticket: string | null;
  hours: number;
  /** Cantidad de bloques de actividad en que se apoya. */
  blocks: number;
}

/** Horas sugeridas por ticket, en múltiplos de 0,5 h, de mayor a menor. */
export const suggestHours = (points: ActivityPoint[]): HoursSuggestion[] => {
  const byTicket = new Map<string | null, ActivityPoint[]>();
  points.forEach((point) => byTicket.set(point.ticket, [...(byTicket.get(point.ticket) ?? []), point]));
  const result: HoursSuggestion[] = [];
  for (const [ticket, list] of byTicket) {
    const sorted = [...list].sort((a, b) => a.at - b.at);
    let total = 0;
    let blocks = 0;
    let start = sorted[0]!.at;
    let end = sorted[0]!.endAt ?? sorted[0]!.at;
    const close = () => {
      total += Math.max(BLOCK_MIN_MS, end - start + BLOCK_PADDING_MS);
      blocks += 1;
    };
    for (const point of sorted.slice(1)) {
      if (point.at - end <= BLOCK_GAP_MS) end = Math.max(end, point.endAt ?? point.at);
      else {
        close();
        start = point.at;
        end = point.endAt ?? point.at;
      }
    }
    close();
    result.push({ ticket, hours: roundHalf(total / 3_600_000), blocks });
  }
  return result.sort((a, b) => b.hours - a.hours || Number(a.ticket === null) - Number(b.ticket === null) || (a.ticket ?? '').localeCompare(b.ticket ?? ''));
};

/** Ticket citado en el asunto de un commit ("… (#33527)" o "#33527"); los tickets son de 5 o 6 dígitos (un "#2026" es un año). */
export const ticketOfSubject = (subject: string): string | null => /#(\d{5,6})\b/.exec(subject)?.[1] ?? null;

export interface StatusChange {
  id: number;
  title: string;
  from: string;
  to: string;
  at: string;
}

interface RawJournal {
  created_on: string;
  details?: Array<{ property?: string; name?: string; old_value?: string; new_value?: string }>;
}

/** Cambios de estado (de la lista `statuses` id → nombre) dentro de los journals de un ticket posteriores a `since`. */
export const statusChangesOf = (id: number, title: string, journals: RawJournal[], statuses: Map<string, string>, since: number): StatusChange[] =>
  journals
    .filter((journal) => Date.parse(journal.created_on) >= since)
    .flatMap((journal) =>
      (journal.details ?? [])
        .filter((detail) => detail.property === 'attr' && detail.name === 'status_id' && detail.new_value !== undefined)
        .map((detail) => ({ id, title, from: statuses.get(detail.old_value ?? '') ?? '?', to: statuses.get(detail.new_value!) ?? '?', at: journal.created_on })),
    );

const MAX_TICKETS = 12;

/** Mis tickets cuyo estado cambió desde `since` (solo lectura; si Redmine no responde o no hay clave, lista vacía). */
export const fetchStatusChanges = async (config: DevPanelConfig, since: Date, fetcher: JsonFetcher = fetch as unknown as JsonFetcher): Promise<StatusChange[]> => {
  const credentials = loadCredentials(config);
  if (!credentials) return [];
  const get = async (path: string): Promise<unknown> => {
    const response = await fetcher(`${credentials.baseUrl}${path}`, { headers: { 'X-Redmine-API-Key': credentials.key }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw await httpProblem(response);
    return response.json();
  };
  try {
    const statuses = new Map(((await get('/issue_statuses.json')) as { issue_statuses?: Array<{ id: number; name: string }> }).issue_statuses?.map((status) => [String(status.id), status.name]) ?? []);
    const day = since.toISOString().slice(0, 10);
    const list = (await get(`/issues.json?assigned_to_id=me&status_id=*&updated_on=%3E%3D${day}&sort=updated_on:desc&limit=${MAX_TICKETS}`)) as { issues?: Array<{ id: number; subject?: string }> };
    const changes: StatusChange[] = [];
    for (const issue of list.issues ?? []) {
      const detail = (await get(`/issues/${issue.id}.json?include=journals`)) as { issue?: { journals?: RawJournal[] } };
      changes.push(...statusChangesOf(issue.id, parseSubject(issue.subject ?? '').title, detail.issue?.journals ?? [], statuses, since.getTime()));
    }
    return changes.sort((a, b) => a.at.localeCompare(b.at));
  } catch {
    return [];
  }
};

const hourText = (hours: number) => `${hours % 1 === 0 ? hours : hours.toFixed(1).replace('.', ',')} h`;

/** Las secciones extra del borrador, listas para pegar al markdown (vacío si no hay nada que sumar). */
export const formatExtras = (extras: { agents: AgentSummary[]; changes: StatusChange[]; hours: HoursSuggestion[] }, linkOf: (ticket: string) => string | null = () => null): string[] => {
  const ref = (ticket: string | null) => (ticket ? (linkOf(ticket) ? `[#${ticket}](${linkOf(ticket)})` : `#${ticket}`) : 'sin ticket');
  const lines: string[] = [];
  if (extras.agents.length) {
    lines.push('', '## Agentes de Claude', '');
    const byTicket = new Map<string | null, AgentSummary[]>();
    extras.agents.forEach((agent) => byTicket.set(agent.ticket, [...(byTicket.get(agent.ticket) ?? []), agent]));
    for (const [ticket, list] of byTicket) lines.push(`- ${ref(ticket)}: ${list.length} agente${list.length === 1 ? '' : 's'} — ${[...new Set(list.map((agent) => agent.description))].slice(0, 4).join(' · ')}`);
  }
  if (extras.changes.length) {
    lines.push('', '## Cambios de estado en Redmine', '');
    extras.changes.forEach((change) => lines.push(`- ${ref(String(change.id))} ${change.title}: ${change.from} → **${change.to}**`));
  }
  if (extras.hours.length) {
    lines.push('', '## Horas (sugerencia)', '', '_Calculado con las ventanas de commits y agentes. No ve reuniones, lecturas ni pruebas a mano: ajustalo a tu criterio._', '');
    extras.hours.forEach((item) => lines.push(`- ${ref(item.ticket)}: ~${hourText(item.hours)} (${item.blocks} bloque${item.blocks === 1 ? '' : 's'} de actividad)`));
    lines.push(`- **Total sugerido: ~${hourText(extras.hours.reduce((sum, item) => sum + item.hours, 0))}**`);
  }
  return lines;
};

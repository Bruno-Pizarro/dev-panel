import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { collectGit, collectTickets, type ActivityEvent } from './activity.js';
import { localDay } from './checklists.js';
import { getTicketState, kindOf } from './ticketState.js';
import { getTicket, ignoredDirs, listTickets } from './tickets.js';
import { groupByTicket, ticketLines, type TicketWeek } from './weekly.js';

/**
 * Pedido para que Claude deje, en cada ticket de Redmine con el que se trabajó hoy, una nota con lo que se avanzó en el día. Las
 * revisiones de tickets de otras personas no entran (ya generan su propia nota al terminar). No consulta Redmine: usa solo git y la
 * base de conocimiento, así no suma llamadas a una API que ya conviene cuidar.
 */
export interface DailyNotesRequest {
  date: string;
  /** Tickets de desarrollo propio con actividad hoy (los de solo revisión quedan afuera). */
  tickets: TicketWeek[];
  data: string;
  prompt: string;
}

const developed = (item: TicketWeek) => item.commits.length + item.pushes + item.mergeRequests.length + item.tests.length + item.analyses.length + item.estimations.length > 0;

export const formatDayData = (date: string, tickets: TicketWeek[], withoutTicket: TicketWeek | null): string => {
  const lines = [`Día ${date}`, ''];
  if (!tickets.length) lines.push('(sin desarrollo registrado hoy en git ni en la base de conocimiento)');
  for (const item of tickets) lines.push(...ticketLines(item));
  if (withoutTicket) lines.push('', 'Actividad de hoy que no se pudo asociar a un ticket (preguntame a cuál corresponde antes de incluirla):', ...ticketLines(withoutTicket));
  return lines.join('\n');
};

export const buildNotesPrompt = (date: string, data: string): string =>
  [
    `Dejá en cada ticket de Redmine con el que trabajamos hoy (${date}) una nota con lo que se avanzó en el día.`,
    '',
    'Reglas:',
    '- Una nota por cada ticket de la lista de abajo. Va principalmente el desarrollo: las revisiones a tickets de otras personas ya generan su propia nota al terminar, así que no las incluyas.',
    '- Contá lo que se avanzó (funcionalidad, correcciones, pruebas, análisis) en pocas líneas, en español y sin nombres de archivos. Que se entienda sin leer el código.',
    '- Usá solo lo que figura en los datos. No inventes avances, estados ni fechas: si algo no está claro, preguntame en una línea aparte antes de escribirlo.',
    '- Mostrame primero las notas (número de ticket y texto) y esperá mi OK. Con el OK, publicalas con la skill redmine-drive: una nota por ticket, sin cambiar estado, asignado, horas ni ningún otro campo.',
    '- Pocas llamadas a Redmine: no consultes los tickets, solo dejá las notas.',
    '',
    'Datos de hoy (de git y la base de conocimiento):',
    '```',
    data,
    '```',
  ].join('\n');

/** Reúne lo de hoy desde git y la base de conocimiento y arma el pedido. */
export const buildNotesRequest = async (config: DevPanelConfig, now = new Date(), runner: Runner = run): Promise<DailyNotesRequest> => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const inDay = (event: ActivityEvent) => event.at >= start.toISOString() && event.at < end.toISOString();
  const events = [...(await collectGit(config, start, runner)), ...collectTickets(config, start)].filter(inDay);
  const grouped = groupByTicket(events);

  const found = listTickets(config.paths.extra, ignoredDirs(config)).filter((item) => item.ticket);
  const titles = new Map(found.map((item) => [item.ticket!, item.title]));
  const kinds = new Map(found.map((item) => [item.ticket!, kindOf(getTicketState(item.dir), getTicket(config.paths.extra, item.dir, ignoredDirs(config))?.meta?.tipo)]));
  const tickets = grouped
    .filter((item) => item.ticket !== null && (kinds.get(item.ticket) ?? 'desarrollo') !== 'revision' && developed(item))
    .map((item) => ({ ...item, title: titles.get(item.ticket!) ?? null, kind: 'desarrollo' as const }));
  const orphan = grouped.find((item) => item.ticket === null && developed(item)) ?? null;
  const date = localDay(now);
  const data = formatDayData(date, tickets, orphan);
  return { date, tickets, data, prompt: buildNotesPrompt(date, data) };
};

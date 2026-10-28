import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { collectGit, collectTickets, type ActivityEvent } from './activity.js';
import { localDay } from './checklists.js';
import { fetchIssue, ticketUrl } from './redmine.js';
import { getTicketState, kindOf } from './ticketState.js';
import { getTicket, ignoredDirs, listTickets } from './tickets.js';

export type WeekChoice = 'current' | 'previous';

export interface WeekRange {
  start: Date;
  /** Exclusivo: el lunes siguiente. */
  end: Date;
  label: string;
}

/** Semana de lunes a domingo (hora local). `previous` = la anterior, completa. */
export const weekRange = (choice: WeekChoice, now = new Date()): WeekRange => {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const start = choice === 'previous' ? new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7) : monday;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const sunday = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  return { start, end, label: `${localDay(start)} al ${localDay(sunday)}` };
};

/** Número de ticket al que pertenece un evento: el del propio evento o el que aparece en el texto (`#33526`, `[33526]`). */
export const ticketOfEvent = (event: ActivityEvent): string | null => {
  if (event.ticket) return event.ticket;
  const match = /#(\d{4,6})\b|\[(\d{4,6})\]/.exec(event.title);
  return match?.[1] ?? match?.[2] ?? null;
};

export interface TicketWeek {
  ticket: string | null;
  /** Enlace al ticket en Redmine. */
  url: string | null;
  title: string | null;
  redmineStatus: string | null;
  /** "revision" = solo se revisó el desarrollo de otra persona. */
  kind: 'desarrollo' | 'revision';
  commits: Array<{ repo: string; subject: string }>;
  pushes: number;
  reviews: string[];
  mergeRequests: string[];
  tests: string[];
  analyses: string[];
  estimations: string[];
}

const empty = (ticket: string | null): TicketWeek => ({ ticket, url: null, title: null, redmineStatus: null, kind: 'desarrollo', commits: [], pushes: 0, reviews: [], mergeRequests: [], tests: [], analyses: [], estimations: [] });
const clean = (title: string) => title.replace(/^(Pruebas|Code review|Informe|Análisis|Estimación)\s·\s/, '');

/** Agrupa los eventos de la semana por ticket. Lo que no se puede asociar a un número queda en "sin ticket". */
export const groupByTicket = (events: ActivityEvent[]): TicketWeek[] => {
  const map = new Map<string, TicketWeek>();
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const ticket = ticketOfEvent(event);
    const entry = map.get(ticket ?? '-') ?? empty(ticket);
    map.set(ticket ?? '-', entry);
    // El título del ticket ya figura en el encabezado: de cada evento solo interesa su detalle (resultado, veredicto, archivo).
    const text = event.detail ?? clean(event.title);
    if (event.type === 'commit') entry.commits.push({ repo: event.repo ?? '', subject: event.title.replace(/\s*\(#\d{4,6}\)\s*$/, '') });
    else if (event.type === 'push') entry.pushes += 1;
    else if (event.type === 'review') entry.reviews.push(text);
    else if (event.type === 'mr') entry.mergeRequests.push(text);
    else if (event.type === 'test') entry.tests.push(text);
    else if (event.type === 'analysis') entry.analyses.push(text);
    else if (event.type === 'estimation') entry.estimations.push(text);
  }
  // Por número de ticket; lo que no tiene número, al final.
  return [...map.values()].sort((a, b) => (a.ticket === null ? 1 : 0) - (b.ticket === null ? 1 : 0) || (a.ticket ?? '').localeCompare(b.ticket ?? ''));
};

const bullets = (title: string, items: string[]): string[] => (items.length ? [`  - ${title}: ${[...new Set(items)].slice(0, 6).join(' · ')}`] : []);

export const formatWeekData = (range: WeekRange, tickets: TicketWeek[]): string => {
  const lines = [`Semana ${range.label}`, ''];
  if (!tickets.length) lines.push('(sin actividad registrada en git ni en la base de conocimiento)');
  for (const item of tickets) {
    lines.push(item.ticket ? `- Ticket ${item.ticket}${item.title ? ` — ${item.title}` : ''}${item.redmineStatus ? ` [estado en Redmine: ${item.redmineStatus}]` : ''}${item.url ? ` — ${item.url}` : ''}${item.kind === 'revision' ? ' [SOLO REVISIÓN de desarrollo ajeno]' : ''}` : '- Sin número de ticket');
    const repos = [...new Set(item.commits.map((commit) => commit.repo))].filter(Boolean);
    if (item.commits.length) lines.push(`  - ${item.commits.length} commits${repos.length ? ` en ${repos.join(', ')}` : ''}: ${item.commits.slice(0, 6).map((commit) => commit.subject).join(' · ')}${item.commits.length > 6 ? ` · … y ${item.commits.length - 6} más` : ''}`);
    if (item.pushes) lines.push(`  - ${item.pushes} push`);
    lines.push(...bullets('MRs', item.mergeRequests), ...bullets('Revisiones (code review)', item.reviews), ...bullets('Pruebas', item.tests), ...bullets('Análisis / definición', item.analyses), ...bullets('Estimación', item.estimations));
  }
  return lines.join('\n');
};

/** Formato de los reportes semanales (el que el usuario entrega en el Google Doc). Fuente única: panel y MCP. */
export const REPORT_EXAMPLE = `Se avanzaron los tickets:
- 32972 Saldo de licencia en el formulario de carga
- 32973 Advertencia de rechazos consecutivos de licencia
Ambos ya revisados por Álvaro y con las correcciones subidas

Además, se hicieron revisiones para los tickets
- 32935 Estructura de cargo: configuración de campos obligatorios por empresa
- 33118 Ajustes en Dashboard de seguimiento y Moderación
Ambos con las correcciones hechas por Nicolás ya subidas el día viernes, pendientes a segunda pasada de revisión sobre las correcciones

Se subieron las correcciones que pidió Nicolás para el ticket:
- 32762 Formularios PDF en Legajo Digital
Asignado a Matias Visedo, este ticket fue revisado por Nicolás pero al estar Matias con otros trabajos en proceso se me delegó hacer la corrección de la revisión

Finalmente se generó la estimación, análisis y definición del ticket:
- 33347 Mantener los filtros en incidencias para administradores
Ya en proceso de desarrollo`;

export const buildReportPrompt = (range: WeekRange, data: string): string =>
  [
    `Armame el resumen semanal de avances (${range.label}) para pegar en el Google Doc que nos piden al cierre de la semana.`,
    '',
    'Reglas:',
    '- Mismo formato y tono que el ejemplo de abajo: bloques cortos, cada ticket como "- NÚMERO Título", y una línea final por bloque con su estado.',
    '- Los tickets marcados [SOLO REVISIÓN de desarrollo ajeno] van siempre en el bloque de revisiones y nunca como "avanzados".',
    '- Agrupá así (omití el bloque que no aplique): tickets avanzados; revisiones hechas a tickets de otros; correcciones subidas a pedido de una revisión; estimación, análisis y definición de tickets nuevos.',
    '- Usá solo lo que figura en los datos. No inventes quién revisó, fechas ni estados: si algo no está, omitilo o preguntámelo en una línea aparte, fuera del bloque.',
    '- Los títulos de los tickets, sin prefijos como "[5 SP]" ni "[Módulo: …]".',
    '- Cada ticket lleva su enlace completo de Redmine (el que figura en los datos) justo después del título, como URL en texto plano: así queda clickeable al pegarlo en el Google Doc. Ej.: "- 32972 Saldo de licencia en el formulario de carga https://…/issues/32972".',
    '- Muy breve: sin detalles técnicos ni nombres de archivos.',
    '- Respondé con el texto final en un único bloque de código, listo para copiar y pegar.',
    '',
    'Ejemplo del formato (de la semana anterior):',
    '```',
    REPORT_EXAMPLE,
    '```',
    '',
    'Datos de la semana (de git, la base de conocimiento y Redmine):',
    '```',
    data,
    '```',
  ].join('\n');

export interface WeeklyReport {
  range: { start: string; end: string; label: string };
  tickets: TicketWeek[];
  data: string;
  prompt: string;
}

/** Reúne la semana desde git y la base de conocimiento, completa título y estado con Redmine (si responde) y arma el pedido. */
export const buildWeeklyReport = async (config: DevPanelConfig, choice: WeekChoice, now = new Date(), runner: Runner = run): Promise<WeeklyReport> => {
  const range = weekRange(choice, now);
  const inWeek = (event: ActivityEvent) => event.at >= range.start.toISOString() && event.at < range.end.toISOString();
  const events = [...(await collectGit(config, range.start, runner)), ...collectTickets(config, range.start)].filter(inWeek);
  const tickets = groupByTicket(events);

  const found = listTickets(config.paths.extra, ignoredDirs(config)).filter((item) => item.ticket);
  const folders = new Map(found.map((item) => [item.ticket!, item.title]));
  const kinds = new Map(found.map((item) => [item.ticket!, kindOf(getTicketState(item.dir), getTicket(config.paths.extra, item.dir, ignoredDirs(config))?.meta?.tipo)]));
  await Promise.all(
    tickets.slice(0, 20).map(async (item) => {
      if (!item.ticket) return;
      item.url = ticketUrl(config, item.ticket);
      item.kind = kinds.get(item.ticket) ?? 'desarrollo';
      item.title = folders.get(item.ticket) ?? null;
      try {
        const issue = await fetchIssue(config, item.ticket);
        item.title = issue.title;
        item.redmineStatus = issue.status;
      } catch {
        /* Redmine caído o sin permiso: se sigue con lo local */
      }
    }),
  );
  const data = formatWeekData(range, tickets);
  return { range: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label }, tickets, data, prompt: buildReportPrompt(range, data) };
};

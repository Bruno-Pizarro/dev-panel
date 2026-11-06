import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths, type DevPanelConfig } from '../config.js';
import { holidaysOf, upcomingHolidays, type Holiday } from './holidays.js';
import type { Reminder } from './reminders.js';
import { fetchTicketMrs, type MrInfo } from './gitlab.js';
import { applyStoryPoints, httpProblem, loadCredentials, mapIssue, RedmineError, type Credentials, type JsonFetcher, type RedmineIssue } from './redmine.js';
import { getTicket, ignoredDirs, listTickets } from './tickets.js';
import { kindOf, getTicketState } from './ticketState.js';
import { statusIn, summarizeSprintPoints, type PointsStatuses, type SprintPointsSummary } from './sprintPoints.js';

/**
 * Avisos "en serio" del Inicio. Se calculan UNA vez por día (la primera vez que se abre el Inicio ese día, o con "Volver a revisar")
 * y se guardan en `data/home-notices.json`; abrir el Inicio de nuevo solo lee lo guardado. Todo es solo lectura (Redmine y GitLab).
 * Los avisos de rutina (viernes, horas) dependen del momento y se calculan al pedirlos, sin consultar nada afuera.
 */
export type NoticeKind = 'due' | 'mr' | 'review' | 'sprint' | 'holiday' | 'routine' | 'reminder' | 'discord';
export type NoticeLevel = 'important' | 'info';

export interface Notice {
  id: string;
  kind: NoticeKind;
  level: NoticeLevel;
  title: string;
  detail: string;
  /** Ruta del panel (empieza con "/") o URL completa; null si no hay a dónde ir. */
  link: string | null;
  /** Solo en los recordatorios: id para marcarlo como hecho desde el aviso. */
  reminderId?: string;
}

export interface NoticeError {
  source: string;
  message: string;
}

export interface NoticesReport {
  /** AAAA-MM-DD del día al que corresponde la revisión. */
  date: string;
  generatedAt: string;
  notices: Notice[];
  errors: NoticeError[];
}

const MS_DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
export const dayOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_DAY);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Un comentario de Redmine (Textile) como texto plano de una línea: sin títulos, énfasis, código ni enlaces. */
export const plainNote = (text: string): string =>
  oneLine(
    text
      .replace(/^\s*h[1-6]\.\s*/gm, '')
      .replace(/"([^"]+)":\S+/g, '$1')
      .replace(/!\S+!/g, '')
      .replace(/(^|\s)[*_+-]([^*_+\n]+)[*_+-](?=\s|$|[.,;:])/g, '$1$2')
      .replace(/@([^@\n]+)@/g, '$1')
      .replace(/^\s*[*#]+\s+/gm, ''),
  );

// ---------------------------------------------------------------- 1. vencimientos
/**
 * Tickets míos abiertos que ya vencieron o vencen en `dueDays` días o menos, **solo los del sprint actual** (`sprintIds`): hay tickets
 * viejos, sin especificación, que quedaron perdidos en el tiempo y no sirven como aviso. Los ya entregados (estado "listo") no se avisan.
 * Sin sprint actual (`null`) no se avisa ninguno.
 */
export const dueNotices = (issues: RedmineIssue[], today: string, dueDays: number, doneStatuses: string[], sprintIds: ReadonlySet<number> | null): Notice[] =>
  issues
    .filter((issue) => sprintIds?.has(issue.id) === true && issue.dueDate && issue.statusClosed !== true && !doneStatuses.includes(issue.status))
    .map((issue) => ({ issue, left: dayNumber(issue.dueDate!) - dayNumber(today) }))
    .filter(({ left }) => left <= dueDays)
    .sort((a, b) => a.left - b.left || a.issue.id - b.issue.id)
    .map(({ issue, left }): Notice => ({
      id: `due-${issue.id}`,
      kind: 'due',
      level: left <= 1 ? 'important' : 'info',
      title: left < 0 ? `#${issue.id} venció hace ${plural(-left, 'día', 'días')}` : left === 0 ? `#${issue.id} vence hoy` : left === 1 ? `#${issue.id} vence mañana` : `#${issue.id} vence en ${left} días`,
      detail: `${issue.title} · estado ${issue.status} · vence el ${issue.dueDate!.split('-').reverse().join('/')}`,
      link: issue.url,
    }));

// ---------------------------------------------------------------- 2. MRs que esperan algo
export interface MrWithTicket {
  ticket: string | null;
  mr: MrInfo;
}

/** Notas (comentarios) que tenía cada MR la última vez, para detectar las nuevas. */
export type MrNotes = Record<string, number>;

export const mrKey = (mr: MrInfo): string => `${mr.repo ?? '?'}!${mr.iid}`;

/** MRs abiertos con conflicto, pipeline caído, comentarios nuevos o sin movimiento. El primer chequeo no avisa de comentarios (no hay con qué comparar). */
export const mrNotices = (items: MrWithTicket[], previousNotes: MrNotes, now: Date, staleDays: number): { notices: Notice[]; notes: MrNotes } => {
  const notices: Notice[] = [];
  const notes: MrNotes = {};
  for (const { ticket, mr } of items) {
    if (mr.state !== 'opened') continue;
    const key = mrKey(mr);
    notes[key] = mr.notes;
    const label = `${mr.repo ?? 'repo'} !${mr.iid}${ticket ? ` (#${ticket})` : ''}`;
    const base = { kind: 'mr' as const, link: mr.url };
    if (mr.hasConflicts) notices.push({ ...base, id: `mr-conflict-${key}`, level: 'important', title: `${label} tiene conflictos`, detail: `${clip(mr.title ?? '', 90)} · hay que resolverlos con la rama destino` });
    else if (mr.pipeline?.status === 'failed') notices.push({ ...base, id: `mr-pipeline-${key}`, level: 'important', title: `${label}: el pipeline falló`, detail: clip(mr.title ?? '', 110) });
    const before = previousNotes[key];
    if (before !== undefined && mr.notes > before) notices.push({ ...base, id: `mr-notes-${key}`, level: 'important', title: `${label}: ${plural(mr.notes - before, 'comentario nuevo', 'comentarios nuevos')}`, detail: clip(mr.title ?? '', 110) });
    const idle = mr.updatedAt ? Math.floor((now.getTime() - Date.parse(mr.updatedAt)) / MS_DAY) : 0;
    if (idle >= staleDays && !mr.hasConflicts && mr.pipeline?.status !== 'failed') notices.push({ ...base, id: `mr-stale-${key}`, level: 'info', title: `${label} sin movimiento hace ${plural(idle, 'día', 'días')}`, detail: `${clip(mr.title ?? '', 90)} · ${mr.summary}` });
  }
  return { notices, notes };
};

// ---------------------------------------------------------------- 3. revisiones nuevas
export interface JournalEntry {
  user: string;
  at: string;
  notes: string;
}
export interface IssueWithJournals {
  id: number;
  title: string;
  tracker: string;
  url: string;
  /** Ticket padre (si es la subtarea de otro, por ejemplo el Control QA de un desarrollo). */
  parentId: number | null;
  journals: JournalEntry[];
}

/** Comentarios de otras personas en mis tickets (y en sus subtareas, como el Control QA) posteriores a `since`. */
export const reviewNotices = (items: IssueWithJournals[], since: string, me: string): Notice[] => {
  // Un ticket puede llegar dos veces: como mío y como subtarea de otro mío (p. ej. F1…F5 de un padre). Un solo aviso por ticket.
  const seen = new Set<number>();
  return items.flatMap((item): Notice[] => {
    if (seen.has(item.id)) return [];
    seen.add(item.id);
    const fresh = item.journals.filter((journal) => journal.at > since && journal.user !== me && journal.notes.trim());
    if (!fresh.length) return [];
    const last = fresh[fresh.length - 1]!;
    const people = [...new Set(fresh.map((journal) => journal.user))];
    const where = item.parentId ? `${item.tracker} #${item.id} (de #${item.parentId})` : `#${item.id}`;
    return [{ id: `review-${item.id}`, kind: 'review', level: 'important', title: `${people.join(', ')} comentó en ${where}`, detail: `${clip(item.title, 70)} · «${clip(plainNote(last.notes), 140)}»`, link: `${item.url}#note-${fresh.length}` }];
  });
};

// ---------------------------------------------------------------- 7. sprint
export interface Sprint {
  id: number;
  subject: string;
  /** AAAA-MM-DD */
  start: string;
  end: string;
}

/** "Sprint Semana 02/11/26 al 06/11/26" → fechas. null si el título no tiene el rango. */
export const parseSprintDates = (subject: string): { start: string; end: string } | null => {
  const match = /(\d{2})\/(\d{2})\/(\d{2,4})\s+al\s+(\d{2})\/(\d{2})\/(\d{2,4})/.exec(subject);
  if (!match) return null;
  const year = (value: string) => (value.length === 2 ? `20${value}` : value);
  return { start: `${year(match[3]!)}-${match[2]}-${match[1]}`, end: `${year(match[6]!)}-${match[5]}-${match[4]}` };
};

/**
 * Los sprints cuyo rango incluye `today`. Si hay varios tickets de tipo Sprint en esas fechas (por ejemplo uno de requerimientos de
 * otro equipo), primero los que se llaman "Sprint…" y, dentro de cada grupo, el de inicio más reciente.
 */
export const sprintsOfToday = (sprints: Array<{ id: number; subject: string }>, today: string): Sprint[] =>
  sprints
    .flatMap((sprint) => {
      const range = parseSprintDates(sprint.subject);
      return range && range.start <= today && today <= range.end ? [{ ...sprint, ...range }] : [];
    })
    .sort((a, b) => Number(/^\s*sprint\b/i.test(b.subject)) - Number(/^\s*sprint\b/i.test(a.subject)) || b.start.localeCompare(a.start) || a.id - b.id);

export const currentSprint = (sprints: Array<{ id: number; subject: string }>, today: string): Sprint | null => sprintsOfToday(sprints, today)[0] ?? null;

/**
 * Cuánto queda del sprint y cuántos SP de mis tickets del sprint están entregados de verdad (estados `approved`: Testeado, Testing
 * Consultoría, Terminado, Entregado) y cuántos siguen en revisión. Lo pendiente sigue el criterio de `doneStatuses`: un ticket en
 * revisión ya no está «pendiente» de mi lado.
 */
export const sprintNotice = (sprint: Sprint, tickets: RedmineIssue[], doneStatuses: string[], today: string, link: string, statuses: PointsStatuses = { review: ['Revisión'], approved: ['Testeado', 'Testing Consultoría', 'Terminado', 'Entregado'] }): Notice => {
  const left = Math.max(0, dayNumber(sprint.end) - dayNumber(today)) + 1;
  const points = summarizeSprintPoints(tickets, statuses);
  const pending = tickets.filter((ticket) => !statusIn(ticket.status, doneStatuses) && ticket.statusClosed !== true);
  const withoutSp = tickets.filter((ticket) => ticket.storyPoints === null).length;
  const days = left === 1 ? 'Hoy es el último día del sprint' : `Quedan ${left} días del sprint`;
  const progress = points.planned > 0 ? `${points.approved} de ${points.planned} SP entregados` : 'sin SP planificados';
  const inReview = points.review > 0 ? [`${points.review} SP en revisión`] : [];
  const parts = [progress, ...inReview, pending.length ? `pendientes: ${pending.map((ticket) => `#${ticket.id}`).join(', ')}` : points.review > 0 ? 'nada más pendiente' : 'todo entregado', ...(withoutSp ? [`${plural(withoutSp, 'ticket sin SP', 'tickets sin SP')}`] : [])];
  return { id: `sprint-${sprint.id}`, kind: 'sprint', level: left <= 1 && pending.length ? 'important' : 'info', title: days, detail: `${sprint.subject.replace(/^Sprint\s*/i, 'Sprint ')} · ${parts.join(' · ')}`, link };
};

// ---------------------------------------------------------------- feriados
export const holidayNotices = (holidays: Holiday[], today: string): Notice[] => {
  const { today: now, next } = upcomingHolidays(holidays, today, 7);
  const weekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' });
  return [
    ...(now ? [{ id: `holiday-${now.date}`, kind: 'holiday' as const, level: 'info' as const, title: `Hoy es feriado: ${now.name}`, detail: 'Día no laborable.', link: null }] : []),
    ...(next ? [{ id: `holiday-${next.holiday.date}`, kind: 'holiday' as const, level: 'info' as const, title: next.inDays === 1 ? `Mañana es feriado: ${next.holiday.name}` : `Feriado en ${next.inDays} días: ${next.holiday.name}`, detail: weekday(next.holiday.date), link: null }] : []),
  ];
};

// ---------------------------------------------------------------- 6. rutinas (al momento, sin consultar afuera)
export const routineNotices = (now: Date, config: Pick<DevPanelConfig, 'workday'>, hoursLoaded: boolean): Notice[] => {
  const notices: Notice[] = [];
  const weekday = now.getDay();
  if (weekday === 5) notices.push({ id: `routine-weekly-${dayOf(now)}`, kind: 'routine', level: 'info', title: 'Hoy es viernes: armá el resumen semanal', detail: 'En Daily podés copiar el pedido para Claude con lo que hiciste en la semana.', link: '/daily' });
  const exit = config.workday.exit;
  if (weekday >= 1 && weekday <= 5 && exit && !hoursLoaded) {
    const [hours, minutes] = exit.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() >= (hours ?? 0) * 60 + (minutes ?? 0)) notices.push({ id: `routine-hours-${dayOf(now)}`, kind: 'routine', level: 'important', title: 'Falta cargar las horas', detail: `Ya pasó tu horario de salida (${exit}) y "Cargar horas" sigue sin tildar.`, link: '/' });
  }
  return notices;
};

// ---------------------------------------------------------------- recordatorios (al momento, datos locales)
/** "02/01 10:00" (día/mes y hora local, de 24 h). */
export const dayAndTime = (date: Date): string => `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Los recordatorios que ya les toca mostrarse, como avisos: los que tienen fecha u hora son importantes, un pendiente sin fecha no. */
export const reminderNotices = (reminders: Reminder[]): Notice[] =>
  reminders.map((reminder): Notice => ({
    id: `reminder-${reminder.id}`,
    kind: 'reminder',
    level: reminder.at ? 'important' : 'info',
    title: reminder.text,
    detail: reminder.at ? `Recordatorio para ${/^\d{4}-\d{2}-\d{2}$/.test(reminder.at) ? reminder.at.split('-').reverse().join('/') : dayAndTime(new Date(reminder.at))}` : 'Recordatorio sin fecha',
    link: null,
    reminderId: reminder.id,
  }));

// ---------------------------------------------------------------- orquestador (Redmine y GitLab, solo lectura)
interface Saved {
  report: NoticesReport;
  /** Desde cuándo son "nuevos" los comentarios: la última revisión de un día anterior. */
  reviewSince: string;
  mrNotes: MrNotes;
}

const savedFile = () => join(paths.data, 'home-notices.json');
const readSaved = (): Saved | null => {
  try {
    return existsSync(savedFile()) ? (JSON.parse(readFileSync(savedFile(), 'utf8')) as Saved) : null;
  } catch {
    return null;
  }
};
const writeSaved = (saved: Saved): void => {
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(`${savedFile()}.tmp`, JSON.stringify(saved), { mode: 0o600 });
  renameSync(`${savedFile()}.tmp`, savedFile());
};

interface RawJournalItem {
  user?: { name: string };
  created_on: string;
  notes?: string;
}

const toJournals = (raw: RawJournalItem[] | undefined): JournalEntry[] => (raw ?? []).filter((journal) => journal.notes?.trim()).map((journal) => ({ user: journal.user?.name ?? '—', at: journal.created_on, notes: journal.notes! }));

export interface NoticeDeps {
  fetcher?: JsonFetcher;
  fetchMrs?: (config: DevPanelConfig) => Promise<MrWithTicket[]>;
  fetchHolidays?: (year: number) => Promise<Holiday[]>;
}

/** Los MRs de mis desarrollos (los que figuran en ticket.json de cada ticket propio), con su estado actual en GitLab. */
export const collectMrs = async (config: DevPanelConfig): Promise<MrWithTicket[]> => {
  const ignore = ignoredDirs(config);
  const tickets = listTickets(config.paths.extra, ignore).filter((item) => item.mrs > 0);
  const out: MrWithTicket[] = [];
  for (const summary of tickets) {
    const detail = getTicket(config.paths.extra, summary.dir, ignore);
    if (!detail || kindOf(getTicketState(summary.dir), detail.meta?.tipo) === 'revision') continue;
    const report = await fetchTicketMrs(config, detail.meta, true);
    if (!report.configured) throw new Error(report.tokenError ?? 'GitLab sin token');
    report.mrs.filter((mr) => !mr.error).forEach((mr) => out.push({ ticket: summary.ticket, mr }));
  }
  return out;
};

const REVIEW_MAX_ISSUES = 25;

/** Calcula todos los avisos que consultan algo afuera. Cada fuente que falla queda en `errors` y no tira abajo a las demás. */
export const computeNotices = async (config: DevPanelConfig, saved: Saved | null, now: Date, deps: NoticeDeps = {}): Promise<{ report: NoticesReport; mrNotes: MrNotes; reviewSince: string }> => {
  const today = dayOf(now);
  const fetcher = deps.fetcher ?? (fetch as unknown as JsonFetcher);
  const notices: Notice[] = [];
  const errors: NoticeError[] = [];
  const fail = (source: string, error: unknown) => errors.push({ source, message: error instanceof Error ? error.message : String(error) });
  // Los comentarios "nuevos" son los posteriores a la última revisión de un día anterior (no a la de hace un rato).
  const reviewSince = saved && saved.report.date !== today ? saved.report.generatedAt : (saved?.reviewSince ?? new Date(now.getTime() - 3 * MS_DAY).toISOString());
  const doneStatuses = config.redmine.doneStatuses;

  const credentials = loadCredentials(config);
  if ((config.home.due || config.home.reviews || config.home.sprint) && credentials) {
    try {
      await redmineNotices(config, credentials, fetcher, now, today, reviewSince, doneStatuses, notices, errors);
    } catch (error) {
      fail('Redmine', error);
    }
  } else if (config.home.due || config.home.reviews || config.home.sprint) {
    errors.push({ source: 'Redmine', message: 'Sin API key: no se revisan vencimientos, comentarios ni sprint.' });
  }

  let mrNotes = saved?.mrNotes ?? {};
  if (config.home.mrs) {
    try {
      const result = mrNotices(await (deps.fetchMrs ?? collectMrs)(config), mrNotes, now, config.home.mrStaleDays);
      notices.push(...result.notices);
      mrNotes = result.notes;
    } catch (error) {
      fail('GitLab', error);
    }
  }

  if (config.home.holidays) {
    try {
      const years = [...new Set([now.getFullYear(), new Date(now.getTime() + 7 * MS_DAY).getFullYear()])];
      const lists = await Promise.all(years.map((year) => (deps.fetchHolidays ?? holidaysOf)(year)));
      notices.push(...holidayNotices(lists.flat(), today));
    } catch (error) {
      fail('Feriados', error);
    }
  }

  const order: Record<NoticeLevel, number> = { important: 0, info: 1 };
  notices.sort((a, b) => order[a.level] - order[b.level]);
  return { report: { date: today, generatedAt: now.toISOString(), notices, errors }, mrNotes, reviewSince };
};

type Get = (path: string) => Promise<unknown>;

const makeGet = (credentials: Credentials, fetcher: JsonFetcher): Get => async (path) => {
  let response;
  try {
    response = await fetcher(`${credentials.baseUrl}${path}`, { headers: { 'X-Redmine-API-Key': credentials.key }, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new RedmineError('No se pudo conectar con Redmine', 502);
  }
  if (!response.ok) throw await httpProblem(response);
  return response.json();
};

export interface CurrentSprint {
  sprint: Sprint;
  /** Mis tickets del sprint, con sus SP. */
  tickets: RedmineIssue[];
  /** Todos los tickets relacionados al sprint (de cualquiera). */
  related: number[];
}

/** El sprint de hoy: entre los de esta fecha, el que tiene tickets míos relacionados (si ninguno, el primero). `null` si no hay. */
export const findCurrentSprint = async (get: Get, credentials: Credentials, fetcher: JsonFetcher, today: string): Promise<CurrentSprint | null> => {
  const sprints = (await get('/issues.json?tracker_id=22&status_id=*&limit=50&sort=id:desc')) as { issues?: Array<{ id: number; subject?: string }> };
  let chosen: CurrentSprint | null = null;
  for (const sprint of sprintsOfToday((sprints.issues ?? []).map((item) => ({ id: item.id, subject: item.subject ?? '' })), today).slice(0, 4)) {
    const detail = (await get(`/issues/${sprint.id}.json?include=relations`)) as { issue?: { relations?: Array<{ issue_id: number; issue_to_id: number }> } };
    const ids = [...new Set((detail.issue?.relations ?? []).flatMap((relation) => [relation.issue_id, relation.issue_to_id]).filter((id) => id !== sprint.id))];
    const tickets: RedmineIssue[] = [];
    if (ids.length) {
      const related = (await get(`/issues.json?issue_id=${ids.join(',')}&assigned_to_id=me&status_id=*&limit=100`)) as { issues?: Parameters<typeof mapIssue>[0][] };
      tickets.push(...(related.issues ?? []).map((raw) => mapIssue(raw, credentials.baseUrl)).filter((ticket) => ticket.tracker !== 'Control QA'));
      await applyStoryPoints(tickets, credentials, fetcher);
    }
    chosen ??= { sprint, tickets, related: ids };
    if (tickets.length) {
      chosen = { sprint, tickets, related: ids };
      break;
    }
  }
  return chosen;
};

export interface SprintPointsReport {
  sprint: { id: number; subject: string; start: string; end: string; url: string } | null;
  points: SprintPointsSummary | null;
  /** Estados que cuentan como entregado de verdad y como en revisión (para explicarlo en pantalla). */
  approvedStatuses: string[];
  reviewStatuses: string[];
}

/** Los SP de mis tickets del sprint actual, separados en entregados de verdad, en revisión y el resto. Solo lectura. */
export const fetchSprintPoints = async (config: DevPanelConfig, fetcher: JsonFetcher = fetch as unknown as JsonFetcher, now = new Date()): Promise<SprintPointsReport> => {
  const credentials = loadCredentials(config);
  if (!credentials) throw new RedmineError('Redmine no está configurado: falta la API key (skill redmine-drive o REDMINE_API_KEY)', 503);
  const statuses = { review: config.redmine.reviewStatuses, approved: config.redmine.approvedStatuses };
  const found = await findCurrentSprint(makeGet(credentials, fetcher), credentials, fetcher, dayOf(now));
  const base = { approvedStatuses: statuses.approved, reviewStatuses: statuses.review };
  if (!found) return { sprint: null, points: null, ...base };
  return { sprint: { ...found.sprint, url: `${credentials.baseUrl}/issues/${found.sprint.id}` }, points: summarizeSprintPoints(found.tickets, statuses), ...base };
};

const redmineNotices = async (config: DevPanelConfig, credentials: Credentials, fetcher: JsonFetcher, now: Date, today: string, since: string, doneStatuses: string[], out: Notice[], notes: NoticeError[]): Promise<void> => {
  let noSprint = false;
  const get = makeGet(credentials, fetcher);
  const me = (await get('/users/current.json')) as { user?: { id: number; firstname?: string; lastname?: string } };
  const myName = [me.user?.firstname, me.user?.lastname].filter(Boolean).join(' ');
  const listed = (await get('/issues.json?assigned_to_id=me&status_id=open&limit=100&sort=updated_on:desc')) as { issues?: Parameters<typeof mapIssue>[0][] };
  const mine = (listed.issues ?? []).map((raw) => mapIssue(raw, credentials.baseUrl));

  if (config.home.reviews) {
    const items: IssueWithJournals[] = [];
    for (const issue of mine.filter((item) => item.updatedOn > since).slice(0, REVIEW_MAX_ISSUES)) {
      const detail = (await get(`/issues/${issue.id}.json?include=journals,children`)) as { issue?: { journals?: RawJournalItem[]; children?: Array<{ id: number }> } };
      items.push({ id: issue.id, title: issue.title, tracker: issue.tracker, url: issue.url, parentId: null, journals: toJournals(detail.issue?.journals) });
      for (const child of (detail.issue?.children ?? []).slice(0, 5)) {
        const sub = (await get(`/issues/${child.id}.json?include=journals`)) as { issue?: { subject?: string; tracker?: { name: string }; journals?: RawJournalItem[] } };
        items.push({ id: child.id, title: sub.issue?.subject ?? '', tracker: sub.issue?.tracker?.name ?? 'Ticket', url: `${credentials.baseUrl}/issues/${child.id}`, parentId: issue.id, journals: toJournals(sub.issue?.journals) });
      }
    }
    out.push(...reviewNotices(items, since, myName));
  }

  // El sprint actual hace falta para los vencimientos (solo los de este sprint) y para el aviso del sprint.
  let sprintIds: Set<number> | null = null;
  if (config.home.sprint || config.home.due) {
    const chosen = await findCurrentSprint(get, credentials, fetcher, today);
    if (chosen) {
      sprintIds = new Set(chosen.related);
      if (config.home.sprint) out.push(sprintNotice(chosen.sprint, chosen.tickets, doneStatuses, today, `${credentials.baseUrl}/issues/${chosen.sprint.id}`, { review: config.redmine.reviewStatuses, approved: config.redmine.approvedStatuses }));
    } else if (config.home.due) {
      noSprint = true;
    }
  }

  if (config.home.due) {
    if (noSprint) notes.push({ source: 'Vencimientos', message: 'No se encontró el sprint actual: sin él no se avisan vencimientos (solo cuentan los tickets del sprint).' });
    else out.push(...dueNotices(mine, today, config.home.dueDays, doneStatuses, sprintIds));
  }
};

/**
 * Los avisos del día: lo guardado si ya se revisó hoy (salvo `refresh`) o una revisión nueva, que se guarda. Los avisos de rutina
 * no se guardan: dependen de la hora y de lo que se tildó, y no consultan nada afuera.
 */
export const getNotices = async (config: DevPanelConfig, options: { refresh?: boolean; hoursLoaded?: boolean } = {}, now = new Date(), deps: NoticeDeps = {}): Promise<NoticesReport & { routines: Notice[]; fromCache: boolean }> => {
  const saved = readSaved();
  const routines = config.home.routines ? routineNotices(now, config, options.hoursLoaded === true) : [];
  if (saved && saved.report.date === dayOf(now) && !options.refresh) return { ...saved.report, routines, fromCache: true };
  const result = await computeNotices(config, saved, now, deps);
  writeSaved({ report: result.report, reviewSince: result.reviewSince, mrNotes: result.mrNotes });
  return { ...result.report, routines, fromCache: false };
};

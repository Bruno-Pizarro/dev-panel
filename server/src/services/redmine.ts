import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { paths } from '../config.js';

export class RedmineError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export interface RedmineNote {
  user: string;
  date: string;
  notes: string;
}

export interface RedmineIssue {
  id: number;
  url: string;
  subject: string;
  /** Título sin los prefijos "[5 SP]" y "[Módulo : X]". */
  title: string;
  storyPoints: number | null;
  module: string | null;
  status: string;
  statusClosed: boolean | null;
  tracker: string;
  priority: string;
  project: string;
  author: string | null;
  assignedTo: string | null;
  startDate: string | null;
  dueDate: string | null;
  doneRatio: number;
  estimatedHours: number | null;
  spentHours: number | null;
  createdOn: string;
  updatedOn: string;
  closedOn: string | null;
  relations: number;
  lastNotes: RedmineNote[];
}

interface RawIssue {
  id: number;
  subject?: string;
  project?: { name: string };
  tracker?: { name: string };
  status?: { name: string; is_closed?: boolean };
  priority?: { name: string };
  author?: { name: string };
  assigned_to?: { name: string };
  start_date?: string | null;
  due_date?: string | null;
  done_ratio?: number;
  estimated_hours?: number | null;
  spent_hours?: number | null;
  created_on?: string;
  updated_on?: string;
  closed_on?: string | null;
  relations?: unknown[];
  journals?: Array<{ user?: { name: string }; created_on: string; notes?: string }>;
}

/** "[5 SP] [Módulo : Legajo Digital] Pestaña…" → SP, módulo y título limpio. */
export const parseSubject = (subject: string): { storyPoints: number | null; module: string | null; title: string } => {
  const sp = /\[\s*(\d+)\s*SP\s*\]/i.exec(subject);
  const module = /\[\s*M[óo]dulo\s*:\s*([^\]]+?)\s*\]/i.exec(subject);
  const title = subject.replace(/\[\s*\d+\s*SP\s*\]/i, '').replace(/\[\s*M[óo]dulo\s*:[^\]]*\]/i, '').replace(/\s+/g, ' ').trim();
  return { storyPoints: sp ? Number(sp[1]) : null, module: module?.[1] ?? null, title: title || subject };
};

export const mapIssue = (raw: RawIssue, baseUrl: string, closedStatuses: Set<string> | null = null): RedmineIssue => {
  const subject = raw.subject ?? '';
  const parsed = parseSubject(subject);
  const status = raw.status?.name ?? '—';
  return {
    id: raw.id,
    url: `${baseUrl}/issues/${raw.id}`,
    subject,
    ...parsed,
    status,
    statusClosed: raw.status?.is_closed ?? (closedStatuses ? closedStatuses.has(status) : null),
    tracker: raw.tracker?.name ?? '—',
    priority: raw.priority?.name ?? '—',
    project: raw.project?.name ?? '—',
    author: raw.author?.name ?? null,
    assignedTo: raw.assigned_to?.name ?? null,
    startDate: raw.start_date ?? null,
    dueDate: raw.due_date ?? null,
    doneRatio: raw.done_ratio ?? 0,
    estimatedHours: raw.estimated_hours ?? null,
    spentHours: raw.spent_hours ?? null,
    createdOn: raw.created_on ?? '',
    updatedOn: raw.updated_on ?? '',
    closedOn: raw.closed_on ?? null,
    relations: raw.relations?.length ?? 0,
    lastNotes: (raw.journals ?? [])
      .filter((journal) => journal.notes?.trim())
      .slice(-3)
      .map((journal) => ({ user: journal.user?.name ?? '—', date: journal.created_on, notes: journal.notes!.trim().slice(0, 400) })),
  };
};

// ---------------------------------------------------------------- story points (plugin Agile)
interface SpCacheEntry {
  updatedOn: string;
  sp: number | null;
}
const spCacheFile = () => join(paths.data, 'sp-cache.json');
const loadSpCache = (): Record<string, SpCacheEntry> => {
  try {
    return existsSync(spCacheFile()) ? (JSON.parse(readFileSync(spCacheFile(), 'utf8')) as Record<string, SpCacheEntry>) : {};
  } catch {
    return {};
  }
};
const SP_PARALLEL = 4;

/**
 * Los story points no vienen en `/issues.json`: los guarda el plugin Agile y salen de `/issues/<id>/agile_data.json`.
 * Se piden una sola vez por ticket y versión (`updated_on`): mientras el ticket no cambie, se reutiliza lo guardado.
 * Si el endpoint no existe o falla, queda el valor del título "[N SP]" (si lo hay).
 */
export const applyStoryPoints = async (issues: RedmineIssue[], credentials: Credentials, fetcher: JsonFetcher): Promise<void> => {
  const cache = loadSpCache();
  const pending = issues.filter((issue) => cache[String(issue.id)]?.updatedOn !== issue.updatedOn);
  let changed = false;
  const queue = [...pending];
  await Promise.all(
    Array.from({ length: SP_PARALLEL }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          const response = await fetcher(`${credentials.baseUrl}/issues/${next.id}/agile_data.json`, { headers: { 'X-Redmine-API-Key': credentials.key }, signal: AbortSignal.timeout(15_000) });
          if (!response.ok) continue;
          const body = (await response.json()) as { agile_data?: { story_points?: unknown } };
          const value = body.agile_data?.story_points;
          if (body.agile_data === undefined) continue;
          cache[String(next.id)] = { updatedOn: next.updatedOn, sp: typeof value === 'number' ? value : null };
          changed = true;
        } catch {
          /* sin dato: se usa el del título */
        }
      }
    }),
  );
  if (changed) {
    mkdirSync(paths.data, { recursive: true });
    writeFileSync(spCacheFile(), JSON.stringify(cache), { mode: 0o600 });
  }
  for (const issue of issues) {
    const entry = cache[String(issue.id)];
    if (entry && entry.sp !== null) issue.storyPoints = entry.sp;
  }
};

/** Traduce una respuesta que no es 2xx. Solo un 401/403 con JSON es una key rechazada; un 403 con HTML (proxy) o un 5xx es el servidor caído o bloqueando. */
export const httpProblem = async (response: { status: number; headers?: { get: (name: string) => string | null }; json?: () => Promise<unknown> }, id?: string): Promise<RedmineError> => {
  const type = response.headers?.get('content-type') ?? '';
  if (response.status === 404) return new RedmineError(id ? `El ticket #${id} no existe en Redmine` : 'No se encontró en Redmine', 404);
  if ((response.status === 401 || response.status === 403) && (type.includes('json') || response.headers === undefined)) return new RedmineError('Redmine rechazó la API key o no tiene permiso para ver el ticket', 403);
  if (response.status === 401 || response.status === 403) return new RedmineError('Redmine bloqueó el pedido (respuesta 403 de su servidor, no de la API key). Puede estar caído o limitando el acceso: probá más tarde', 503);
  if (response.status >= 500) return new RedmineError(`Redmine no está disponible (error ${response.status}). Probá más tarde`, 503);
  return new RedmineError(`Redmine respondió ${response.status}`, 502);
};

export interface Credentials {
  key: string;
  baseUrl: string;
}

const DEFAULT_URL = 'https://redmine.icono-cloud.com';

/** Busca la API key sin copiarla a ningún lado: variable de entorno o el config.json de la skill redmine-drive. */
export const loadCredentials = (config: DevPanelConfig, env: NodeJS.ProcessEnv = process.env): Credentials | null => {
  if (!config.redmine.enabled) return null;
  let key = env['REDMINE_API_KEY'] ?? '';
  let baseUrl = config.redmine.baseUrl || env['REDMINE_URL'] || '';
  if (!key || !baseUrl) {
    const file = config.redmine.configFile || join(homedir(), '.claude', 'skills', 'redmine-drive', 'config.json');
    if (existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as { api_key?: string; redmine_url?: string };
        key = key || data.api_key || '';
        baseUrl = baseUrl || data.redmine_url || '';
      } catch {
        /* archivo ilegible: queda sin configurar */
      }
    }
  }
  return key ? { key, baseUrl: (baseUrl || DEFAULT_URL).replace(/\/$/, '') } : null;
};

/** URL base de Redmine (para armar enlaces a tickets); no necesita la API key. */
export const redmineBaseUrl = (config: DevPanelConfig, env: NodeJS.ProcessEnv = process.env): string => {
  let baseUrl = config.redmine.baseUrl || env['REDMINE_URL'] || '';
  if (!baseUrl) {
    const file = config.redmine.configFile || join(homedir(), '.claude', 'skills', 'redmine-drive', 'config.json');
    try {
      baseUrl = existsSync(file) ? ((JSON.parse(readFileSync(file, 'utf8')) as { redmine_url?: string }).redmine_url ?? '') : '';
    } catch {
      baseUrl = '';
    }
  }
  return (baseUrl || DEFAULT_URL).replace(/\/$/, '');
};

export const ticketUrl = (config: DevPanelConfig, ticket: string): string => `${redmineBaseUrl(config)}/issues/${ticket}`;

type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; headers?: { get: (name: string) => string | null }; json: () => Promise<unknown> }>;

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; issue: RedmineIssue }>();

export const clearRedmineCache = (): void => cache.clear();

export const fetchIssue = async (config: DevPanelConfig, id: string, fetcher: Fetcher = fetch as unknown as Fetcher, now = Date.now()): Promise<RedmineIssue> => {
  if (!/^\d{3,6}$/.test(id)) throw new RedmineError('Número de ticket inválido', 400);
  const credentials = loadCredentials(config);
  if (!credentials) throw new RedmineError('Redmine no está configurado: falta la API key (skill redmine-drive o REDMINE_API_KEY)', 503);
  const cached = cache.get(`${credentials.baseUrl}#${id}`);
  if (cached && now - cached.at < CACHE_MS) return cached.issue;

  let response;
  try {
    response = await fetcher(`${credentials.baseUrl}/issues/${id}.json?include=journals,relations`, { headers: { 'X-Redmine-API-Key': credentials.key }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new RedmineError('No se pudo conectar con Redmine', 502);
  }
  if (!response.ok) throw await httpProblem(response, id);
  const body = (await response.json()) as { issue?: RawIssue };
  if (!body.issue) throw new RedmineError('Respuesta inesperada de Redmine', 502);
  const issue = mapIssue(body.issue, credentials.baseUrl);
  await applyStoryPoints([issue], credentials, fetcher as unknown as JsonFetcher);
  cache.set(`${credentials.baseUrl}#${id}`, { at: now, issue });
  return issue;
};

// ---------------------------------------------------------------- kanban
export interface BoardStatus {
  id: number;
  name: string;
  closed: boolean;
}
export interface Board {
  /** Siempre los asignados a quien dueña la API key: el panel no trae tickets de otras personas. */
  scope: 'me';
  days: number;
  statuses: BoardStatus[];
  issues: RedmineIssue[];
  truncated: boolean;
  fetchedAt: string;
}

/** Orden de las columnas según el flujo del equipo; los estados que no figuren van al final, en el orden de Redmine. */
export const COLUMN_ORDER = ['Análisis', 'Req. Definido', 'Estimación', 'Ampliación', 'Desarrollo', 'Commit', 'Revisión', 'Testeado', 'Testing Consultoría', 'Testing Consultoría Externo', 'Testing Aprobado Consultoría', 'Terminado', 'Entregado', 'Rechazado', 'Baja'];

export const orderStatuses = (statuses: BoardStatus[]): BoardStatus[] => {
  const rank = (status: BoardStatus) => {
    const index = COLUMN_ORDER.indexOf(status.name);
    return index === -1 ? COLUMN_ORDER.length + status.id : index;
  };
  return [...statuses].sort((a, b) => rank(a) - rank(b));
};

const PAGE = 50;
const MAX_PAGES = 2;
export const MAX_BOARD_DAYS = 60;
const boardCache = new Map<string, { at: number; board: Board }>();
export const clearBoardCache = (): void => boardCache.clear();

type JsonFetcher = Fetcher;

/** Mis tickets (asignados a quien dueña la API key) con cambios en los últimos `days` días. Solo lectura, y acotado: máximo 100 tickets y 60 días. */
export const fetchBoard = async (config: DevPanelConfig, days: number, fetcher: JsonFetcher = fetch as unknown as JsonFetcher, now = Date.now()): Promise<Board> => {
  const credentials = loadCredentials(config);
  if (!credentials) throw new RedmineError('Redmine no está configurado: falta la API key (skill redmine-drive o REDMINE_API_KEY)', 503);
  const safeDays = Math.min(MAX_BOARD_DAYS, Math.max(1, Math.round(days)));
  const cacheKey = `${credentials.baseUrl}#me#${safeDays}`;
  const cached = boardCache.get(cacheKey);
  if (cached && now - cached.at < CACHE_MS) return cached.board;

  const get = async (path: string): Promise<unknown> => {
    let response;
    try {
      response = await fetcher(`${credentials.baseUrl}${path}`, { headers: { 'X-Redmine-API-Key': credentials.key }, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new RedmineError('No se pudo conectar con Redmine', 502);
    }
    if (!response.ok) throw await httpProblem(response);
    return response.json();
  };

  const statusBody = (await get('/issue_statuses.json')) as { issue_statuses?: Array<{ id: number; name: string; is_closed?: boolean }> };
  const statuses = (statusBody.issue_statuses ?? []).map((status) => ({ id: status.id, name: status.name, closed: status.is_closed === true }));
  const closedNames = new Set(statuses.filter((status) => status.closed).map((status) => status.name));

  const since = new Date(now - safeDays * 86_400_000).toISOString().slice(0, 10);
  const issues: RedmineIssue[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ status_id: '*', updated_on: `>=${since}`, sort: 'updated_on:desc', limit: String(PAGE), offset: String(page * PAGE) });
    query.set('assigned_to_id', 'me');
    const body = (await get(`/issues.json?${query.toString()}`)) as { issues?: RawIssue[]; total_count?: number };
    issues.push(...(body.issues ?? []).map((raw) => mapIssue(raw, credentials.baseUrl, closedNames)));
    if (issues.length >= (body.total_count ?? 0)) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  await applyStoryPoints(issues, credentials, fetcher);
  const board: Board = { scope: 'me', days: safeDays, statuses: orderStatuses(statuses), issues, truncated, fetchedAt: new Date(now).toISOString() };
  boardCache.set(cacheKey, { at: now, board });
  return board;
};

// ---------------------------------------------------------------- historial semanal de story points
export interface SpWeek {
  /** Lunes de la semana, AAAA-MM-DD (hora local). */
  weekStart: string;
  sp: number;
  /** `sp: null` = el título no trae "[N SP]": se entregó pero no se puede sumar. */
  tickets: Array<{ id: number; title: string; sp: number | null; at: string }>;
  /** Entregados sin SP en el título. */
  withoutSp: number;
}
export interface SpHistory {
  weeks: SpWeek[];
  /** Promedio de las 4 semanas (incluida la actual, que está en curso). */
  average: number;
  /** Promedio de las semanas ya terminadas (sin la actual). */
  averageClosed: number | null;
  doneStatuses: string[];
  source: 'redmine' | 'saved';
  generatedAt: string;
}

export const WEEKS = 4;
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Lunes (00:00 local) de la semana de `date`. */
export const mondayOf = (date: Date): Date => {
  const day = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - day);
};

export interface Delivery {
  id: number;
  title: string;
  sp: number | null;
  /** ISO del primer cambio a un estado "entregado". */
  at: string;
}

/** Reparte las entregas en las últimas 4 semanas (la más reciente primero) y calcula los promedios. */
export const buildSpHistory = (deliveries: Delivery[], doneStatuses: string[], source: SpHistory['source'], now = new Date()): SpHistory => {
  const current = mondayOf(now);
  const weeks: SpWeek[] = Array.from({ length: WEEKS }, (_, i) => ({ weekStart: dayKey(new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7 * i)), sp: 0, tickets: [], withoutSp: 0 }));
  for (const delivery of deliveries) {
    const week = weeks.find((item) => dayKey(mondayOf(new Date(delivery.at))) === item.weekStart);
    if (!week) continue;
    week.tickets.push({ id: delivery.id, title: delivery.title, sp: delivery.sp, at: delivery.at });
    if (delivery.sp === null) week.withoutSp += 1;
    else week.sp += delivery.sp;
  }
  weeks.forEach((week) => week.tickets.sort((a, b) => b.at.localeCompare(a.at)));
  const total = weeks.reduce((sum, week) => sum + week.sp, 0);
  const closed = weeks.slice(1);
  return {
    weeks,
    average: Math.round((total / WEEKS) * 10) / 10,
    averageClosed: closed.length ? Math.round((closed.reduce((sum, week) => sum + week.sp, 0) / closed.length) * 10) / 10 : null,
    doneStatuses,
    source,
    generatedAt: now.toISOString(),
  };
};

interface RawJournal {
  created_on: string;
  details?: Array<{ property?: string; name?: string; new_value?: string }>;
}

/** Fecha del primer cambio de estado a alguno de `doneIds` en el historial de un ticket (o null). */
export const firstDelivery = (journals: RawJournal[], doneIds: Set<string>): string | null => {
  const times = journals
    .filter((journal) => journal.details?.some((detail) => detail.property === 'attr' && detail.name === 'status_id' && detail.new_value !== undefined && doneIds.has(detail.new_value)))
    .map((journal) => journal.created_on)
    .sort();
  return times[0] ?? null;
};

const historyFile = () => join(paths.data, 'sp-history.json');
const readSaved = (): SpHistory | null => {
  try {
    return existsSync(historyFile()) ? (JSON.parse(readFileSync(historyFile(), 'utf8')) as SpHistory) : null;
  } catch {
    return null;
  }
};

const MIN_PARALLEL = 4;
let memo: { at: number; value: SpHistory } | null = null;
const MEMO_MS = 10 * 60_000;
export const clearSpMemo = (): void => {
  memo = null;
};

/**
 * Story points entregados por semana, de mis tickets (asignados a quien dueña la API key). Se lee el historial de cambios de
 * estado de cada ticket tocado en las últimas semanas, así el resultado es retroactivo. Se guarda en data/ y, si Redmine no
 * responde, se devuelve lo guardado. Solo lectura.
 */
export const fetchSpHistory = async (config: DevPanelConfig, fetcher: JsonFetcher = fetch as unknown as JsonFetcher, now = new Date()): Promise<SpHistory> => {
  if (memo && now.getTime() - memo.at < MEMO_MS) return memo.value;
  const credentials = loadCredentials(config);
  if (!credentials) throw new RedmineError('Redmine no está configurado: falta la API key (skill redmine-drive o REDMINE_API_KEY)', 503);
  const doneStatuses = config.redmine.doneStatuses;
  try {
    const get = async (path: string): Promise<unknown> => {
      const response = await fetcher(`${credentials.baseUrl}${path}`, { headers: { 'X-Redmine-API-Key': credentials.key }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw await httpProblem(response);
      return response.json();
    };
    const statusBody = (await get('/issue_statuses.json')) as { issue_statuses?: Array<{ id: number; name: string }> };
    const doneIds = new Set((statusBody.issue_statuses ?? []).filter((status) => doneStatuses.includes(status.name)).map((status) => String(status.id)));
    const since = dayKey(new Date(mondayOf(now).getTime() - (WEEKS - 1) * 7 * 86_400_000 - 86_400_000));
    const query = new URLSearchParams({ assigned_to_id: 'me', status_id: '*', updated_on: `>=${since}`, limit: '100', sort: 'updated_on:desc' });
    const list = (await get(`/issues.json?${query.toString()}`)) as { issues?: RawIssue[] };
    const issues = list.issues ?? [];
    const mapped = issues.map((raw) => mapIssue(raw, credentials.baseUrl));
    await applyStoryPoints(mapped, credentials, fetcher);
    const spOf = new Map(mapped.map((issue) => [issue.id, issue.storyPoints]));

    const deliveries: Delivery[] = [];
    const queue = [...issues];
    await Promise.all(
      Array.from({ length: MIN_PARALLEL }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const detail = (await get(`/issues/${next.id}.json?include=journals`)) as { issue?: { journals?: RawJournal[] } };
          const at = firstDelivery(detail.issue?.journals ?? [], doneIds);
          const parsed = parseSubject(next.subject ?? '');
          if (at) deliveries.push({ id: next.id, title: parsed.title, sp: spOf.get(next.id) ?? parsed.storyPoints, at });
        }
      }),
    );
    const history = buildSpHistory(deliveries, doneStatuses, 'redmine', now);
    mkdirSync(paths.data, { recursive: true });
    writeFileSync(historyFile(), JSON.stringify(history, null, 2), { mode: 0o600 });
    memo = { at: now.getTime(), value: history };
    return history;
  } catch (error) {
    const saved = readSaved();
    if (saved) return { ...saved, source: 'saved' };
    throw error instanceof RedmineError ? error : new RedmineError('No se pudo conectar con Redmine', 502);
  }
};

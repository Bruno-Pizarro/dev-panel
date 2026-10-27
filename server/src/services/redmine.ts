import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';

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

type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

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
  if (response.status === 404) throw new RedmineError(`El ticket #${id} no existe en Redmine`, 404);
  if (response.status === 401 || response.status === 403) throw new RedmineError('Redmine rechazó la API key o no tiene permiso para ver el ticket', 403);
  if (!response.ok) throw new RedmineError(`Redmine respondió ${response.status}`, 502);
  const body = (await response.json()) as { issue?: RawIssue };
  if (!body.issue) throw new RedmineError('Respuesta inesperada de Redmine', 502);
  const issue = mapIssue(body.issue, credentials.baseUrl);
  cache.set(`${credentials.baseUrl}#${id}`, { at: now, issue });
  return issue;
};

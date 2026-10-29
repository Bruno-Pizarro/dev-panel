import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import type { Level } from './ticketStatus.js';
import type { TicketMeta } from './tickets.js';

export class GitlabError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

/** Token sin copiarlo a ningún lado: variable de entorno o `gitlab.token` del config.json local. */
export const gitlabToken = (config: DevPanelConfig, env: NodeJS.ProcessEnv = process.env): string | null => env['GITLAB_TOKEN'] || config.gitlab.token || null;

// ---------------------------------------------------------------- token de 1 día pedido por SSH
/** "Token:   glpat-xxx.01.yyy" (los tokens nuevos llevan puntos: se toma toda la palabra, no un patrón). */
export const parseSshToken = (output: string): string | null => /^Token:\s+(\S+)/m.exec(output)?.[1] ?? null;

interface SshToken {
  value: string;
  at: number;
}
let sshToken: SshToken | null = null;
let lastMintFailure = 0;
/** Se reutiliza menos de lo que dura el token (1 día) y, tras una falla, no se reintenta enseguida (para no crear tokens en cadena). */
const SSH_TOKEN_TTL_MS = 12 * 3_600_000;
const SSH_RETRY_MS = 5 * 60_000;
export const clearSshToken = (): void => {
  sshToken = null;
  lastMintFailure = 0;
};

/** Pide a GitLab, por SSH, un token `read_api` de 1 día. Devuelve el token o lanza con un mensaje para mostrar. */
export const mintSshToken = async (config: DevPanelConfig, runner: Runner = run, now = Date.now()): Promise<string> => {
  if (now - lastMintFailure < SSH_RETRY_MS && lastMintFailure > 0) throw new GitlabError('No se pudo pedir el token por SSH hace un momento; se reintenta en unos minutos', 502);
  const host = config.gitlab.sshHost || new URL(config.gitlab.baseUrl).hostname;
  const result = await runner('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', `git@${host}`, 'personal_access_token', 'dev-panel', 'read_api', '1'], 30_000);
  const value = parseSshToken(`${result.stdout}\n${result.stderr}`);
  if (!result.ok || !value) {
    lastMintFailure = now;
    throw new GitlabError(`No se pudo pedir un token por SSH a ${host} (¿clave SSH cargada y sin passphrase?)`, 502);
  }
  sshToken = { value, at: now };
  lastMintFailure = 0;
  return value;
};

/** Token vigente: el fijo (variable o config) manda; si no, el pedido por SSH (si está habilitado), reutilizado mientras dure. */
const resolveToken = async (config: DevPanelConfig, env: NodeJS.ProcessEnv, runner: Runner, now: number): Promise<{ token: string | null; fixed: boolean; error: string | null }> => {
  const fixed = gitlabToken(config, env);
  if (fixed) return { token: fixed, fixed: true, error: null };
  if (!config.gitlab.sshAuto) return { token: null, fixed: false, error: null };
  if (sshToken && now - sshToken.at < SSH_TOKEN_TTL_MS) return { token: sshToken.value, fixed: false, error: null };
  try {
    return { token: await mintSshToken(config, runner, now), fixed: false, error: null };
  } catch (error) {
    return { token: null, fixed: false, error: (error as Error).message };
  }
};

export interface MrRef {
  repo: string | null;
  iid: number;
  /** "grupo/repo" tal como lo usa la API de GitLab. */
  project: string;
  /** Posición en el orden de merge (0 = primero). */
  order: number;
}

/**
 * Del MR de ticket.json se saca solo la ruta del proyecto: las llamadas van SIEMPRE al servidor configurado, así una URL
 * ajena en el archivo no puede hacer que el token viaje a otro host.
 */
export const projectOfMr = (config: DevPanelConfig, mr: { repo?: string | undefined; iid?: number | undefined; url?: string | undefined }): { project: string; iid: number } | null => {
  const fromUrl = mr.url ? /^(https?:\/\/[^/]+)\/(.+?)\/-\/merge_requests\/(\d+)/.exec(mr.url) : null;
  if (fromUrl && new URL(config.gitlab.baseUrl).host === new URL(fromUrl[1]!).host) return { project: fromUrl[2]!, iid: Number(fromUrl[3]) };
  if (mr.repo && mr.iid && /^[A-Za-z0-9._-]+$/.test(mr.repo)) return { project: `${config.gitlab.group}/${mr.repo}`, iid: mr.iid };
  return null;
};

/** Backends antes que el front (el front consume sus endpoints); `ordenMerge` de ticket.json manda si existe. */
export const mergeOrder = (repos: string[], explicit: string[] | undefined): string[] => {
  const unique = [...new Set(repos)];
  if (explicit?.length) {
    const known = explicit.filter((repo) => unique.includes(repo));
    return [...known, ...unique.filter((repo) => !known.includes(repo)).sort()];
  }
  return [...unique.filter((repo) => repo !== 'front').sort(), ...unique.filter((repo) => repo === 'front')];
};

export const refsForTicket = (config: DevPanelConfig, meta: TicketMeta | null): MrRef[] => {
  const order = mergeOrder((meta?.mrs ?? []).flatMap((mr) => (mr.repo ? [mr.repo] : [])), meta?.ordenMerge);
  return (meta?.mrs ?? []).flatMap((mr) => {
    const found = projectOfMr(config, mr);
    return found ? [{ repo: mr.repo ?? null, ...found, order: mr.repo ? order.indexOf(mr.repo) : order.length }] : [];
  });
};

export interface MrInfo {
  repo: string | null;
  iid: number;
  order: number;
  title: string | null;
  url: string | null;
  state: string | null;
  draft: boolean;
  sourceBranch: string | null;
  targetBranch: string | null;
  mergeStatus: string | null;
  hasConflicts: boolean;
  /** null = GitLab no lo informa. */
  discussionsResolved: boolean | null;
  notes: number;
  pipeline: { status: string; url: string | null } | null;
  updatedAt: string | null;
  level: Level;
  /** Qué mirar, en una línea. */
  summary: string;
  error: string | null;
}

interface RawMr {
  title?: string;
  web_url?: string;
  state?: string;
  draft?: boolean;
  work_in_progress?: boolean;
  source_branch?: string;
  target_branch?: string;
  detailed_merge_status?: string;
  merge_status?: string;
  has_conflicts?: boolean;
  blocking_discussions_resolved?: boolean | null;
  user_notes_count?: number;
  head_pipeline?: { status?: string; web_url?: string } | null;
  pipeline?: { status?: string; web_url?: string } | null;
  updated_at?: string;
}

const PIPELINE_RUNNING = new Set(['running', 'pending', 'created', 'waiting_for_resource', 'preparing', 'scheduled']);

export const mapMr = (ref: MrRef, raw: RawMr): MrInfo => {
  const state = raw.state ?? null;
  const pipelineRaw = raw.head_pipeline ?? raw.pipeline ?? null;
  const pipeline = pipelineRaw?.status ? { status: pipelineRaw.status, url: pipelineRaw.web_url ?? null } : null;
  const mergeStatus = raw.detailed_merge_status ?? raw.merge_status ?? null;
  const draft = raw.draft ?? raw.work_in_progress ?? false;
  const hasConflicts = raw.has_conflicts === true;
  const discussionsResolved = raw.blocking_discussions_resolved ?? null;

  let level: Level = 'ok';
  let summary = 'Listo para mergear';
  if (state === 'merged') ({ level, summary } = { level: 'ok', summary: 'Ya mergeado' });
  else if (state === 'closed') ({ level, summary } = { level: 'idle', summary: 'Cerrado sin mergear' });
  else if (hasConflicts) ({ level, summary } = { level: 'error', summary: 'Tiene conflictos con la rama destino' });
  else if (pipeline?.status === 'failed') ({ level, summary } = { level: 'error', summary: 'El pipeline falló' });
  else if (discussionsResolved === false) ({ level, summary } = { level: 'warn', summary: 'Hay discusiones sin resolver' });
  else if (draft) ({ level, summary } = { level: 'warn', summary: 'Está en borrador (draft)' });
  else if (pipeline && PIPELINE_RUNNING.has(pipeline.status)) ({ level, summary } = { level: 'warn', summary: `Pipeline ${pipeline.status}` });
  else if (mergeStatus && !['mergeable', 'can_be_merged', 'unchecked', 'checking'].includes(mergeStatus)) ({ level, summary } = { level: 'warn', summary: `GitLab no deja mergear: ${mergeStatus.replace(/_/g, ' ')}` });

  return {
    repo: ref.repo,
    iid: ref.iid,
    order: ref.order,
    title: raw.title ?? null,
    url: raw.web_url ?? null,
    state,
    draft,
    sourceBranch: raw.source_branch ?? null,
    targetBranch: raw.target_branch ?? null,
    mergeStatus,
    hasConflicts,
    discussionsResolved,
    notes: raw.user_notes_count ?? 0,
    pipeline,
    updatedAt: raw.updated_at ?? null,
    level,
    summary,
    error: null,
  };
};

export type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const cache = new Map<string, { at: number; value: MrInfo }>();
const TTL_MS = 30_000;
export const clearGitlabCache = (): void => cache.clear();

export interface MrReport {
  configured: boolean;
  baseUrl: string;
  /** Por qué no hay token aunque `sshAuto` esté activo. */
  tokenError: string | null;
  mrs: MrInfo[];
}

/** Estado de cada MR del ticket. Una falla en uno (404, sin permiso) no tira los demás: queda como error de esa fila. */
export const fetchTicketMrs = async (config: DevPanelConfig, meta: TicketMeta | null, fresh = false, fetcher: Fetcher = fetch as unknown as Fetcher, now = Date.now(), env: NodeJS.ProcessEnv = process.env, runner: Runner = run): Promise<MrReport> => {
  const baseUrl = config.gitlab.baseUrl.replace(/\/$/, '');
  const resolved = config.gitlab.enabled ? await resolveToken(config, env, runner, now) : { token: null, fixed: false, error: null };
  let token = resolved.token;
  if (!token) return { configured: false, baseUrl, tokenError: resolved.error, mrs: [] };
  const get = async (url: string, current: string) => fetcher(url, { headers: { 'PRIVATE-TOKEN': current }, signal: AbortSignal.timeout(15_000) });
  const mrs = await Promise.all(
    refsForTicket(config, meta).map(async (ref): Promise<MrInfo> => {
      const key = `${ref.project}!${ref.iid}`;
      const hit = cache.get(key);
      if (!fresh && hit && now - hit.at < TTL_MS) return { ...hit.value, order: ref.order };
      try {
        const url = `${baseUrl}/api/v4/projects/${encodeURIComponent(ref.project)}/merge_requests/${ref.iid}`;
        let response = await get(url, token!);
        // El de SSH vence: si GitLab lo rechaza, se pide uno nuevo una sola vez y se reintenta.
        if (response.status === 401 && !resolved.fixed && config.gitlab.sshAuto) {
          clearSshToken();
          token = await mintSshToken(config, runner, now);
          response = await get(url, token);
        }
        if (response.status === 401) throw new GitlabError('GitLab rechazó el token (vencido o sin permiso read_api)', 401);
        if (!response.ok) throw new GitlabError(response.status === 404 ? 'No existe o el token no lo ve' : `GitLab respondió ${response.status}`, response.status);
        const value = mapMr(ref, (await response.json()) as RawMr);
        cache.set(key, { at: now, value });
        return value;
      } catch (error) {
        const message = error instanceof GitlabError ? error.message : 'No se pudo conectar con GitLab';
        return { repo: ref.repo, iid: ref.iid, order: ref.order, title: null, url: null, state: null, draft: false, sourceBranch: null, targetBranch: null, mergeStatus: null, hasConflicts: false, discussionsResolved: null, notes: 0, pipeline: null, updatedAt: null, level: 'error', summary: message, error: message };
      }
    }),
  );
  return { configured: true, baseUrl, tokenError: null, mrs: mrs.sort((a, b) => a.order - b.order || a.iid - b.iid) };
};

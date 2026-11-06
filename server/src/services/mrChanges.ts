import { createHash } from 'node:crypto';
import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { viewedStateOf, type ViewedMap } from './changeReview.js';
import { GitlabError, clearSshToken, mintSshToken, refsForTicket, resolveToken, type Fetcher, type MrRef } from './gitlab.js';
import { limitDiff, viewedProgress, type ChangedFile, type FileDiff, type RepoChanges, type ViewedProgress } from './ticketChanges.js';
import type { TicketMeta } from './tickets.js';
import { viewKey } from './changeReview.js';

/**
 * Cambios de los MRs de un ticket leídos de GitLab (solo lectura), con la misma forma que los cambios locales para reusar el
 * visor: sirve para revisar el desarrollo de otra persona sin tener su rama en esta máquina. Cada MR figura como un "repo"
 * llamado "<repo> !<iid>". La huella de cada archivo es el hash de su diff: si suben otro commit que lo toca, la marca de
 * "visto" deja de valer.
 */
interface RawChange {
  old_path?: string;
  new_path?: string;
  new_file?: boolean;
  deleted_file?: boolean;
  renamed_file?: boolean;
  diff?: string;
}
interface RawChanges {
  title?: string;
  source_branch?: string;
  target_branch?: string;
  changes?: RawChange[];
  overflow?: boolean;
  /** Commits del MR: `head_sha` es el último, el que se ve en los cambios. */
  diff_refs?: { head_sha?: string };
}

export const mrLabel = (ref: Pick<MrRef, 'repo' | 'project' | 'iid'>): string => `${ref.repo ?? ref.project.split('/').pop()} !${ref.iid}`;

const countLines = (diff: string): { added: number; deleted: number } => {
  let added = 0;
  let deleted = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+')) added += 1;
    else if (line.startsWith('-')) deleted += 1;
  }
  return { added, deleted };
};

const statusOf = (change: RawChange): string => (change.new_file ? 'A' : change.deleted_file ? 'D' : change.renamed_file ? 'R' : 'M');

export const signatureOf = (change: RawChange): string => createHash('sha1').update(`${change.old_path ?? ''}\0${change.new_path ?? ''}\0${change.diff ?? ''}`).digest('hex');

/** De la respuesta de GitLab a los archivos del visor. Los que no traen diff (binarios, o enormes que GitLab no manda) se marcan `binary`. */
export const mapMrFiles = (raw: RawChanges, viewed: ViewedMap, label: string): ChangedFile[] =>
  (raw.changes ?? []).flatMap((change) => {
    const path = change.new_path ?? change.old_path;
    if (!path) return [];
    const diff = change.diff ?? '';
    const counts = diff ? countLines(diff) : { added: null, deleted: null };
    const signature = signatureOf(change);
    return [{ path, status: statusOf(change), added: counts.added, deleted: counts.deleted, binary: !diff, untracked: false, signature, viewed: viewedStateOf(viewed, viewKey(label, 'committed', path), signature) }];
  });

export interface MrChangesReport {
  baseBranch: string;
  repos: RepoChanges[];
  progress: ViewedProgress;
  /** Por qué no se pudo leer (sin token, GitLab caído); la pantalla lo muestra en vez de la lista. */
  message: string | null;
}

const empty = (message: string): MrChangesReport => ({ baseBranch: '', repos: [], progress: { total: 0, viewed: 0, pending: [] }, message });

const cache = new Map<string, { at: number; value: RawChanges }>();
const TTL_MS = 300_000;
/** Descargas en curso: los diffs de varios archivos se piden a la vez y comparten una sola descarga del MR. */
const inFlight = new Map<string, Promise<RawChanges>>();
export const clearMrChangesCache = (): void => {
  cache.clear();
  inFlight.clear();
};

interface Deps {
  fetcher?: Fetcher;
  runner?: Runner;
  now?: number;
  env?: NodeJS.ProcessEnv;
}

const fetchRaw = async (config: DevPanelConfig, ref: MrRef, fresh: boolean, deps: Deps): Promise<RawChanges> => {
  const key = `${ref.project}!${ref.iid}`;
  const hit = cache.get(key);
  if (!fresh && hit && (deps.now ?? Date.now()) - hit.at < TTL_MS) return hit.value;
  const pending = inFlight.get(key);
  if (pending && !fresh) return pending;
  const download = downloadRaw(config, ref, deps).finally(() => inFlight.delete(key));
  inFlight.set(key, download);
  return download;
};

/** GET a la API de GitLab con el token del panel (si lo rechaza, intenta con uno de SSH). Devuelve el JSON o lanza `GitlabError`. */
const gitlabGet = async <T>(config: DevPanelConfig, path: string, deps: Deps): Promise<T> => {
  const { fetcher = fetch as unknown as Fetcher, runner = run, now = Date.now(), env = process.env } = deps;
  const resolved = config.gitlab.enabled ? await resolveToken(config, env, runner, now) : { token: null, fixed: false, error: null };
  if (!resolved.token) throw new GitlabError(resolved.error ?? 'Falta el token de GitLab (Configuración → GitLab)', 401);
  let token = resolved.token;
  const url = `${config.gitlab.baseUrl.replace(/\/$/, '')}/api/v4/${path}`;
  const get = (current: string) => fetcher(url, { headers: { 'PRIVATE-TOKEN': current }, signal: AbortSignal.timeout(30_000) });
  let response = await get(token);
  if (response.status === 401 && !resolved.fixed && config.gitlab.sshAuto) {
    clearSshToken();
    token = await mintSshToken(config, runner, now);
    response = await get(token);
  }
  if (response.status === 401) throw new GitlabError('GitLab rechazó el token (vencido o sin permiso read_api)', 401);
  if (!response.ok) throw new GitlabError(response.status === 404 ? 'No existe o el token no lo ve' : `GitLab respondió ${response.status}`, response.status);
  return (await response.json()) as T;
};

const downloadRaw = async (config: DevPanelConfig, ref: MrRef, deps: Deps): Promise<RawChanges> => {
  const { now = Date.now() } = deps;
  const value = await gitlabGet<RawChanges>(config, `projects/${encodeURIComponent(ref.project)}/merge_requests/${ref.iid}/changes?access_raw_diffs=true`, deps);
  cache.set(`${ref.project}!${ref.iid}`, { at: now, value });
  return value;
};

export const readMrChanges = async (config: DevPanelConfig, meta: TicketMeta | null, viewed: ViewedMap, fresh = false, deps: Deps = {}): Promise<MrChangesReport> => {
  const refs = refsForTicket(config, meta);
  if (!refs.length) return empty('El ticket no tiene MRs en ticket.json.');
  let message: string | null = null;
  // Un MR por repo: se leen a la vez (comparten el token) y el resultado conserva el orden del ticket.
  const ordered = refs.sort((x, y) => x.order - y.order || x.iid - y.iid);
  const outcomes = await Promise.all(
    ordered.map(async (ref) => {
      const label = mrLabel(ref);
      try {
        const raw = await fetchRaw(config, ref, fresh, deps);
        return { repo: { repo: label, exists: true, branch: raw.source_branch ?? null, base: raw.target_branch ?? null, commits: [], committed: mapMrFiles(raw, viewed, label), working: [], ignored: raw.overflow ? ['GitLab recortó la lista: hay más archivos de los que muestra'] : [] } as RepoChanges, error: null as string | null };
      } catch (error) {
        return { repo: null, error: error instanceof GitlabError ? error.message : 'No se pudo conectar con GitLab' };
      }
    }),
  );
  const repos = outcomes.flatMap((outcome) => (outcome.repo ? [outcome.repo] : []));
  for (const outcome of outcomes) if (outcome.error) message = outcome.error;
  if (!repos.length && refs.length === 1 && message) return empty(message);
  return { baseBranch: repos[0]?.base ?? '', repos, progress: viewedProgress(repos), message };
};

export type MrDiffOutcome = { ok: true; value: FileDiff } | { ok: false; status: number; error: string };

/** Diff de un archivo de un MR del ticket (por la etiqueta "<repo> !<iid>"). */
export const readMrFileDiff = async (config: DevPanelConfig, meta: TicketMeta | null, label: string, path: string, deps: Deps = {}): Promise<MrDiffOutcome> => {
  const ref = refsForTicket(config, meta).find((candidate) => mrLabel(candidate) === label);
  if (!ref) return { ok: false, status: 404, error: 'Ese MR no pertenece al ticket' };
  try {
    const change = (await fetchRaw(config, ref, false, deps)).changes?.find((candidate) => (candidate.new_path ?? candidate.old_path) === path);
    if (!change) return { ok: false, status: 404, error: 'El archivo no está en el MR' };
    return change.diff ? { ok: true, value: limitDiff(change.diff) } : { ok: true, value: { diff: '', truncated: true, reason: 'GitLab no trae el diff (binario o demasiado grande): miralo en el MR' } };
  } catch (error) {
    return { ok: false, status: error instanceof GitlabError ? error.status : 502, error: error instanceof GitlabError ? error.message : 'No se pudo conectar con GitLab' };
  }
};

/** Huella actual de un archivo del MR, para guardar la marca de "visto". */
export const readMrSignature = async (config: DevPanelConfig, meta: TicketMeta | null, label: string, path: string, deps: Deps = {}): Promise<{ ok: true; signature: string; headSha: string | null } | { ok: false; status: number; error: string }> => {
  const ref = refsForTicket(config, meta).find((candidate) => mrLabel(candidate) === label);
  if (!ref) return { ok: false, status: 404, error: 'Ese MR no pertenece al ticket' };
  try {
    const raw = await fetchRaw(config, ref, false, deps);
    const change = raw.changes?.find((candidate) => (candidate.new_path ?? candidate.old_path) === path);
    return change ? { ok: true, signature: signatureOf(change), headSha: raw.diff_refs?.head_sha ?? null } : { ok: false, status: 404, error: 'El archivo no está en el MR' };
  } catch (error) {
    return { ok: false, status: error instanceof GitlabError ? error.status : 502, error: error instanceof GitlabError ? error.message : 'No se pudo conectar con GitLab' };
  }
};

/**
 * Lo que cambió en un archivo del MR desde el commit que se vio al marcarlo (`fromSha`): se pide a GitLab la comparación
 * entre los dos commits y se toma el archivo. Sin ese commit (la marca es anterior, o se reescribió la historia) se muestra el
 * cambio completo del MR y se avisa en `note`.
 */
export const readMrFileDiffSince = async (config: DevPanelConfig, meta: TicketMeta | null, label: string, path: string, fromSha: string | null, deps: Deps = {}): Promise<MrDiffOutcome> => {
  const full = await readMrFileDiff(config, meta, label, path, deps);
  if (!full.ok || full.value.truncated) return full;
  const fallback = (note: string): MrDiffOutcome => ({ ok: true, value: { ...full.value, note } });
  const ref = refsForTicket(config, meta).find((candidate) => mrLabel(candidate) === label)!;
  if (!fromSha) return fallback('No hay registro de qué versión viste (la marca es anterior): se muestra el cambio completo.');
  try {
    const raw = await fetchRaw(config, ref, false, deps);
    const head = raw.diff_refs?.head_sha;
    if (!head) return fallback('GitLab no informó el último commit del MR: se muestra el cambio completo.');
    if (head === fromSha) return { ok: true, value: { diff: '', truncated: false, reason: 'Sin cambios desde que lo viste', since: true } };
    const compare = await gitlabGet<{ diffs?: RawChange[] }>(config, `projects/${encodeURIComponent(ref.project)}/repository/compare?from=${encodeURIComponent(fromSha)}&to=${encodeURIComponent(head)}&straight=true`, deps);
    const change = compare.diffs?.find((candidate) => (candidate.new_path ?? candidate.old_path) === path);
    if (!change) return { ok: true, value: { diff: '', truncated: false, reason: 'Sin cambios en este archivo desde que lo viste', since: true } };
    return change.diff ? { ok: true, value: { ...limitDiff(change.diff), since: true } } : fallback('GitLab no trae el diff de lo nuevo (binario o demasiado grande): se muestra el cambio completo.');
  } catch (error) {
    // Un commit que ya no existe (se reescribió la rama) responde 404: se vuelve al cambio completo.
    if (error instanceof GitlabError && (error.status === 404 || error.status === 400)) return fallback('El commit que viste ya no está en GitLab (se reescribió la rama): se muestra el cambio completo.');
    return { ok: false, status: error instanceof GitlabError ? error.status : 502, error: error instanceof GitlabError ? error.message : 'No se pudo conectar con GitLab' };
  }
};

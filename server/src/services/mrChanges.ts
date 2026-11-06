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

const downloadRaw = async (config: DevPanelConfig, ref: MrRef, deps: Deps): Promise<RawChanges> => {
  const { fetcher = fetch as unknown as Fetcher, runner = run, now = Date.now(), env = process.env } = deps;
  const key = `${ref.project}!${ref.iid}`;
  const resolved = config.gitlab.enabled ? await resolveToken(config, env, runner, now) : { token: null, fixed: false, error: null };
  if (!resolved.token) throw new GitlabError(resolved.error ?? 'Falta el token de GitLab (Configuración → GitLab)', 401);
  let token = resolved.token;
  const url = `${config.gitlab.baseUrl.replace(/\/$/, '')}/api/v4/projects/${encodeURIComponent(ref.project)}/merge_requests/${ref.iid}/changes?access_raw_diffs=true`;
  const get = (current: string) => fetcher(url, { headers: { 'PRIVATE-TOKEN': current }, signal: AbortSignal.timeout(30_000) });
  let response = await get(token);
  if (response.status === 401 && !resolved.fixed && config.gitlab.sshAuto) {
    clearSshToken();
    token = await mintSshToken(config, runner, now);
    response = await get(token);
  }
  if (response.status === 401) throw new GitlabError('GitLab rechazó el token (vencido o sin permiso read_api)', 401);
  if (!response.ok) throw new GitlabError(response.status === 404 ? 'No existe o el token no lo ve' : `GitLab respondió ${response.status}`, response.status);
  const value = (await response.json()) as RawChanges;
  cache.set(key, { at: now, value });
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
export const readMrSignature = async (config: DevPanelConfig, meta: TicketMeta | null, label: string, path: string, deps: Deps = {}): Promise<{ ok: true; signature: string } | { ok: false; status: number; error: string }> => {
  const ref = refsForTicket(config, meta).find((candidate) => mrLabel(candidate) === label);
  if (!ref) return { ok: false, status: 404, error: 'Ese MR no pertenece al ticket' };
  try {
    const change = (await fetchRaw(config, ref, false, deps)).changes?.find((candidate) => (candidate.new_path ?? candidate.old_path) === path);
    return change ? { ok: true, signature: signatureOf(change) } : { ok: false, status: 404, error: 'El archivo no está en el MR' };
  } catch (error) {
    return { ok: false, status: error instanceof GitlabError ? error.status : 502, error: error instanceof GitlabError ? error.message : 'No se pudo conectar con GitLab' };
  }
};

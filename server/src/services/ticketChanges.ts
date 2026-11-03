import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { viewedStateOf, viewKey, type ViewedMap, type ViewedState } from './changeReview.js';
import { parseLog, parsePorcelain, type RepoStatus } from './gitRepos.js';

export const MAX_DIFF_LINES = 2000;
export const MAX_DIFF_BYTES = 1024 * 1024;
const MAX_COMMITS = 100;

export type ChangeScope = 'committed' | 'working';

export interface ChangedFile {
  path: string;
  /** Estado de git: M, A, D, T… (los archivos sin trackear figuran como "nuevo"). */
  status: string;
  added: number | null;
  deleted: number | null;
  binary: boolean;
  /** Sin trackear: se lista pero no se muestra su contenido (podría ser un binario o una captura). */
  untracked: boolean;
  /** Huella del contenido actual (ids de los blobs de git): cambia cuando el archivo cambia. */
  signature: string;
  /** Si el usuario lo marcó como visto (y sigue igual), o si cambió desde que lo marcó. */
  viewed: ViewedState;
}

export interface RepoChanges {
  repo: string;
  exists: boolean;
  branch: string | null;
  base: string | null;
  commits: RepoStatus['commits'];
  committed: ChangedFile[];
  working: ChangedFile[];
  /** Archivos que el panel administra a propósito (.env de perfiles): no cuentan como cambios del ticket. */
  ignored: string[];
}

export interface FileDiff {
  diff: string;
  truncated: boolean;
  /** Por qué no se muestra completo, para avisarlo en pantalla. */
  reason: string | null;
}

/** `git diff --numstat --no-renames`: "<agregadas>\t<borradas>\t<ruta>", con "-" en ambas si el archivo es binario. */
export const parseNumstat = (text: string): Array<{ path: string; added: number | null; deleted: number | null; binary: boolean }> =>
  text
    .split('\n')
    .flatMap((line) => {
      const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
      if (!match) return [];
      const binary = match[1] === '-';
      return [{ path: match[3]!, added: binary ? null : Number(match[1]), deleted: binary ? null : Number(match[2]), binary }];
    });

/** `git diff --name-status --no-renames`: "<estado>\t<ruta>". */
export const parseNameStatus = (text: string): Map<string, string> =>
  new Map(
    text.split('\n').flatMap((line) => {
      const match = /^(\S+)\t(.+)$/.exec(line);
      return match ? [[match[2]!, match[1]!.charAt(0)] as [string, string]] : [];
    })
  );

/** `git diff --raw --no-renames --abbrev=40`: ":<modo> <modo> <blob viejo> <blob nuevo> <estado>\t<ruta>" → huella "<viejo>><nuevo>" por ruta. */
export const parseRawSignatures = (text: string): Map<string, string> =>
  new Map(
    text.split('\n').flatMap((line) => {
      const match = /^:\d+ \d+ ([0-9a-f]+) ([0-9a-f]+) \S+\t(.+)$/.exec(line);
      return match ? [[match[3]!, `${match[1]}>${match[2]}`] as [string, string]] : [];
    })
  );

/** La ruta de un archivo pedido por la API: relativa al repo, sin escaparse de él ni parecer una opción de git. */
export const isSafeRelativePath = (path: string): boolean =>
  path.length > 0 && !path.startsWith('/') && !path.startsWith('-') && !path.includes('\0') && !path.split(/[\\/]/).includes('..');

export const limitDiff = (text: string): FileDiff => {
  if (!text) return { diff: '', truncated: false, reason: null };
  if (Buffer.byteLength(text) > MAX_DIFF_BYTES) return { diff: '', truncated: true, reason: 'Diff demasiado grande (más de 1 MB)' };
  const lines = text.split('\n');
  if (lines.length > MAX_DIFF_LINES) return { diff: '', truncated: true, reason: `Diff demasiado grande (${lines.length} líneas, el máximo es ${MAX_DIFF_LINES})` };
  return { diff: text, truncated: false, reason: null };
};

const gitIn = (repoDir: string, runner: Runner) => (args: string[]) => runner('git', ['-C', repoDir, ...args], 30_000);

const resolveBase = async (git: ReturnType<typeof gitIn>, baseBranch: string): Promise<string | null> => {
  for (const candidate of [baseBranch, `origin/${baseBranch}`]) {
    if ((await git(['rev-parse', '--verify', '--quiet', candidate])).ok) return candidate;
  }
  return null;
};

const withStatus = (stats: ReturnType<typeof parseNumstat>, statuses: Map<string, string>, signatures: Map<string, string>): ChangedFile[] =>
  stats.map((stat) => ({ ...stat, status: statuses.get(stat.path) ?? 'M', untracked: false, signature: signatures.get(stat.path) ?? '', viewed: 'no' }));

const committedFiles = async (git: ReturnType<typeof gitIn>, base: string): Promise<ChangedFile[]> => {
  const range = `${base}...HEAD`;
  const stats = parseNumstat((await git(['diff', '--numstat', '--no-renames', range])).stdout);
  const statuses = parseNameStatus((await git(['diff', '--name-status', '--no-renames', range])).stdout);
  const signatures = parseRawSignatures((await git(['diff', '--raw', '--no-renames', '--abbrev=40', range])).stdout);
  return withStatus(stats, statuses, signatures);
};

/** Huella de los archivos del árbol de trabajo (hash de su contenido actual; "deleted" si ya no existen). */
const hashWorking = async (git: ReturnType<typeof gitIn>, paths: string[]): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  if (!paths.length) return result;
  const hashes = (await git(['hash-object', '--', ...paths])).stdout.split('\n');
  paths.forEach((path, index) => result.set(path, hashes[index]?.match(/^[0-9a-f]{40}$/) ? hashes[index]! : 'deleted'));
  return result;
};

const workingFiles = async (git: ReturnType<typeof gitIn>): Promise<ChangedFile[]> => {
  const stats = parseNumstat((await git(['diff', 'HEAD', '--numstat', '--no-renames'])).stdout);
  const statuses = parseNameStatus((await git(['diff', 'HEAD', '--name-status', '--no-renames'])).stdout);
  const known = new Set(stats.map((stat) => stat.path));
  const untrackedPaths = parsePorcelain((await git(['status', '--porcelain', '--untracked-files=all'])).stdout)
    .filter((entry) => entry.status === '??' && !known.has(entry.path))
    .map((entry) => entry.path);
  // El árbol de trabajo no tiene blobs guardados: la huella es el hash del contenido actual de cada archivo.
  const signatures = await hashWorking(git, [...stats.map((stat) => stat.path), ...untrackedPaths]);
  const tracked = withStatus(stats, statuses, signatures);
  const untracked = untrackedPaths.map((path): ChangedFile => ({ path, status: 'nuevo', added: null, deleted: null, binary: false, untracked: true, signature: signatures.get(path) ?? '', viewed: 'no' }));
  return [...tracked, ...untracked];
};

/** Cambios de la rama de cada repo del ticket (commiteados contra la base y sin commitear), sin los `.env` que administra el panel. Solo lectura. */
export const readTicketChanges = async (config: DevPanelConfig, repos: string[], runner: Runner = run, viewed: ViewedMap = {}): Promise<RepoChanges[]> => {
  const result: RepoChanges[] = [];
  for (const repo of repos) {
    const repoDir = join(config.paths.projects, repo);
    if (!existsSync(join(repoDir, '.git'))) {
      result.push({ repo, exists: false, branch: null, base: null, commits: [], committed: [], working: [], ignored: [] });
      continue;
    }
    const git = gitIn(repoDir, runner);
    const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout || null;
    const base = await resolveBase(git, config.git.baseBranch);
    const managed = config.envProfiles[repo]?.file;
    const working = await workingFiles(git);
    const ignored = managed ? working.filter((file) => file.path === managed).map((file) => file.path) : [];
    const commits = base ? parseLog((await git(['log', `-${MAX_COMMITS}`, '--pretty=format:%h%x09%s%x09%cr%x09%an', `${base}..HEAD`])).stdout) : [];
    result.push({
      repo,
      exists: true,
      branch,
      base,
      commits,
      committed: (base ? await committedFiles(git, base) : []).map((file) => ({ ...file, viewed: viewedStateOf(viewed, viewKey(repo, 'committed', file.path), file.signature) })),
      working: working.filter((file) => !ignored.includes(file.path)).map((file) => ({ ...file, viewed: viewedStateOf(viewed, viewKey(repo, 'working', file.path), file.signature) })),
      ignored,
    });
  }
  return result;
};

/** Huella actual de un archivo de los cambios (para guardar la marca de "visto"). Solo vale lo que figura entre los cambios del repo. */
export const readFileSignature = async (config: DevPanelConfig, repo: string, path: string, scope: ChangeScope, runner: Runner = run): Promise<{ ok: true; signature: string } | { ok: false; status: number; error: string }> => {
  const repoDir = join(config.paths.projects, repo);
  if (!existsSync(join(repoDir, '.git'))) return { ok: false, status: 404, error: 'El repo no existe en esta máquina' };
  if (!isSafeRelativePath(path)) return { ok: false, status: 400, error: 'Ruta inválida' };
  const git = gitIn(repoDir, runner);
  const base = scope === 'committed' ? await resolveBase(git, config.git.baseBranch) : null;
  if (scope === 'committed' && !base) return { ok: false, status: 404, error: `No se encontró la rama base ${config.git.baseBranch}` };
  const files = scope === 'committed' ? await committedFiles(git, base!) : await workingFiles(git);
  const file = files.find((entry) => entry.path === path);
  if (!file || path === config.envProfiles[repo]?.file) return { ok: false, status: 404, error: 'Ese archivo no figura entre los cambios' };
  return { ok: true, signature: file.signature };
};

export interface ViewedProgress {
  total: number;
  viewed: number;
  /** Archivos que faltan por repo (solo los repos con faltantes). */
  pending: Array<{ repo: string; count: number }>;
}

/** Cuántos archivos de los cambios (commiteados y sin commitear) ya se marcaron como vistos y siguen iguales. */
export const viewedProgress = (repos: RepoChanges[]): ViewedProgress => {
  const pending: ViewedProgress['pending'] = [];
  let total = 0;
  let viewed = 0;
  for (const repo of repos) {
    const files = [...repo.committed, ...repo.working];
    const seen = files.filter((file) => file.viewed === 'yes').length;
    total += files.length;
    viewed += seen;
    if (files.length > seen) pending.push({ repo: repo.repo, count: files.length - seen });
  }
  return { total, viewed, pending };
};

export type DiffOutcome = { ok: true; value: FileDiff } | { ok: false; status: number; error: string };

/** Diff de un archivo. Solo se atiende una ruta que figure entre los cambios del repo y del alcance pedidos (no se lee cualquier archivo). */
export const readFileDiff = async (config: DevPanelConfig, repo: string, path: string, scope: ChangeScope, runner: Runner = run): Promise<DiffOutcome> => {
  const repoDir = join(config.paths.projects, repo);
  if (!existsSync(join(repoDir, '.git'))) return { ok: false, status: 404, error: 'El repo no existe en esta máquina' };
  if (!isSafeRelativePath(path)) return { ok: false, status: 400, error: 'Ruta inválida' };
  const git = gitIn(repoDir, runner);
  const base = scope === 'committed' ? await resolveBase(git, config.git.baseBranch) : null;
  if (scope === 'committed' && !base) return { ok: false, status: 404, error: `No se encontró la rama base ${config.git.baseBranch}` };
  const files = scope === 'committed' ? await committedFiles(git, base!) : await workingFiles(git);
  const file = files.find((entry) => entry.path === path);
  if (!file || path === config.envProfiles[repo]?.file) return { ok: false, status: 404, error: 'Ese archivo no figura entre los cambios' };
  if (file.untracked) return { ok: true, value: { diff: '', truncated: true, reason: 'Archivo nuevo sin commitear: no se muestra su contenido' } };
  if (file.binary) return { ok: true, value: { diff: '', truncated: true, reason: 'Archivo binario' } };
  const args = scope === 'committed' ? ['diff', '--no-renames', `${base}...HEAD`, '--', path] : ['diff', 'HEAD', '--no-renames', '--', path];
  const output = await git(args);
  // Más del buffer del ejecutor: tampoco se muestra.
  if (!output.ok) return { ok: true, value: { diff: '', truncated: true, reason: 'Diff demasiado grande (más de 1 MB)' } };
  return { ok: true, value: limitDiff(output.stdout) };
};

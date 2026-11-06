import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { saveSnapshot, snapshotPath, viewedStateOf, viewKey, type ViewedMap, type ViewedState } from './changeReview.js';
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
  /** Solo con «últimos cambios»: el diff es lo que cambió desde que se marcó como visto (no el cambio completo). */
  since?: boolean;
  /** Aviso cuando se pidieron los últimos cambios pero se muestra otra cosa (no se encontró la versión que se vio). */
  note?: string | null;
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

/** `git diff --raw --no-renames`: ":<modo> <modo> <blob viejo> <blob nuevo> <estado>\t<ruta>" → estado (primera letra) por ruta. */
export const parseRawStatuses = (text: string): Map<string, string> =>
  new Map(
    text.split('\n').flatMap((line) => {
      const match = /^:\d+ \d+ [0-9a-f]+ [0-9a-f]+ (\S+)\t(.+)$/.exec(line);
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

/** Rama de configuración (`desarrollo`), local u `origin/`: solo es la base cuando no se puede deducir otra. */
const configuredBase = async (git: ReturnType<typeof gitIn>, baseBranch: string): Promise<string | null> => {
  for (const candidate of [baseBranch, `origin/${baseBranch}`]) {
    if ((await git(['rev-parse', '--verify', '--quiet', candidate])).ok) return candidate;
  }
  return null;
};

/**
 * La base se calcula con cientos de consultas a git (una por rama candidata): se recuerda un rato por repo y commit actual
 * (cada archivo que se abre en Cambios la necesita). Cambia si cambia el HEAD; el vencimiento cubre ramas nuevas.
 */
const BASE_CACHE_MS = 120_000;
const baseCache = new Map<string, { at: number; base: string | null }>();
export const clearBaseCache = (): void => baseCache.clear();

const MAX_BASE_CANDIDATES = 200;
const BASE_HISTORY_COMMITS = 300;
const BASE_CONCURRENCY = 8;

/**
 * Rama de la que parte la actual: entre las ramas ya contenidas en HEAD (las de sus últimos commits), la que deja menos commits propios.
 * Así una rama cortada de otra feature (sin mergear) se compara con esa feature y no con `desarrollo`, que arrastraría
 * los cambios de la rama padre. Ante empate gana la rama de configuración; sin candidatas, se usa esa.
 */
const resolveBase = async (git: ReturnType<typeof gitIn>, baseBranch: string, repoDir = ''): Promise<string | null> => {
  const head = (await git(['rev-parse', 'HEAD'])).stdout;
  const cacheKey = `${repoDir}|${baseBranch}|${head}`;
  const hit = repoDir && head ? baseCache.get(cacheKey) : undefined;
  if (hit && Date.now() - hit.at < BASE_CACHE_MS) return hit.base;
  const base = await computeBase(git, baseBranch);
  if (repoDir && head) baseCache.set(cacheKey, { at: Date.now(), base });
  return base;
};

const computeBase = async (git: ReturnType<typeof gitIn>, baseBranch: string): Promise<string | null> => {
  const fallback = await configuredBase(git, baseBranch);
  const current = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout;
  // Ramas que apuntan a los últimos commits del historial de HEAD (ya contenidas en HEAD): una consulta barata en lugar de recorrer todas las ramas.
  const listed = await git(['log', 'HEAD', `-n${BASE_HISTORY_COMMITS}`, '--format=%D', '--decorate-refs=refs/heads/', '--decorate-refs=refs/remotes/origin/']);
  if (!listed.ok) return fallback;
  const names = new Set(
    listed.stdout
      .split(/[\n,]/)
      .map((name) => name.trim().replace(/^HEAD -> /, ''))
      .filter((ref) => ref && ref !== 'HEAD' && ref !== 'origin/HEAD' && ref !== current && ref !== `origin/${current}`),
  );
  if (fallback) names.add(fallback);
  const candidates = [...names].slice(0, MAX_BASE_CANDIDATES);
  const counts = new Map<string, number>();
  const queue = [...candidates];
  await Promise.all(
    Array.from({ length: BASE_CONCURRENCY }, async () => {
      for (let ref = queue.shift(); ref; ref = queue.shift()) {
        const counted = await git(['rev-list', '--count', `${ref}..HEAD`]);
        const value = Number(counted.stdout);
        if (counted.ok && Number.isInteger(value) && value > 0) counts.set(ref, value);
      }
    }),
  );
  let best: string | null = null;
  for (const [ref, count] of counts) {
    const bestCount = best ? counts.get(best)! : Infinity;
    if (count < bestCount || (count === bestCount && (ref === fallback || ref === `origin/${baseBranch}`))) best = ref;
  }
  return best ?? fallback;
};

const withStatus = (stats: ReturnType<typeof parseNumstat>, statuses: Map<string, string>, signatures: Map<string, string>): ChangedFile[] =>
  stats.map((stat) => ({ ...stat, status: statuses.get(stat.path) ?? 'M', untracked: false, signature: signatures.get(stat.path) ?? '', viewed: 'no' }));

/** Una sola llamada a git para las tres vistas (cantidades, estado y huella): `--raw --numstat` imprime primero lo uno y después lo otro. */
const diffFiles = async (git: ReturnType<typeof gitIn>, args: string[], pathspec: string[] = []): Promise<ChangedFile[]> => {
  const text = (await git(['diff', ...args, '--raw', '--numstat', '--no-renames', '--abbrev=40', ...(pathspec.length ? ['--', ...pathspec] : [])])).stdout;
  return withStatus(parseNumstat(text), parseRawStatuses(text), parseRawSignatures(text));
};

const committedFiles = (git: ReturnType<typeof gitIn>, base: string, pathspec: string[] = []): Promise<ChangedFile[]> => diffFiles(git, [`${base}...HEAD`], pathspec);

/** Huella de los archivos del árbol de trabajo (hash de su contenido actual; "deleted" si ya no existen). */
const hashWorking = async (git: ReturnType<typeof gitIn>, paths: string[]): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  if (!paths.length) return result;
  const hashes = (await git(['hash-object', '--', ...paths])).stdout.split('\n');
  paths.forEach((path, index) => result.set(path, hashes[index]?.match(/^[0-9a-f]{40}$/) ? hashes[index]! : 'deleted'));
  return result;
};

const workingFiles = async (git: ReturnType<typeof gitIn>, pathspec: string[] = []): Promise<ChangedFile[]> => {
  const [trackedRaw, status] = await Promise.all([
    git(['diff', 'HEAD', '--raw', '--numstat', '--no-renames', '--abbrev=40', ...(pathspec.length ? ['--', ...pathspec] : [])]),
    git(['status', '--porcelain', '--untracked-files=all', ...(pathspec.length ? ['--', ...pathspec] : [])]),
  ]);
  const stats = parseNumstat(trackedRaw.stdout);
  const statuses = parseRawStatuses(trackedRaw.stdout);
  const known = new Set(stats.map((stat) => stat.path));
  const untrackedPaths = parsePorcelain(status.stdout)
    .filter((entry) => entry.status === '??' && !known.has(entry.path))
    .map((entry) => entry.path);
  // El árbol de trabajo no tiene blobs guardados: la huella es el hash del contenido actual de cada archivo.
  const signatures = await hashWorking(git, [...stats.map((stat) => stat.path), ...untrackedPaths]);
  const tracked = withStatus(stats, statuses, signatures);
  const untracked = untrackedPaths.map((path): ChangedFile => ({ path, status: 'nuevo', added: null, deleted: null, binary: false, untracked: true, signature: signatures.get(path) ?? '', viewed: 'no' }));
  return [...tracked, ...untracked];
};

/** Cambios de la rama de cada repo del ticket (commiteados contra la base y sin commitear), sin los `.env` que administra el panel. Solo lectura. */
export const readTicketChanges = async (config: DevPanelConfig, repos: string[], runner: Runner = run, viewed: ViewedMap = {}): Promise<RepoChanges[]> =>
  // Los repos son independientes: se leen a la vez (el resultado conserva el orden del ticket).
  Promise.all(
    repos.map(async (repo): Promise<RepoChanges> => {
      const repoDir = join(config.paths.projects, repo);
      if (!existsSync(join(repoDir, '.git'))) return { repo, exists: false, branch: null, base: null, commits: [], committed: [], working: [], ignored: [] };
      const git = gitIn(repoDir, runner);
      const managed = config.envProfiles[repo]?.file;
      const [branchOut, base, working] = await Promise.all([git(['rev-parse', '--abbrev-ref', 'HEAD']), resolveBase(git, config.git.baseBranch, repoDir), workingFiles(git)]);
      const ignored = managed ? working.filter((file) => file.path === managed).map((file) => file.path) : [];
      const [commits, committed] = await Promise.all([
        base ? git(['log', `-${MAX_COMMITS}`, '--pretty=format:%h%x09%s%x09%cr%x09%an', `${base}..HEAD`]).then((out) => parseLog(out.stdout)) : Promise.resolve([]),
        base ? committedFiles(git, base) : Promise.resolve([]),
      ]);
      return {
        repo,
        exists: true,
        branch: branchOut.stdout || null,
        base,
        commits,
        committed: committed.map((file) => ({ ...file, viewed: viewedStateOf(viewed, viewKey(repo, 'committed', file.path), file.signature) })),
        working: working.filter((file) => !ignored.includes(file.path)).map((file) => ({ ...file, viewed: viewedStateOf(viewed, viewKey(repo, 'working', file.path), file.signature) })),
        ignored,
      };
    }),
  );

/** Huella actual de un archivo de los cambios (para guardar la marca de "visto"). Solo vale lo que figura entre los cambios del repo. */
export const readFileSignature = async (config: DevPanelConfig, repo: string, path: string, scope: ChangeScope, runner: Runner = run): Promise<{ ok: true; signature: string } | { ok: false; status: number; error: string }> => {
  const repoDir = join(config.paths.projects, repo);
  if (!existsSync(join(repoDir, '.git'))) return { ok: false, status: 404, error: 'El repo no existe en esta máquina' };
  if (!isSafeRelativePath(path)) return { ok: false, status: 400, error: 'Ruta inválida' };
  const git = gitIn(repoDir, runner);
  const base = scope === 'committed' ? await resolveBase(git, config.git.baseBranch, repoDir) : null;
  if (scope === 'committed' && !base) return { ok: false, status: 404, error: `No se encontró la rama base ${config.git.baseBranch}` };
  // Solo se consulta el archivo pedido (con la ruta como filtro de git): no hace falta listar todos los cambios del repo.
  const files = scope === 'committed' ? await committedFiles(git, base!, [`:(literal)${path}`]) : await workingFiles(git, [`:(literal)${path}`]);
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
  const base = scope === 'committed' ? await resolveBase(git, config.git.baseBranch, repoDir) : null;
  if (scope === 'committed' && !base) return { ok: false, status: 404, error: `No se encontró la rama base ${config.git.baseBranch}` };
  // Solo se consulta el archivo pedido (con la ruta como filtro de git): no hace falta listar todos los cambios del repo.
  const files = scope === 'committed' ? await committedFiles(git, base!, [`:(literal)${path}`]) : await workingFiles(git, [`:(literal)${path}`]);
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

const ZERO_BLOB = /^0+$/;

/** Copia de un archivo sin commitear tal como está ahora, para poder mostrar después «lo que cambió desde que lo viste». */
export const snapshotWorkingFile = (config: DevPanelConfig, repo: string, path: string, signature: string): boolean =>
  isSafeRelativePath(path) && saveSnapshot(signature, join(config.paths.projects, repo, path));

const noteFullFallback = (full: FileDiff, note: string): FileDiff => ({ ...full, note });

/**
 * Lo que cambió en un archivo DESDE QUE SE MARCÓ COMO VISTO (`viewedSignature` = la huella que tenía al marcarlo).
 * - Commiteado: la huella lleva el id del blob que se vio ("viejo>nuevo"): se compara ese blob con el actual.
 * - Sin commitear: se compara la copia que se guardó al marcarlo con el archivo de ahora.
 * Si no se puede reconstruir lo que se vio (la marca es anterior a esta función, el repo limpió el objeto), se muestra el cambio
 * completo y se avisa en `note`.
 */
export const readFileDiffSince = async (config: DevPanelConfig, repo: string, path: string, scope: ChangeScope, viewedSignature: string, runner: Runner = run): Promise<DiffOutcome> => {
  const full = await readFileDiff(config, repo, path, scope, runner);
  if (!full.ok || full.value.truncated) return full;
  const repoDir = join(config.paths.projects, repo);
  const git = gitIn(repoDir, runner);
  const files = scope === 'committed' ? await committedFiles(git, (await resolveBase(git, config.git.baseBranch, repoDir))!, [`:(literal)${path}`]) : await workingFiles(git, [`:(literal)${path}`]);
  const current = files.find((entry) => entry.path === path)?.signature ?? '';
  const unchanged: FileDiff = { diff: '', truncated: false, reason: 'Sin cambios desde que lo viste', since: true };
  if (current === viewedSignature) return { ok: true, value: unchanged };

  if (scope === 'committed') {
    const viewedBlob = viewedSignature.split('>')[1] ?? '';
    const currentBlob = current.split('>')[1] ?? '';
    if (!viewedBlob || ZERO_BLOB.test(viewedBlob)) return { ok: true, value: noteFullFallback(full.value, 'Cuando lo viste el archivo no existía: se muestra el cambio completo.') };
    if (viewedBlob === currentBlob) return { ok: true, value: unchanged };
    if (ZERO_BLOB.test(currentBlob)) return { ok: true, value: { diff: '', truncated: false, reason: 'El archivo se eliminó desde que lo viste', since: true } };
    if (!(await git(['cat-file', '-e', viewedBlob])).ok) return { ok: true, value: noteFullFallback(full.value, 'No se encuentra en el repo la versión que viste (se limpió): se muestra el cambio completo.') };
    const output = await git(['diff', '--no-color', viewedBlob, currentBlob]);
    return { ok: true, value: output.ok ? { ...limitDiff(output.stdout), since: true } : noteFullFallback(full.value, 'No se pudo comparar con lo que viste: se muestra el cambio completo.') };
  }

  const snapshot = snapshotPath(viewedSignature);
  if (!snapshot) return { ok: true, value: noteFullFallback(full.value, 'No hay copia de lo que viste (la marca es anterior): se muestra el cambio completo.') };
  if (current === 'deleted') return { ok: true, value: { diff: '', truncated: false, reason: 'El archivo se eliminó desde que lo viste', since: true } };
  // `git diff --no-index` sale con código 1 cuando hay diferencias: lo que importa es la salida.
  const output = await git(['diff', '--no-index', '--no-color', '--', snapshot, join(repoDir, path)]);
  return { ok: true, value: output.stdout ? { ...limitDiff(output.stdout), since: true } : unchanged };
};

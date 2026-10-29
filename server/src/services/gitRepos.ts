import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';

export interface RepoStatus {
  repo: string;
  exists: boolean;
  branch: string | null;
  base: { name: string; ahead: number; behind: number } | null;
  dirty: Array<{ status: string; path: string }>;
  last: { hash: string; subject: string; when: string; author: string } | null;
  /** Fecha de autor (ISO) del último commit propio de la rama (los que no están en la base); null si no tiene. La de autor sobrevive a un rebase, la de commit no. */
  lastCommitAt: string | null;
  /** Rama remota que sigue la actual y su distancia. */
  upstream: { name: string; ahead: number; behind: number } | null;
  /** Commits de la rama actual que no están en la rama base (los más recientes primero). */
  commits: Array<{ hash: string; subject: string; when: string; author: string }>;
  stashes: number;
  /** Número de ticket deducido del nombre de la rama (feature/33526-algo). */
  ticket: string | null;
}

export const ticketFromBranch = (branch: string | null): string | null => /(\d{4,6})/.exec(branch ?? '')?.[1] ?? null;

export const parseLog = (text: string): Array<{ hash: string; subject: string; when: string; author: string }> =>
  text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash = '', subject = '', when = '', author = ''] = line.split('\t');
      return { hash, subject, when, author };
    });

/** "<behind>\t<ahead>" de `git rev-list --left-right --count base...HEAD`. */
export const parseAheadBehind = (text: string): { ahead: number; behind: number } | null => {
  const match = /^(\d+)\s+(\d+)$/.exec(text.trim());
  return match ? { behind: Number(match[1]), ahead: Number(match[2]) } : null;
};

/** `git status --porcelain`; `run()` recorta el espacio inicial de la primera línea, por eso se separa por espacios y no por columnas. */
export const parsePorcelain = (text: string): Array<{ status: string; path: string }> =>
  text
    .split('\n')
    .flatMap((line) => {
      const match = /^\s*(\S+)\s+(.+)$/.exec(line);
      return match ? [{ status: match[1]!, path: match[2]! }] : [];
    });

/** Solo lectura: rama actual, distancia a la rama base, cambios sin commitear y último commit. */
export const readRepoStatus = async (config: DevPanelConfig, runner: Runner = run, only?: string[]): Promise<RepoStatus[]> => {
  const result: RepoStatus[] = [];
  for (const repo of only ?? config.repos) {
    const cwd = join(config.paths.projects, repo);
    if (!existsSync(join(cwd, '.git'))) {
      result.push({ repo, exists: false, branch: null, base: null, dirty: [], last: null, lastCommitAt: null, upstream: null, commits: [], stashes: 0, ticket: null });
      continue;
    }
    const git = (args: string[]) => runner('git', ['-C', cwd, ...args], 20_000);
    const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout || null;
    let base: RepoStatus['base'] = null;
    for (const candidate of [config.git.baseBranch, `origin/${config.git.baseBranch}`]) {
      const counts = await git(['rev-list', '--left-right', '--count', `${candidate}...HEAD`]);
      const parsed = counts.ok ? parseAheadBehind(counts.stdout) : null;
      if (parsed) {
        base = { name: candidate, ...parsed };
        break;
      }
    }
    const dirty = parsePorcelain((await git(['status', '--porcelain'])).stdout);
    const format = '--pretty=format:%h%x09%s%x09%cr%x09%an';
    const last = parseLog((await git(['log', '-1', format])).stdout)[0] ?? null;
    const lastCommitAt = base ? (await git(['log', '-1', '--pretty=format:%aI', `${base.name}..HEAD`])).stdout || null : null;
    const commits = base ? parseLog((await git(['log', '-8', format, `${base.name}..HEAD`])).stdout) : [];
    const upstreamName = (await git(['rev-parse', '--abbrev-ref', '@{upstream}'])).stdout;
    const upstreamCounts = upstreamName ? parseAheadBehind((await git(['rev-list', '--left-right', '--count', `${upstreamName}...HEAD`])).stdout) : null;
    const stashes = (await git(['stash', 'list'])).stdout.split('\n').filter(Boolean).length;
    result.push({ repo, exists: true, branch, base, dirty, last, lastCommitAt, upstream: upstreamName && upstreamCounts ? { name: upstreamName, ...upstreamCounts } : null, commits, stashes, ticket: ticketFromBranch(branch) });
  }
  return result;
};

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
  last: { hash: string; subject: string; when: string } | null;
}

/** "<behind>\t<ahead>" de `git rev-list --left-right --count base...HEAD`. */
export const parseAheadBehind = (text: string): { ahead: number; behind: number } | null => {
  const match = /^(\d+)\s+(\d+)$/.exec(text.trim());
  return match ? { behind: Number(match[1]), ahead: Number(match[2]) } : null;
};

export const parsePorcelain = (text: string): Array<{ status: string; path: string }> =>
  text
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => ({ status: line.slice(0, 2).trim() || '?', path: line.slice(3) }));

/** Solo lectura: rama actual, distancia a la rama base, cambios sin commitear y último commit. */
export const readRepoStatus = async (config: DevPanelConfig, runner: Runner = run): Promise<RepoStatus[]> => {
  const result: RepoStatus[] = [];
  for (const repo of config.repos) {
    const cwd = join(config.paths.projects, repo);
    if (!existsSync(join(cwd, '.git'))) {
      result.push({ repo, exists: false, branch: null, base: null, dirty: [], last: null });
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
    const log = (await git(['log', '-1', '--pretty=format:%h%x09%s%x09%cr'])).stdout.split('\t');
    result.push({ repo, exists: true, branch, base, dirty, last: log.length === 3 ? { hash: log[0]!, subject: log[1]!, when: log[2]! } : null });
  }
  return result;
};

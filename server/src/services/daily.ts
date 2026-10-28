import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { ticketUrl } from './redmine.js';
import { ignoredDirs, listTickets, type TicketSummary } from './tickets.js';

export const DAILY_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_DAILY_FILES = 5;
const MAX_BYTES = 200 * 1024;

export class DailyError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const listDaily = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .map((name) => DAILY_FILE.exec(name)?.[1])
        .filter((date): date is string => Boolean(date))
        .sort()
        .reverse()
    : [];

export const readDaily = (dir: string, date: string): string | null => {
  if (!DATE.test(date)) throw new DailyError('Fecha inválida');
  const file = join(dir, `${date}.md`);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

/** Guarda el daily del día y conserva solo los 5 más recientes: al pasar de 5 se borra el más viejo. */
export const writeDaily = (dir: string, date: string, content: string): { deleted: string[] } => {
  if (!DATE.test(date)) throw new DailyError('Fecha inválida');
  if (Buffer.byteLength(content) > MAX_BYTES) throw new DailyError('El daily es demasiado grande');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${date}.md`), content);
  const deleted = listDaily(dir)
    .slice(MAX_DAILY_FILES)
    .filter((old) => old !== date);
  deleted.forEach((old) => rmSync(join(dir, `${old}.md`), { force: true }));
  return { deleted };
};

export interface RepoActivity {
  repo: string;
  branch: string | null;
  commits: Array<{ hash: string; subject: string }>;
  files: number;
  insertions: number;
  deletions: number;
  uncommitted: number;
}

/** Totales de `git log --shortstat` (líneas "N files changed, X insertions(+), Y deletions(-)"). */
export const parseShortstat = (text: string): { files: number; insertions: number; deletions: number } => {
  let files = 0;
  let insertions = 0;
  let deletions = 0;
  for (const match of text.matchAll(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/g)) {
    files += Number(match[1]);
    insertions += Number(match[2] ?? 0);
    deletions += Number(match[3] ?? 0);
  }
  return { files, insertions, deletions };
};

export const collectActivity = async (config: DevPanelConfig, since: Date, runner: Runner = run): Promise<RepoActivity[]> => {
  const activity: RepoActivity[] = [];
  for (const repo of config.repos) {
    const cwd = join(config.paths.projects, repo);
    if (!existsSync(join(cwd, '.git'))) continue;
    const git = (args: string[]) => runner('git', ['-C', cwd, ...args], 30_000);
    const email = (await git(['config', 'user.email'])).stdout;
    const author = email ? [`--author=${email}`] : [];
    const log = await git(['log', '--all', '--no-merges', `--since=${since.toISOString()}`, ...author, '--shortstat', '--pretty=format:@@%h%x09%s']);
    const commits = log.stdout
      .split('\n')
      .filter((line) => line.startsWith('@@'))
      .map((line) => {
        const [hash, ...subject] = line.slice(2).split('\t');
        return { hash: hash ?? '', subject: subject.join('\t') };
      });
    const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout || null;
    const status = (await git(['status', '--porcelain'])).stdout;
    const stats = parseShortstat(log.stdout);
    const uncommitted = status.split('\n').filter((line) => line.trim() && !/\.env$/.test(line.trim())).length;
    if (commits.length || uncommitted) activity.push({ repo, branch, commits, ...stats, uncommitted });
  }
  return activity;
};

const pad = (value: number) => String(value).padStart(2, '0');
export const localDate = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Desde cuándo resumir: hoy, ayer o el día siguiente al último daily guardado. */
export const sinceDate = (mode: 'today' | 'yesterday' | 'last', now: Date, existing: string[]): Date => {
  const today = startOfDay(now);
  if (mode === 'yesterday') return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (mode === 'last') {
    const last = existing.find((date) => date < localDate(now));
    if (last) {
      const [y, m, d] = last.split('-').map(Number);
      return new Date(y!, m! - 1, d! + 1);
    }
  }
  return today;
};

export const formatDraft = (date: string, activity: RepoActivity[], tickets: TicketSummary[], linkOf: (ticket: string) => string | null = () => null): string => {
  const lines: string[] = [`# Daily ${date}`, '', '## Resumen', '', '- _(completar: en qué se trabajó y cuánto se avanzó)_', '', '## Tickets'];
  if (!tickets.length) lines.push('', '- Sin actividad registrada en `_EXTRA`.');
  for (const ticket of tickets) {
    const parts = [ticket.estado, ticket.lastTest?.resultado ? `pruebas ${ticket.lastTest.resultado}` : null, ticket.review ? `review: ${ticket.review}` : null].filter(Boolean);
    const url = ticket.ticket ? linkOf(ticket.ticket) : null;
    const id = ticket.ticket ? (url ? `[#${ticket.ticket}](${url}) ` : `#${ticket.ticket} `) : '';
    lines.push('', `- **${id}${ticket.title}**${parts.length ? ` — ${parts.join(' · ')}` : ''}`);
  }
  lines.push('', '## Código');
  if (!activity.length) lines.push('', '- Sin commits ni cambios pendientes en los repos configurados.');
  for (const repo of activity) {
    lines.push('', `### ${repo.repo}${repo.branch ? ` (\`${repo.branch}\`)` : ''}`);
    if (repo.commits.length) lines.push(`- ${repo.commits.length} commits · ${repo.files} archivos · +${repo.insertions} −${repo.deletions}`);
    repo.commits.slice(0, 15).forEach((commit) => lines.push(`  - \`${commit.hash}\` ${commit.subject}`));
    if (repo.commits.length > 15) lines.push(`  - … y ${repo.commits.length - 15} más`);
    if (repo.uncommitted) lines.push(`- ${repo.uncommitted} archivos sin commitear`);
  }
  lines.push('', '## Pendiente y bloqueos', '', '- _(completar)_', '');
  return lines.join('\n');
};

export const buildDraft = async (config: DevPanelConfig, mode: 'today' | 'yesterday' | 'last', now = new Date(), runner: Runner = run): Promise<string> => {
  const since = sinceDate(mode, now, listDaily(config.paths.daily));
  const activity = await collectActivity(config, since, runner);
  const touched = listTickets(config.paths.extra, ignoredDirs(config)).filter((ticket) => ticket.lastUpdated >= since.getTime());
  return formatDraft(localDate(now), activity, touched, (ticket) => ticketUrl(config, ticket));
};

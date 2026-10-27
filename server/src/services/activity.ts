import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { paths } from '../config.js';
import { run, type Runner } from '../docker.js';
import { localDay } from './checklists.js';
import { getTicket, listTickets } from './tickets.js';

export type ActivityType = 'commit' | 'push' | 'mr' | 'review' | 'analysis' | 'estimation' | 'test';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  /** ISO. */
  at: string;
  title: string;
  repo?: string;
  ticket?: string;
  detail?: string;
}

export const KEEP_DAYS = 5;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dir = () => join(paths.data, 'activity');

/** Los últimos `KEEP_DAYS` días (hoy incluido), del más reciente al más viejo. */
export const windowDays = (now = new Date()): string[] =>
  Array.from({ length: KEEP_DAYS }, (_, i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));

export const startOfWindow = (now = new Date()): Date => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (KEEP_DAYS - 1));

const dayOf = (iso: string): string => localDay(new Date(iso));

// ---------------------------------------------------------------- fuentes
export const classifyDoc = (name: string): ActivityType | null => {
  if (/ESTIMACI[OÓ]N/i.test(name)) return 'estimation';
  if (/CONTRATO|ARQUITECTO|PLAN|BRIEF|AN[AÁ]LISIS|ANALISIS/i.test(name)) return 'analysis';
  if (/EJECUCI[OÓ]N|INFORME|PRUEBA/i.test(name)) return 'test';
  return null;
};

export const collectGit = async (config: DevPanelConfig, since: Date, runner: Runner = run): Promise<ActivityEvent[]> => {
  const events: ActivityEvent[] = [];
  for (const repo of config.repos) {
    const cwd = join(config.paths.projects, repo);
    if (!existsSync(join(cwd, '.git'))) continue;
    const git = (args: string[]) => runner('git', ['-C', cwd, ...args], 30_000);
    const email = (await git(['config', 'user.email'])).stdout;
    const commits = await git(['log', '--all', '--no-merges', `--since=${since.toISOString()}`, ...(email ? [`--author=${email}`] : []), '--pretty=format:%H%x09%cI%x09%s']);
    for (const line of commits.stdout.split('\n').filter(Boolean)) {
      const [hash = '', at = '', ...subject] = line.split('\t');
      events.push({ id: `commit:${repo}:${hash}`, type: 'commit', at, title: subject.join('\t'), repo, detail: hash.slice(0, 7) });
    }
    // Un push deja "update by push" en el reflog de la rama remota.
    const reflog = await git(['reflog', 'show', '--all', '--date=iso-strict', '--pretty=format:%gd%x09%gs']);
    for (const line of reflog.stdout.split('\n')) {
      const match = /^(?:refs\/remotes\/)?(origin\/.+?)@\{(.+?)\}\t(update by push)/.exec(line);
      if (!match) continue;
      const at = new Date(match[2]!);
      if (Number.isNaN(at.getTime()) || at < since) continue;
      events.push({ id: `push:${repo}:${match[1]}:${at.toISOString()}`, type: 'push', at: at.toISOString(), title: `Push de ${match[1]}`, repo });
    }
  }
  return events;
};

/** Eventos con fecha que registran las skills en ticket.json, y archivos de análisis/estimación por su fecha de modificación. */
export const collectTickets = (config: DevPanelConfig, since: Date): ActivityEvent[] => {
  const events: ActivityEvent[] = [];
  const dateAt = (value: string | undefined): string | null => {
    if (!value) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(date.getTime()) || date < since ? null : date.toISOString();
  };
  for (const summary of listTickets(config.paths.extra)) {
    const detail = getTicket(config.paths.extra, summary.dir);
    if (!detail) continue;
    const ticket = detail.ticket ?? undefined;
    const label = `${ticket ? `#${ticket} ` : ''}${detail.title}`;
    const base = ticket ? { ticket } : {};
    detail.meta?.pruebas?.forEach((test, index) => {
      const at = dateAt(test.fecha);
      if (at) events.push({ id: `test:${summary.dir}:${index}`, type: 'test', at, title: `Pruebas · ${label}`, ...base, ...(test.resultado ? { detail: test.resultado } : {}) });
    });
    detail.meta?.codeReview?.forEach((review, index) => {
      const at = dateAt(review.fecha);
      if (at) events.push({ id: `review:${summary.dir}:${index}`, type: 'review', at, title: `Code review · ${label}`, ...base, ...(review.veredicto ? { detail: review.veredicto } : {}) });
    });
    detail.meta?.mrs?.forEach((mr, index) => {
      const at = dateAt(mr.fecha);
      if (at) events.push({ id: `mr:${summary.dir}:${index}`, type: 'mr', at, title: `MR ${mr.repo ?? ''} !${mr.iid ?? '?'} · ${label}`, ...base, ...(mr.estado ? { detail: mr.estado } : {}) });
    });
    for (const doc of detail.files.docs) {
      const type = classifyDoc(doc.split('/').pop() ?? doc);
      if (!type || extname(doc) !== '.md') continue;
      const mtime = statSync(join(config.paths.extra, summary.dir, doc)).mtime;
      if (mtime < since) continue;
      events.push({ id: `${type}:${summary.dir}:${doc}:${localDay(mtime)}`, type, at: mtime.toISOString(), title: `${type === 'estimation' ? 'Estimación' : type === 'analysis' ? 'Análisis' : 'Informe'} · ${label}`, ...base, detail: doc });
    }
  }
  return events;
};

// ---------------------------------------------------------------- almacenamiento por día (se borra lo que pasa de 5 días)
const readDay = (day: string): ActivityEvent[] => {
  try {
    const file = join(dir(), `${day}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ActivityEvent[]) : [];
  } catch {
    return [];
  }
};

/** Borra los archivos de días que quedaron fuera de la ventana de 5 días. */
export const pruneActivity = (now = new Date()): string[] => {
  if (!existsSync(dir())) return [];
  const keep = new Set(windowDays(now));
  const removed: string[] = [];
  for (const name of readdirSync(dir())) {
    const day = name.replace(/\.json$/, '');
    if (DAY.test(day) && !keep.has(day)) {
      rmSync(join(dir(), name), { force: true });
      removed.push(day);
    }
  }
  return removed;
};

/** Suma los eventos nuevos a lo ya guardado (lo visto una vez se conserva aunque git lo reescriba) y devuelve la ventana. */
export const mergeActivity = (events: ActivityEvent[], now = new Date()): Record<string, ActivityEvent[]> => {
  const days = windowDays(now);
  mkdirSync(dir(), { recursive: true });
  const result: Record<string, ActivityEvent[]> = {};
  for (const day of days) {
    const byId = new Map(readDay(day).map((event) => [event.id, event]));
    for (const event of events) if (dayOf(event.at) === day) byId.set(event.id, event);
    const list = [...byId.values()].sort((a, b) => b.at.localeCompare(a.at));
    result[day] = list;
    if (list.length) {
      const file = join(dir(), `${day}.json`);
      writeFileSync(`${file}.tmp`, JSON.stringify(list, null, 2));
      renameSync(`${file}.tmp`, file);
    }
  }
  pruneActivity(now);
  return result;
};

export const refreshActivity = async (config: DevPanelConfig, now = new Date(), runner: Runner = run): Promise<Record<string, ActivityEvent[]>> => {
  const since = startOfWindow(now);
  const events = [...(await collectGit(config, since, runner)), ...collectTickets(config, since)];
  return mergeActivity(events, now);
};

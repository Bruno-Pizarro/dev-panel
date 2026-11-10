import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { collectGit } from './activity.js';
import { agentsToday, localDayKey } from './activityBar.js';
import { ticketOfText } from './agents.js';
import { getDailyChecklist } from './checklists.js';
import { listContainers } from './containers.js';
import { readRepoStates, type RepoState } from './nudges.js';
import type { OrchSession } from './orchestration.js';

/**
 * Los HECHOS del día para los logros, récords, festejos y el cierre del día (la parte divertida del panel): cuántos commits, cuántos
 * agentes y en paralelo, tokens, el checklist, el estado del git y de los servicios. Solo datos locales; el navegador decide qué
 * desbloquea con ellos (ver `web/src/lib/rewards`). Nada de esto sale de la máquina.
 */
export interface RewardFacts {
  generatedAt: string;
  /** AAAA-MM-DD de esta máquina. */
  day: string;
  /** 0 = domingo. */
  weekday: number;
  commits: {
    today: number;
    /** HH:MM del primero y del último commit de hoy. */
    firstToday: string | null;
    lastToday: string | null;
    /** Esta semana (desde el lunes). */
    week: number;
    /** Commits por día de los últimos 14 días. */
    byDay: Record<string, number>;
  };
  /** Números de ticket con commits hoy. */
  ticketsToday: string[];
  repos: { dirty: number; unpushed: number; onProtectedWithChanges: boolean };
  agents: { today: number; running: number; finishedToday: number; maxParallelToday: number; tokensToday: number; tokensWeek: number; modelsToday: string[] };
  checklist: { total: number; done: number; items: Record<string, boolean> };
  services: { running: number; total: number } | null;
  workday: { entry: string; exit: string };
}

const MS_DAY = 86_400_000;
const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const family = (model: string | null): string | null => (model ? (/(opus|sonnet|haiku|fable)/i.exec(model)?.[1]?.toLowerCase() ?? null) : null);

/** Máximo de agentes que corrieron a la vez (los que siguen trabajando llegan hasta ahora). */
export const maxParallel = (intervals: Array<{ start: number; end: number }>): number => {
  const points = intervals.flatMap(({ start, end }) => [{ at: start, delta: 1 }, { at: Math.max(end, start + 1), delta: -1 }]);
  // A igual hora, primero se cierran los que terminan (dos agentes seguidos no cuentan como paralelos).
  points.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let best = 0;
  for (const point of points) {
    current += point.delta;
    best = Math.max(best, current);
  }
  return best;
};

export interface FactsDeps {
  now?: Date;
  runner?: Runner;
  commits?: (since: Date) => Promise<Array<{ at: string; title: string }>>;
  repoStates?: () => Promise<RepoState[]>;
  containers?: typeof listContainers;
  sessions?: () => OrchSession[];
  checklist?: () => Array<{ id: string; done: boolean }>;
}

export const collectRewardFacts = async (config: DevPanelConfig, deps: FactsDeps = {}): Promise<RewardFacts> => {
  const now = deps.now ?? new Date();
  const runner = deps.runner ?? run;
  const safe = async <T,>(job: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await job();
    } catch {
      return fallback;
    }
  };
  const day = localDayKey(now);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(startOfToday.getTime() - ((now.getDay() + 6) % 7) * MS_DAY);
  const since = new Date(startOfToday.getTime() - 13 * MS_DAY);

  const events = await safe(() => (deps.commits ? deps.commits(since) : collectGit(config, since, runner).then((all) => all.filter((event) => event.type === 'commit'))), [] as Array<{ at: string; title: string }>);
  const byDay: Record<string, number> = {};
  for (const event of events) byDay[localDayKey(new Date(event.at))] = (byDay[localDayKey(new Date(event.at))] ?? 0) + 1;
  const todays = events.filter((event) => localDayKey(new Date(event.at)) === day).sort((a, b) => a.at.localeCompare(b.at));
  const week = events.filter((event) => new Date(event.at).getTime() >= monday.getTime()).length;
  const ticketsToday = [...new Set(todays.map((event) => ticketOfText(event.title)).filter((ticket): ticket is string => ticket !== null))].sort();

  const repoStates = await safe(() => (deps.repoStates ? deps.repoStates() : readRepoStates(config, runner)), [] as RepoState[]);
  const protectedBranches = new Set([config.git.baseBranch, 'main', 'master', 'produccion']);
  const repos = { dirty: repoStates.reduce((sum, repo) => sum + repo.dirty, 0), unpushed: repoStates.reduce((sum, repo) => sum + repo.ahead, 0), onProtectedWithChanges: repoStates.some((repo) => repo.dirty > 0 && protectedBranches.has(repo.branch)) };

  const sessions = deps.sessions ? deps.sessions() : [];
  const agentList = sessions.flatMap((session) => session.agents);
  const nowMs = now.getTime();
  const todayStart = startOfToday.getTime();
  const intervals = agentList
    .filter((agent) => agent.startedAt && (agent.status === 'running' || Date.parse(agent.endedAt ?? agent.startedAt) >= todayStart))
    .map((agent) => ({ start: Math.max(todayStart, Date.parse(agent.startedAt!)), end: agent.status === 'running' ? nowMs : Date.parse(agent.endedAt ?? agent.startedAt!) }));
  const weekStart = localDayKey(new Date(startOfToday.getTime() - 6 * MS_DAY));
  const tokensWeek = sessions.reduce((sum, session) => {
    const add = (byDayTokens: Record<string, number>) => Object.entries(byDayTokens).reduce((inner, [key, value]) => (key >= weekStart && key <= day ? inner + value : inner), 0);
    return sum + add(session.main.byDay) + session.agents.reduce((inner, agent) => inner + add(agent.byDay), 0);
  }, 0);
  const base = agentsToday(sessions, day);
  const startedToday = agentList.filter((agent) => agent.startedAt && localDayKey(new Date(agent.startedAt)) === day);
  const agents = {
    today: base.today,
    running: base.running,
    finishedToday: agentList.filter((agent) => agent.status === 'done' && agent.endedAt && localDayKey(new Date(agent.endedAt)) === day).length,
    maxParallelToday: maxParallel(intervals),
    tokensToday: base.tokensToday,
    tokensWeek,
    modelsToday: [...new Set(startedToday.map((agent) => family(agent.model)).filter((model): model is string => model !== null))].sort(),
  };

  const items = await safe(async () => (deps.checklist ? deps.checklist() : getDailyChecklist(config.checklists.daily).items), [] as Array<{ id: string; done: boolean }>);
  const containers = await safe(() => (deps.containers ?? listContainers)(runner), []);
  const required = [...config.startup.stage1, ...config.startup.stage2, ...config.startup.mandatory];
  const services = containers.length === 0 ? null : { running: required.filter((service) => containers.some((container) => container.service === service && container.state === 'running')).length, total: required.length };

  return {
    generatedAt: now.toISOString(),
    day,
    weekday: now.getDay(),
    commits: { today: todays.length, firstToday: todays[0] ? hhmm(new Date(todays[0].at)) : null, lastToday: todays.at(-1) ? hhmm(new Date(todays.at(-1)!.at)) : null, week, byDay },
    ticketsToday,
    repos,
    agents,
    checklist: { total: items.length, done: items.filter((item) => item.done).length, items: Object.fromEntries(items.map((item) => [item.id, item.done])) },
    services,
    workday: { entry: config.workday.entry, exit: config.workday.exit },
  };
};

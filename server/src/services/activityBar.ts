import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { collectGit } from './activity.js';
import { listContainers } from './containers.js';
import { ticketFromBranch } from './gitRepos.js';
import { readRepoStates, type RepoState } from './nudges.js';
import type { OrchSession } from './orchestration.js';

/**
 * Datos de la barra de actividad del pie (una fila fina en todas las pantallas): en qué se está trabajando, lo hecho hoy, los agentes de
 * Claude, la jornada y el entorno. Solo datos locales (git, Docker y las transcripciones de Claude Code): no consulta Redmine ni GitLab.
 */
export interface ActivityBar {
  generatedAt: string;
  /** El repo en el que se está trabajando (el de más cambios sin commitear o, si no, el del último commit). */
  context: { repo: string; branch: string; ticket: string | null; dirty: number; ahead: number } | null;
  commitsToday: number;
  /** Servicios obligatorios corriendo; null si Docker no responde. */
  services: { running: number; total: number } | null;
  workday: { entry: string; exit: string };
  agents: { running: number; today: number; tokensToday: number };
}

const pad = (value: number) => String(value).padStart(2, '0');
export const localDayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** El repo en el que se está trabajando: el de más archivos sin commitear; si ninguno tiene, el del commit más reciente. */
export const pickContext = (repos: RepoState[]): ActivityBar['context'] => {
  const dirty = [...repos].filter((repo) => repo.dirty > 0).sort((a, b) => b.dirty - a.dirty || (b.lastCommitAt?.getTime() ?? 0) - (a.lastCommitAt?.getTime() ?? 0))[0];
  const chosen = dirty ?? [...repos].filter((repo) => repo.lastCommitAt).sort((a, b) => b.lastCommitAt!.getTime() - a.lastCommitAt!.getTime())[0];
  return chosen ? { repo: chosen.repo, branch: chosen.branch, ticket: ticketFromBranch(chosen.branch), dirty: chosen.dirty, ahead: chosen.ahead } : null;
};

/** Agentes en curso, agentes de hoy y tokens de hoy (la conversación y sus agentes) a partir de las sesiones de orquestación. */
export const agentsToday = (sessions: OrchSession[], day: string): ActivityBar['agents'] => {
  const agents = sessions.flatMap((session) => session.agents);
  const startedToday = (iso: string | null) => iso !== null && localDayKey(new Date(iso)) === day;
  return {
    running: agents.filter((agent) => agent.status === 'running').length,
    today: agents.filter((agent) => startedToday(agent.startedAt)).length,
    tokensToday: sessions.reduce((sum, session) => sum + (session.main.byDay[day] ?? 0) + session.agents.reduce((inner, agent) => inner + (agent.byDay[day] ?? 0), 0), 0),
  };
};

export interface ActivityDeps {
  now?: Date;
  runner?: Runner;
  repoStates?: () => Promise<RepoState[]>;
  commits?: (since: Date) => Promise<number>;
  containers?: typeof listContainers;
  sessions?: () => OrchSession[];
}

export const collectActivityBar = async (config: DevPanelConfig, deps: ActivityDeps = {}): Promise<ActivityBar> => {
  const now = deps.now ?? new Date();
  const runner = deps.runner ?? run;
  const safe = async <T,>(job: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await job();
    } catch {
      return fallback;
    }
  };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const repos = await safe(() => (deps.repoStates ? deps.repoStates() : readRepoStates(config, runner)), [] as RepoState[]);
  const commitsToday = await safe(() => (deps.commits ? deps.commits(start) : collectGit(config, start, runner).then((events) => events.filter((event) => event.type === 'commit').length)), 0);
  const containers = await safe(() => (deps.containers ?? listContainers)(runner), []);
  const required = [...config.startup.stage1, ...config.startup.stage2, ...config.startup.mandatory];
  const services = containers.length === 0 ? null : { running: required.filter((service) => containers.some((container) => container.service === service && container.state === 'running')).length, total: required.length };
  return {
    generatedAt: now.toISOString(),
    context: pickContext(repos),
    commitsToday,
    services,
    workday: { entry: config.workday.entry, exit: config.workday.exit },
    agents: agentsToday(deps.sessions ? deps.sessions() : [], localDayKey(now)),
  };
};

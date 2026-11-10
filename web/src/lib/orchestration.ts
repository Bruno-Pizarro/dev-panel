import type { AgentStep } from './types';

/** Orquestación de Claude Code tal como la entrega `GET /api/orchestration` (ver `server/src/services/orchestration.ts`). */
export interface OrchTokens {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
}
export type AgentStatus = 'running' | 'done' | 'lost';
export interface OrchAgent {
  agentId: string;
  toolUseId: string | null;
  parentAgentId: string | null;
  depth: number;
  type: string;
  description: string;
  model: string | null;
  background: boolean;
  status: AgentStatus;
  startedAt: string | null;
  endedAt: string | null;
  tokens: OrchTokens;
  byDay: Record<string, number>;
  toolCount: number;
  toolStats: Record<string, number>;
  source: 'transcript' | 'hook';
}
export interface OrchSession {
  id: string;
  account: string;
  title: string | null;
  project: string | null;
  branch: string | null;
  entrypoint: string | null;
  ticket: string | null;
  firstAt: string | null;
  lastAt: string | null;
  main: { tokens: OrchTokens; byDay: Record<string, number>; toolCount: number };
  agents: OrchAgent[];
}
export interface OrchestrationReport {
  generatedAt: string;
  sessions: OrchSession[];
}
export interface AgentContent {
  request: string | null;
  response: string | null;
  steps: AgentStep[];
  available: boolean;
}

/** Lo que cuenta como «tokens»: entrada, salida y caché creada. La caché leída se muestra aparte (es enorme y casi gratis). */
export const tokensOf = (tokens: OrchTokens): number => tokens.input + tokens.output + tokens.cacheCreate;

export const formatTokens = (value: number): string => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} M` : value >= 1000 ? `${Math.round(value / 1000)} k` : String(value));

/** `1 h 05 min`, `4 min 12 s`, `38 s`. */
export const formatSpan = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes > 0) return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
  return `${seconds} s`;
};

/** `claude-opus-5-5` → `opus`. */
export const modelFamily = (model: string | null): string | null => {
  if (!model) return null;
  return /(opus|sonnet|haiku|fable)/i.exec(model)?.[1]?.toLowerCase() ?? model.slice(0, 20);
};

export const agentEnd = (agent: OrchAgent, now: number): number | null => (agent.status === 'running' ? now : agent.endedAt ? Date.parse(agent.endedAt) : null);
export const agentDuration = (agent: OrchAgent, now: number): number | null => {
  const end = agentEnd(agent, now);
  return agent.startedAt && end !== null ? Math.max(0, end - Date.parse(agent.startedAt)) : null;
};

// ------------------------------------------------------------------ árbol
export interface TreeRow {
  agent: OrchAgent;
  /** 0 = lo lanzó la conversación; 1 = lo lanzó un agente… */
  level: number;
  children: number;
  collapsed: boolean;
}

const byStart = (a: OrchAgent, b: OrchAgent): number => (a.startedAt ?? '').localeCompare(b.startedAt ?? '') || a.agentId.localeCompare(b.agentId);

/** Las filas del árbol en orden (cada agente seguido de los que lanzó), salteando lo de adentro de las ramas cerradas. */
export const buildRows = (agents: OrchAgent[], collapsed: ReadonlySet<string>): TreeRow[] => {
  const ids = new Set(agents.map((agent) => agent.agentId));
  const children = new Map<string | null, OrchAgent[]>();
  for (const agent of agents) {
    const parent = agent.parentAgentId && ids.has(agent.parentAgentId) ? agent.parentAgentId : null;
    children.set(parent, [...(children.get(parent) ?? []), agent]);
  }
  const rows: TreeRow[] = [];
  const walk = (parent: string | null, level: number): void => {
    for (const agent of [...(children.get(parent) ?? [])].sort(byStart)) {
      const count = children.get(agent.agentId)?.length ?? 0;
      const closed = collapsed.has(agent.agentId);
      rows.push({ agent, level, children: count, collapsed: closed && count > 0 });
      if (!closed) walk(agent.agentId, level + 1);
    }
  };
  walk(null, 0);
  return rows;
};

/** Los agentes que tienen hijos (para «Colapsar todo»). */
export const parentsOf = (agents: OrchAgent[]): string[] => [...new Set(agents.map((agent) => agent.parentAgentId).filter((id): id is string => id !== null && agents.some((agent) => agent.agentId === id)))];

// ------------------------------------------------------------------ línea de tiempo
export interface Span {
  start: number;
  end: number;
}

/** El tramo de tiempo que cubre la sesión (del primer agente al último que terminó, o ahora si hay alguno trabajando). */
export const spanOf = (agents: OrchAgent[], now: number): Span | null => {
  const starts = agents.map((agent) => (agent.startedAt ? Date.parse(agent.startedAt) : NaN)).filter((value) => !Number.isNaN(value));
  if (!starts.length) return null;
  const ends = agents.map((agent) => agentEnd(agent, now)).filter((value): value is number => value !== null);
  const start = Math.min(...starts);
  return { start, end: Math.max(start + 1000, ...ends) };
};

/** Posición y ancho (en %) de la barra de un agente dentro del tramo. Siempre se ve (mínimo 0,8 %). */
export const barOf = (agent: OrchAgent, span: Span, now: number): { left: number; width: number } | null => {
  if (!agent.startedAt) return null;
  const total = span.end - span.start;
  const start = Date.parse(agent.startedAt);
  const end = agentEnd(agent, now) ?? start;
  const left = Math.min(99.2, Math.max(0, ((start - span.start) / total) * 100));
  const width = Math.min(100 - left, Math.max(0.8, ((Math.max(end, start) - start) / total) * 100));
  return { left, width };
};

// ------------------------------------------------------------------ resumen y filtros
export interface SessionSummary {
  agents: number;
  running: number;
  tokens: number;
  mainTokens: number;
  durationMs: number | null;
  models: string[];
  tools: number;
}

export const summarize = (session: OrchSession, now: number): SessionSummary => {
  const span = spanOf(session.agents, now);
  const first = session.firstAt ? Date.parse(session.firstAt) : span?.start ?? null;
  const last = session.lastAt ? Date.parse(session.lastAt) : span?.end ?? null;
  return {
    agents: session.agents.length,
    running: session.agents.filter((agent) => agent.status === 'running').length,
    tokens: session.agents.reduce((sum, agent) => sum + tokensOf(agent.tokens), 0),
    mainTokens: tokensOf(session.main.tokens),
    durationMs: first !== null && last !== null ? Math.max(0, last - first) : null,
    models: [...new Set(session.agents.map((agent) => modelFamily(agent.model)).filter((model): model is string => model !== null))].sort(),
    tools: session.agents.reduce((sum, agent) => sum + agent.toolCount, 0),
  };
};

export interface Filters {
  q: string;
  status: 'all' | AgentStatus;
  model: string;
  type: string;
  ticket: string;
}
export const NO_FILTERS: Filters = { q: '', status: 'all', model: 'all', type: 'all', ticket: 'all' };

const norm = (value: string) => value.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');

const agentMatches = (agent: OrchAgent, filters: Filters): boolean => {
  if (filters.status !== 'all' && agent.status !== filters.status) return false;
  if (filters.model !== 'all' && modelFamily(agent.model) !== filters.model) return false;
  if (filters.type !== 'all' && agent.type !== filters.type) return false;
  return true;
};

/** Las sesiones que quedan con los filtros; en cada una, solo los agentes que coinciden (el texto busca también en título, carpeta, rama y ticket). */
export const filterSessions = (sessions: OrchSession[], filters: Filters): OrchSession[] => {
  const text = norm(filters.q.trim());
  const agentFilters = filters.status !== 'all' || filters.model !== 'all' || filters.type !== 'all';
  const out: OrchSession[] = [];
  for (const session of sessions) {
    if (filters.ticket !== 'all' && session.ticket !== filters.ticket) continue;
    const sessionText = norm([session.title, session.project, session.branch, session.ticket, session.id].filter(Boolean).join(' '));
    const sessionHit = text !== '' && sessionText.includes(text);
    const agents = session.agents.filter((agent) => agentMatches(agent, filters) && (text === '' || sessionHit || norm(`${agent.description} ${agent.type} ${agent.agentId}`).includes(text)));
    if (agents.length > 0 || (!agentFilters && (text === '' || sessionHit) && session.agents.length === 0)) out.push({ ...session, agents });
  }
  return out;
};

/** Tokens de un día (`AAAA-MM-DD`, hora de esta máquina) de todas las sesiones: la conversación y sus agentes. */
export const tokensOnDay = (sessions: OrchSession[], day: string): number => sessions.reduce((sum, session) => sum + (session.main.byDay[day] ?? 0) + session.agents.reduce((inner, agent) => inner + (agent.byDay[day] ?? 0), 0), 0);

export const localDay = (now: number): string => {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

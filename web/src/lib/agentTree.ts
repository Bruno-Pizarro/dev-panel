import type { AgentRun } from './types';

export interface AgentSession {
  sessionId: string;
  /** Carpeta de trabajo de la sesión (la más reciente que informó alguno de sus agentes). */
  project: string | null;
  /** El ticket que más se repite entre sus agentes. */
  ticket: string | null;
  /** Sus agentes, del primero al último que arrancó. */
  runs: AgentRun[];
  running: number;
  startedAt: string;
  /** Última actividad (el arranque o el fin más reciente): ordena las sesiones. */
  lastAt: string;
}

/** `mm:ss` (o `h:mm:ss` pasada la hora) para un tiempo en milisegundos. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pair = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pair(minutes)}:${pair(seconds)}` : `${pair(minutes)}:${pair(seconds)}`;
};

const mostFrequent = (values: Array<string | null>): string | null => {
  const counts = new Map<string, number>();
  values.forEach((value) => value && counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
};

/** Agrupa los agentes por sesión de Claude (el nivel de arriba del árbol); la sesión más reciente primero. */
export const groupSessions = (runs: AgentRun[]): AgentSession[] => {
  const bySession = new Map<string, AgentRun[]>();
  runs.forEach((run) => bySession.set(run.sessionId, [...(bySession.get(run.sessionId) ?? []), run]));
  return [...bySession.entries()]
    .map(([sessionId, items]): AgentSession => {
      const sorted = [...items].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id));
      const times = sorted.flatMap((run) => [run.startedAt, run.endedAt ?? run.startedAt]);
      return {
        sessionId,
        project: [...sorted].reverse().find((run) => run.project)?.project ?? null,
        ticket: mostFrequent(sorted.map((run) => run.ticket)),
        runs: sorted,
        running: sorted.filter((run) => run.status === 'running').length,
        startedAt: sorted[0]!.startedAt,
        lastAt: times.reduce((latest, time) => (Date.parse(time) > Date.parse(latest) ? time : latest)),
      };
    })
    .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt) || a.sessionId.localeCompare(b.sessionId));
};

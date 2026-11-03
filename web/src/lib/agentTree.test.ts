import { describe, expect, it } from 'vitest';
import { formatDuration, groupSessions } from './agentTree';
import type { AgentRun } from './types';

const run = (over: Partial<AgentRun>): AgentRun => ({ id: 'r', sessionId: 's1', type: 'Explore', description: 'x', startedAt: '2026-11-03T12:00:00Z', endedAt: null, status: 'running', agentId: null, project: null, ticket: null, hasRequest: false, hasResponse: false, ...over });

describe('árbol de agentes', () => {
  it('agrupa por sesión, la más reciente primero, con sus agentes en orden de arranque', () => {
    const sessions = groupSessions([
      run({ id: 'b', sessionId: 'viejo', startedAt: '2026-11-03T09:00:00Z', endedAt: '2026-11-03T09:05:00Z', status: 'done' }),
      run({ id: 'c', sessionId: 'nuevo', startedAt: '2026-11-03T12:10:00Z' }),
      run({ id: 'a', sessionId: 'nuevo', startedAt: '2026-11-03T12:00:00Z', endedAt: '2026-11-03T12:02:00Z', status: 'done' }),
    ]);
    expect(sessions.map((session) => session.sessionId)).toEqual(['nuevo', 'viejo']);
    expect(sessions[0]!.runs.map((item) => item.id)).toEqual(['a', 'c']);
    expect(sessions[0]).toMatchObject({ running: 1, startedAt: '2026-11-03T12:00:00Z' });
    expect(sessions[1]!.running).toBe(0);
  });

  it('la carpeta es la más reciente informada y el ticket el que más se repite', () => {
    const [session] = groupSessions([
      run({ id: '1', project: 'front', ticket: '33526', startedAt: '2026-11-03T10:00:00Z' }),
      run({ id: '2', project: 'legajo', ticket: '33527', startedAt: '2026-11-03T11:00:00Z' }),
      run({ id: '3', project: null, ticket: '33527', startedAt: '2026-11-03T12:00:00Z' }),
    ]);
    expect(session).toMatchObject({ project: 'legajo', ticket: '33527' });
  });

  it('una sesión sin carpeta ni ticket queda con ambos en null; sin agentes no hay sesiones', () => {
    expect(groupSessions([run({})])[0]).toMatchObject({ project: null, ticket: null });
    expect(groupSessions([])).toEqual([]);
  });

  it('formatDuration: mm:ss y h:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(47_000)).toBe('00:47');
    expect(formatDuration(95_000)).toBe('01:35');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('00:00');
  });
});

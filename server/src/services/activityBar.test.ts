import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { agentsToday, collectActivityBar, pickContext } from './activityBar.js';
import type { RepoState } from './nudges.js';
import type { OrchSession } from './orchestration.js';

const repo = (over: Partial<RepoState> & { repo: string }): RepoState => ({ branch: 'feature/33939-x', dirty: 0, ahead: 0, lastCommitAt: new Date(2026, 10, 10, 9), ...over });
const zero = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };

describe('contexto: en qué se está trabajando', () => {
  it('el repo con más archivos sin commitear; con la rama y el ticket', () => {
    const context = pickContext([repo({ repo: 'front', dirty: 2 }), repo({ repo: 'legajo', dirty: 5, branch: 'feature/33528-notif' }), repo({ repo: 'firma' })]);
    expect(context).toMatchObject({ repo: 'legajo', branch: 'feature/33528-notif', ticket: '33528', dirty: 5 });
  });
  it('sin cambios, el repo del commit más reciente; sin nada, null', () => {
    const context = pickContext([repo({ repo: 'front', lastCommitAt: new Date(2026, 10, 10, 8) }), repo({ repo: 'legajo', lastCommitAt: new Date(2026, 10, 10, 11) })]);
    expect(context?.repo).toBe('legajo');
    expect(pickContext([])).toBeNull();
    expect(pickContext([repo({ repo: 'x', lastCommitAt: null })])).toBeNull();
  });
});

describe('agentes de hoy', () => {
  const session = (agents: Array<{ id: string; status: 'running' | 'done'; startedAt: string; byDay: Record<string, number> }>): OrchSession => ({ id: 's', account: 'c', title: null, project: null, branch: null, entrypoint: null, ticket: null, firstAt: null, lastAt: null, main: { tokens: zero, byDay: { '2026-11-10': 100 }, toolCount: 0 }, agents: agents.map((a) => ({ agentId: a.id, toolUseId: null, parentAgentId: null, depth: 1, type: 'x', description: 'd', model: null, background: false, status: a.status, startedAt: a.startedAt, endedAt: null, tokens: zero, byDay: a.byDay, toolCount: 0, toolStats: {}, source: 'transcript' as const })) });
  it('cuenta los que trabajan, los que arrancaron hoy y los tokens de hoy (la conversación y los agentes)', () => {
    const out = agentsToday([session([{ id: 'a', status: 'running', startedAt: new Date(2026, 10, 10, 10).toISOString(), byDay: { '2026-11-10': 50, '2026-11-09': 999 } }, { id: 'b', status: 'done', startedAt: new Date(2026, 10, 9, 10).toISOString(), byDay: { '2026-11-09': 7 } }])], '2026-11-10');
    expect(out).toEqual({ running: 1, today: 1, tokensToday: 150 });
  });
});

describe('collectActivityBar (todo simulado)', () => {
  const config = { ...defaultConfig('/x'), workday: { entry: '09:00', exit: '18:00', punchUrl: '' }, startup: { ...defaultConfig('/x').startup, stage1: ['rabbitmq'], stage2: ['mongo'], mandatory: ['panel', 'security'] } };
  it('arma la barra con las fuentes y una que falla no la rompe', async () => {
    const bar = await collectActivityBar(config, {
      now: new Date(2026, 10, 10, 15),
      repoStates: async () => [repo({ repo: 'front', dirty: 3 })],
      commits: async () => 4,
      containers: async () => [{ name: 'a', state: 'running', status: 'Up', ports: '', image: '', service: 'panel', startedAt: null }, { name: 'b', state: 'exited', status: 'Exited', ports: '', image: '', service: 'mongo', startedAt: null }],
      sessions: () => [],
    });
    expect(bar).toMatchObject({ commitsToday: 4, context: { repo: 'front', ticket: '33939' }, services: { running: 1, total: 4 }, workday: { entry: '09:00', exit: '18:00' }, agents: { running: 0, today: 0, tokensToday: 0 } });
    const broken = await collectActivityBar(config, { repoStates: async () => { throw new Error('x'); }, commits: async () => { throw new Error('y'); }, containers: async () => { throw new Error('z'); } });
    expect(broken).toMatchObject({ context: null, commitsToday: 0, services: null });
  });
});

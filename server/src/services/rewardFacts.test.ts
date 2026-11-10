import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { collectRewardFacts, maxParallel } from './rewardFacts.js';
import type { OrchSession } from './orchestration.js';

const NOW = new Date(2026, 10, 10, 15, 0); // martes
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).toISOString();
const zero = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };

describe('agentes en paralelo', () => {
  it('el máximo que corrió a la vez; dos seguidos no cuentan como paralelos', () => {
    expect(maxParallel([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 8, end: 9 }])).toBe(3);
    expect(maxParallel([{ start: 0, end: 10 }, { start: 10, end: 20 }])).toBe(1);
    expect(maxParallel([])).toBe(0);
  });
});

describe('hechos del día', () => {
  const agent = (id: string, over: Record<string, unknown>) => ({ agentId: id, toolUseId: null, parentAgentId: null, depth: 1, type: 'x', description: 'd', model: 'claude-opus-5-5', background: false, status: 'done' as const, startedAt: at(10, 10), endedAt: at(10, 11), tokens: zero, byDay: { '2026-11-10': 100 }, toolCount: 0, toolStats: {}, source: 'transcript' as const, ...over });
  const session: OrchSession = { id: 's', account: 'c', title: null, project: null, branch: null, entrypoint: null, ticket: null, firstAt: null, lastAt: null, main: { tokens: zero, byDay: { '2026-11-10': 50, '2026-11-05': 7 }, toolCount: 0 }, agents: [agent('a', {}), agent('b', { startedAt: at(10, 10, 30), endedAt: at(10, 12) }), agent('c', { status: 'running', endedAt: null, startedAt: at(10, 11), model: 'claude-haiku-5-5' }), agent('viejo', { startedAt: at(2, 9), endedAt: at(2, 10), byDay: { '2026-11-02': 999 } })] };

  const deps = {
    now: NOW,
    commits: async () => [
      { at: at(10, 7, 45), title: 'feat: algo (#33939)' },
      { at: at(10, 9, 10), title: 'fix: otra cosa [33528]' },
      { at: at(10, 13), title: 'chore: sin ticket' },
      { at: at(9, 18), title: 'ayer' },
      { at: at(3, 10), title: 'semana pasada' },
    ],
    repoStates: async () => [{ repo: 'front', branch: 'desarrollo', dirty: 2, ahead: 1, lastCommitAt: null }, { repo: 'legajo', branch: 'feature/x', dirty: 0, ahead: 3, lastCommitAt: null }],
    containers: async () => [{ name: 'a', state: 'running', status: 'Up', ports: '', image: '', service: 'panel', startedAt: null }],
    sessions: () => [session],
    checklist: () => [{ id: 'marcar-entrada', done: true }, { id: 'marcar-salida', done: false }],
  };
  const config = { ...defaultConfig('/x'), workday: { entry: '09:00', exit: '18:00', punchUrl: '' }, startup: { ...defaultConfig('/x').startup, stage1: [], stage2: [], mandatory: ['panel', 'security'] } };

  it('commits de hoy, primero y último, semana y por día; tickets con commits', async () => {
    const facts = await collectRewardFacts(config, deps);
    expect(facts).toMatchObject({ day: '2026-11-10', weekday: 2, commits: { today: 3, firstToday: '07:45', lastToday: '13:00', week: 4 }, ticketsToday: ['33528', '33939'] });
    expect(facts.commits.byDay).toMatchObject({ '2026-11-10': 3, '2026-11-09': 1, '2026-11-03': 1 });
  });
  it('estado del git: cambios, sin pushear y cambios en una rama protegida', async () => {
    expect((await collectRewardFacts(config, deps)).repos).toEqual({ dirty: 2, unpushed: 4, onProtectedWithChanges: true });
  });
  it('agentes: de hoy, trabajando, terminados, en paralelo, tokens y modelos', async () => {
    const { agents } = await collectRewardFacts(config, deps);
    expect(agents).toMatchObject({ today: 3, running: 1, finishedToday: 2, maxParallelToday: 2, tokensToday: 350, modelsToday: ['haiku', 'opus'] });
    // tokens de la semana: hoy (50 + 3 × 100) y el 05 (7) entran; el 02 (999) queda afuera
    expect(agents.tokensWeek).toBe(350 + 7);
  });
  it('checklist y servicios', async () => {
    const facts = await collectRewardFacts(config, deps);
    expect(facts.checklist).toEqual({ total: 2, done: 1, items: { 'marcar-entrada': true, 'marcar-salida': false } });
    expect(facts.services).toEqual({ running: 1, total: 2 });
  });
  it('una fuente que falla no rompe los hechos', async () => {
    const facts = await collectRewardFacts(config, { now: NOW, commits: async () => { throw new Error('x'); }, repoStates: async () => { throw new Error('y'); }, containers: async () => { throw new Error('z'); }, checklist: () => { throw new Error('w'); } });
    expect(facts).toMatchObject({ commits: { today: 0, firstToday: null }, repos: { dirty: 0 }, services: null, checklist: { total: 0, done: 0 } });
  });
});

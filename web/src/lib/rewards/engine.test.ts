import { describe, expect, it } from 'vitest';
import { PRAISE_GAP_MS, PRAISE_MAX_PER_DAY, step, updateCounters } from './engine';
import { EMPTY_GAME, type GameState, type RewardEvent, type RewardFacts } from './types';

const PREFS = { enabled: true, achievements: true, celebrations: true, praise: true };
const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
const facts = (n: number, over: Partial<RewardFacts> = {}): RewardFacts => ({ generatedAt: '', day: day(n), weekday: 2, commits: { today: 0, firstToday: null, lastToday: null, week: 0, byDay: {} }, ticketsToday: [], repos: { dirty: 0, unpushed: 0, onProtectedWithChanges: false }, agents: { today: 0, running: 0, finishedToday: 0, maxParallelToday: 0, tokensToday: 0, tokensWeek: 0, modelsToday: [] }, checklist: { total: 0, done: 0, items: {} }, services: null, workday: { entry: '09:00', exit: '18:00' }, ...over });
const withCommits = (n: number, count: number) => facts(n, { commits: { today: count, firstToday: '09:00', lastToday: '10:00', week: count, byDay: { [day(n)]: count } } });
const at = (n: number, h = 15) => new Date(2026, 10, n, h);
const run = (state: GameState, f: RewardFacts, now: Date, rng = () => 0.99) => step({ state, facts: f, now, prefs: PREFS, rng });
const ids = (events: RewardEvent[]) => events.filter((e) => e.type === 'achievement').map((e) => (e as { id: string }).id);

describe('contadores de toda la vida', () => {
  it('suman solo lo nuevo (los agentes y commits de hoy no se cuentan dos veces)', () => {
    let state = { ...EMPTY_GAME, counters: updateCounters(EMPTY_GAME, facts(10, { agents: { ...facts(10).agents, today: 2 }, commits: { ...facts(10).commits, today: 3 } })) };
    expect(state.counters).toMatchObject({ agents: 2, commits: 3, activeDays: 1 });
    state = { ...state, counters: updateCounters(state, facts(10, { agents: { ...facts(10).agents, today: 5 }, commits: { ...facts(10).commits, today: 3 } })) };
    expect(state.counters).toMatchObject({ agents: 5, commits: 3, activeDays: 1 });
    state = { ...state, counters: updateCounters(state, facts(11, { agents: { ...facts(11).agents, today: 1 } })) };
    expect(state.counters).toMatchObject({ agents: 6, activeDays: 2 });
  });
  it('días con el checklist completo: una vez por día', () => {
    const done = facts(10, { checklist: { total: 2, done: 2, items: {} } });
    const first = { ...EMPTY_GAME, counters: updateCounters(EMPTY_GAME, done) };
    const again = updateCounters(first, done);
    expect(again.checklistDays).toBe(1);
    expect(updateCounters({ ...first, counters: again }, { ...done, day: day(11) }).checklistDays).toBe(2);
  });
});

describe('logros', () => {
  it('un logro diario se gana una vez por día y vuelve a ganarse al otro', () => {
    const first = run(EMPTY_GAME, withCommits(10, 1), at(10));
    expect(ids(first.events)).toContain('rompehielo');
    const same = run(first.state, withCommits(10, 2), at(10));
    expect(ids(same.events)).not.toContain('rompehielo');
    const next = run(same.state, withCommits(11, 1), at(11));
    expect(ids(next.events)).toContain('rompehielo');
    expect(next.state.unlocked['rompehielo']!.count).toBe(2);
  });
  it('uno de toda la vida se gana una sola vez y avisa que es la primera', () => {
    const f = facts(10, { agents: { ...facts(10).agents, today: 1 } });
    const first = run(EMPTY_GAME, f, at(10));
    expect(first.events.find((e) => e.type === 'achievement' && e.id === 'hola-agente')).toMatchObject({ first: true });
    expect(ids(run(first.state, { ...f, day: day(11) }, at(11)).events)).not.toContain('hola-agente');
  });
  it('cada logro viene con su festejo: más grande si es la primera vez de uno de toda la vida', () => {
    const { events } = run(EMPTY_GAME, facts(10, { agents: { ...facts(10).agents, today: 1 } }), at(10));
    expect(events).toContainEqual({ type: 'celebrate', reason: 'achievement:hola-agente', level: 'big' });
  });
  it('apagado no anuncia nada, pero sigue contando', () => {
    const { state, events } = step({ state: EMPTY_GAME, facts: withCommits(10, 3), now: at(10), prefs: { ...PREFS, enabled: false }, rng: () => 0 });
    expect(events).toEqual([]);
    expect(state.counters.commits).toBe(3);
  });
  it('sin festejos activados, el logro se anuncia pero sin confeti', () => {
    const { events } = step({ state: EMPTY_GAME, facts: withCommits(10, 1), now: at(10), prefs: { ...PREFS, celebrations: false }, rng: () => 0.99 });
    expect(ids(events)).toContain('rompehielo');
    expect(events.some((e) => e.type === 'celebrate')).toBe(false);
  });
});

describe('récords', () => {
  it('se festeja romper uno anterior (una vez por día) y suma al contador', () => {
    const state: GameState = { ...EMPTY_GAME, records: { commitsDay: { value: 4, day: day(3) } } };
    const { events, state: next } = run(state, withCommits(10, 7), at(10));
    expect(events).toContainEqual({ type: 'record', key: 'commitsDay', value: 7, previous: 4 });
    expect(next.counters.recordsBroken).toBe(1);
    expect(ids(events)).toContain('primer-record');
  });
});

describe('elogios sorpresa', () => {
  const good = withCommits(10, 1);
  it('salen cuando pasa algo bueno y hay suerte; con mala suerte, no', () => {
    expect(run(EMPTY_GAME, good, at(10), () => 0).events.some((e) => e.type === 'praise')).toBe(true);
    expect(run(EMPTY_GAME, good, at(10), () => 0.99).events.some((e) => e.type === 'praise')).toBe(false);
  });
  it('con una separación mínima y un tope por día', () => {
    const first = run(EMPTY_GAME, good, at(10, 10), () => 0);
    const tooSoon = run({ ...first.state, today: { ...first.state.today, earned: [] } }, good, new Date(first.state.today.lastPraiseAt + PRAISE_GAP_MS - 1000), () => 0);
    expect(tooSoon.events.some((e) => e.type === 'praise')).toBe(false);
    const later = run({ ...first.state, today: { ...first.state.today, earned: [] } }, good, new Date(first.state.today.lastPraiseAt + PRAISE_GAP_MS + 1000), () => 0);
    expect(later.events.some((e) => e.type === 'praise')).toBe(true);
    const capped = run({ ...first.state, today: { ...first.state.today, earned: [], praised: PRAISE_MAX_PER_DAY, lastPraiseAt: 0 } }, good, at(10, 12), () => 0);
    expect(capped.events.some((e) => e.type === 'praise')).toBe(false);
  });
  it('sin nada bueno que festejar no hay elogio', () => {
    expect(run(EMPTY_GAME, facts(10), at(10), () => 0).events).toEqual([]);
  });
});

describe('agentes que terminan', () => {
  it('un festejo chiquito cuando termina uno nuevo (no al abrir el panel)', () => {
    const base = facts(10, { agents: { ...facts(10).agents, today: 2, finishedToday: 1 } });
    const opened = run(EMPTY_GAME, base, at(10));
    expect(opened.events.some((e) => e.type === 'celebrate' && e.reason === 'agent-done')).toBe(false);
    const more = run(opened.state, { ...base, agents: { ...base.agents, finishedToday: 2 } }, at(10, 16));
    expect(more.events).toContainEqual({ type: 'celebrate', reason: 'agent-done', level: 'small' });
  });
});

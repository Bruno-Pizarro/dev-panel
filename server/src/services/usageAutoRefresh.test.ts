import { describe, expect, it } from 'vitest';
import { defaultConfig, type DevPanelConfig } from '../config.js';
import type { ClaudeAccount } from './claudeAccounts.js';
import { ACTIVE_WINDOW_MS, autoRefreshTick, createAutoRefreshState, STALE_MS } from './usageAutoRefresh.js';

const config = defaultConfig('/tmp/x') as DevPanelConfig;
const account = { id: 'a', label: 'A' } as ClaudeAccount;
const NOW = 10_000_000_000;

const setup = (over: { seen?: number; attempt?: number; age?: number | null; liveUsage?: boolean; account?: ClaudeAccount | null } = {}) => {
  const state = createAutoRefreshState();
  state.lastSeenAt = over.seen ?? NOW - 30_000;
  state.lastAttemptAt = over.attempt ?? 0;
  const calls: string[] = [];
  const tick = () =>
    autoRefreshTick({
      config: { ...config, claude: { ...config.claude, liveUsage: over.liveUsage ?? true } },
      state,
      now: NOW,
      account: over.account === undefined ? account : over.account,
      ageSeconds: () => (over.age === undefined ? STALE_MS / 1000 + 1 : over.age),
      refresh: async (_c, acc) => void calls.push(acc.id),
    });
  return { state, calls, tick };
};

describe('autoRefreshTick', () => {
  it('consulta si el panel está en uso y el dato tiene más de 10 minutos', async () => {
    const { calls, tick, state } = setup();
    expect(await tick()).toBe(true);
    expect(calls).toEqual(['a']);
    expect(state.lastAttemptAt).toBe(NOW);
  });
  it('consulta si todavía no hay ningún dato', async () => {
    const { tick } = setup({ age: null });
    expect(await tick()).toBe(true);
  });
  it('no consulta si el dato es reciente', async () => {
    const { calls, tick } = setup({ age: 9 * 60 });
    expect(await tick()).toBe(false);
    expect(calls).toEqual([]);
  });
  it('no consulta si nadie miró el uso en los últimos 15 minutos', async () => {
    const { tick } = setup({ seen: NOW - ACTIVE_WINDOW_MS - 1 });
    expect(await tick()).toBe(false);
  });
  it('un intento fallido no se repite antes de 10 minutos', async () => {
    const { tick } = setup({ attempt: NOW - 60_000 });
    expect(await tick()).toBe(false);
  });
  it('no hace nada sin cuenta activa o con la consulta en vivo desactivada', async () => {
    expect(await setup({ account: null }).tick()).toBe(false);
    expect(await setup({ liveUsage: false }).tick()).toBe(false);
  });
});

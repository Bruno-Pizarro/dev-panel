import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameStore, normalizeState, SAVE_DELAY_MS, type Legacy } from './gameStore';
import { EMPTY_GAME } from './types';

class HttpError extends Error {
  constructor(readonly status: number, readonly detail?: unknown) {
    super(`Error ${status}`);
  }
}

const server = (initial: { version: number; state: Record<string, unknown> | null; prefs: Record<string, unknown> | null }) => {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  let current = { ...initial, updatedAt: null as string | null };
  const api = {
    get: async <T,>(url: string): Promise<T> => (calls.push({ method: 'GET', url }), current as T),
    put: async <T,>(url: string, body: unknown): Promise<T> => {
      calls.push({ method: 'PUT', url, body });
      const input = body as { baseVersion: number; state?: Record<string, unknown>; prefs?: Record<string, unknown> };
      if (input.baseVersion !== current.version) throw new HttpError(409, { current });
      current = { ...current, version: current.version + 1, state: input.state ?? current.state, prefs: input.prefs ?? current.prefs };
      return current as T;
    },
  };
  return { api, calls, set: (next: typeof current) => (current = next), get: () => current };
};
const noLegacy: Legacy = { read: () => ({ state: null, prefs: null }), clear: () => undefined };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('lo divertido guardado en el servidor', () => {
  it('lee del servidor y completa con los valores por defecto lo que falta', async () => {
    const s = server({ version: 3, state: { unlocked: { rompehielo: { first: 'a', last: 'a', count: 1 } }, counters: { commits: 9 } }, prefs: { mascotId: 'oso' } });
    const store = createGameStore({ api: s.api, legacy: noLegacy });
    await store.load();
    const snap = store.getSnapshot();
    expect(snap).toMatchObject({ loaded: true, version: 3, prefs: { mascotId: 'oso', enabled: true } });
    expect(snap.state.unlocked['rompehielo']!.count).toBe(1);
    expect(snap.state.counters).toMatchObject({ commits: 9, agents: 0 });
  });

  it('un servidor sin nada deja el estado vacío', async () => {
    const store = createGameStore({ api: server({ version: 0, state: null, prefs: null }).api, legacy: noLegacy });
    await store.load();
    expect(store.getSnapshot().state).toEqual(EMPTY_GAME);
  });

  it('guarda con un pequeño retraso, juntando los cambios, y con la versión sobre la que se basó', async () => {
    const s = server({ version: 1, state: { a: 1 }, prefs: {} });
    const store = createGameStore({ api: s.api, legacy: noLegacy });
    await store.load();
    store.updatePrefs((p) => ({ ...p, mascotId: 'lobo' }));
    store.updatePrefs((p) => ({ ...p, mascotName: 'Lobito' }));
    expect(s.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    const puts = s.calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toMatchObject({ baseVersion: 1, prefs: { mascotId: 'lobo', mascotName: 'Lobito' } });
    expect(puts[0]!.body).not.toHaveProperty('state');
    expect(store.getSnapshot().version).toBe(2);
  });

  it('si otra pestaña guardó antes (409) toma lo vigente y conserva las preferencias propias', async () => {
    const s = server({ version: 1, state: { unlocked: {} }, prefs: { mascotId: 'oso' } });
    const store = createGameStore({ api: s.api, legacy: noLegacy });
    await store.load();
    // otra pestaña guarda un logro mientras tanto
    s.set({ version: 2, updatedAt: null, state: { unlocked: { madrugador: { first: 'x', last: 'x', count: 1 } } }, prefs: { mascotId: 'oso' } });
    store.updatePrefs((p) => ({ ...p, mascotId: 'zorro-pixel' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    const snap = store.getSnapshot();
    expect(snap.state.unlocked['madrugador']).toBeDefined();
    expect(snap.prefs.mascotId).toBe('zorro-pixel');
    expect(s.get().prefs).toMatchObject({ mascotId: 'zorro-pixel' });
    expect(s.get().state).toMatchObject({ unlocked: { madrugador: { count: 1 } } });
  });

  it('refresh trae lo que cambió desde otro dispositivo', async () => {
    const s = server({ version: 1, state: {}, prefs: {} });
    const store = createGameStore({ api: s.api, legacy: noLegacy });
    await store.load();
    s.set({ version: 5, updatedAt: null, state: { unlocked: { noctambulo: { first: 'x', last: 'x', count: 2 } } }, prefs: {} });
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ version: 5 });
    expect(store.getSnapshot().state.unlocked['noctambulo']!.count).toBe(2);
  });

  it('pasa al servidor, una sola vez, lo que había en este navegador', async () => {
    const s = server({ version: 0, state: null, prefs: null });
    let cleared = false;
    const legacy: Legacy = { read: () => ({ state: { unlocked: { rompehielo: { first: 'a', last: 'a', count: 1 } } }, prefs: { mascotId: 'panda' } }), clear: () => { cleared = true; } };
    const store = createGameStore({ api: s.api, legacy });
    await store.load();
    expect(s.get()).toMatchObject({ version: 1, state: { unlocked: { rompehielo: { count: 1 } } }, prefs: { mascotId: 'panda' } });
    expect(cleared).toBe(true);
    expect(store.getSnapshot().prefs.mascotId).toBe('panda');
  });

  it('si el servidor ya tenía datos, lo del navegador no los pisa', async () => {
    const s = server({ version: 2, state: { unlocked: {} }, prefs: { mascotId: 'oso' } });
    const legacy: Legacy = { read: () => ({ state: { unlocked: { x: 1 } }, prefs: { mascotId: 'panda' } }), clear: () => undefined };
    const store = createGameStore({ api: s.api, legacy });
    await store.load();
    expect(store.getSnapshot().prefs.mascotId).toBe('oso');
    expect(s.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('sin servidor sigue con los valores por defecto y reintenta con el próximo cambio', async () => {
    let up = false;
    const calls: string[] = [];
    const api = {
      get: async <T,>(): Promise<T> => {
        throw new Error('sin red');
      },
      put: async <T,>(url: string): Promise<T> => {
        calls.push(url);
        if (!up) throw new Error('sin red');
        return { version: 1 } as T;
      },
    };
    const store = createGameStore({ api, legacy: noLegacy });
    await store.load();
    expect(store.getSnapshot().loaded).toBe(true);
    store.updateState((s) => ({ ...s, flags: { ...s.flags, a: true } }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(calls).toHaveLength(1);
    up = true;
    await store.flush();
    expect(calls).toHaveLength(2);
  });
});

describe('estado normalizado', () => {
  it('un estado viejo o vacío se completa', () => {
    expect(normalizeState(null)).toEqual(EMPTY_GAME);
    expect(normalizeState({ counters: { agents: 4 } }).counters).toMatchObject({ agents: 4, commits: 0, streak: 0 });
  });
});

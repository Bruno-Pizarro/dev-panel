import { useEffect, useSyncExternalStore } from 'react';
import { api as realApi } from '../api';
import { DEFAULT_GAME_PREFS, EMPTY_GAME, gamePrefs, type GameState, type Prefs } from './types';

/**
 * Lo que recuerda lo divertido (logros, récords, contadores y preferencias) vive en el SERVIDOR (`data/game.json`, ver `server/src/services/gameStore.ts`):
 * así se ve igual desde cualquier navegador, también en una sesión remota. Acá hay una copia en memoria que se guarda sola, con un pequeño retraso, y
 * un número de versión: si otra pestaña o dispositivo guardó antes, se vuelve a leer lo vigente en vez de pisarlo.
 */
export interface GameSnapshot {
  loaded: boolean;
  version: number;
  state: GameState;
  prefs: Prefs;
}

interface ServerGame {
  version: number;
  updatedAt: string | null;
  state: Record<string, unknown> | null;
  prefs: Record<string, unknown> | null;
}

interface Api {
  get: <T>(url: string) => Promise<T>;
  put: <T>(url: string, body: unknown) => Promise<T>;
}

/** Un estado guardado antes de que existiera un campo se completa con los valores por defecto. */
export const normalizeState = (raw: Record<string, unknown> | null | undefined): GameState => {
  if (!raw) return EMPTY_GAME;
  const state = raw as Partial<GameState>;
  return { ...EMPTY_GAME, ...state, version: 1, unlocked: { ...(state.unlocked ?? {}) }, records: { ...(state.records ?? {}) }, flags: { ...(state.flags ?? {}) }, counters: { ...EMPTY_GAME.counters, ...(state.counters ?? {}) }, today: { ...EMPTY_GAME.today, ...(state.today ?? {}) } };
};

/** Lo que había en este navegador de antes de pasarlo al servidor (una sola vez). */
export interface Legacy {
  read: () => { state: Record<string, unknown> | null; prefs: Record<string, unknown> | null };
  clear: () => void;
}

const LOCAL_STATE = 'dev-panel.game.state';
const LOCAL_PREFS = 'dev-panel.game.prefs';
export const browserLegacy: Legacy = {
  read: () => {
    try {
      const parse = (key: string): Record<string, unknown> | null => {
        const raw = window.localStorage.getItem(key);
        const value: unknown = raw ? JSON.parse(raw) : null;
        return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
      };
      return { state: parse(LOCAL_STATE), prefs: parse(LOCAL_PREFS) };
    } catch {
      return { state: null, prefs: null };
    }
  },
  clear: () => {
    try {
      window.localStorage.removeItem(LOCAL_STATE);
      window.localStorage.removeItem(LOCAL_PREFS);
    } catch {
      /* sin almacenamiento */
    }
  },
};

export const SAVE_DELAY_MS = 400;

export const createGameStore = (deps: { api?: Api; legacy?: Legacy } = {}) => {
  const api = deps.api ?? realApi;
  const legacy = deps.legacy ?? browserLegacy;
  let snapshot: GameSnapshot = { loaded: false, version: 0, state: EMPTY_GAME, prefs: DEFAULT_GAME_PREFS };
  const listeners = new Set<() => void>();
  let dirtyState = false;
  let dirtyPrefs = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<void> | null = null;
  let loading: Promise<void> | null = null;

  const set = (next: GameSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const fromServer = (game: ServerGame): GameSnapshot => ({ loaded: true, version: game.version, state: normalizeState(game.state), prefs: gamePrefs(game.prefs as Partial<Prefs> | null) });

  /** Guarda lo pendiente. Si el servidor dice que otro guardó antes (409), toma lo vigente y vuelve a poner encima las preferencias propias (el estado del juego se vuelve a calcular). */
  const flush = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (saving) return saving;
    if (!dirtyState && !dirtyPrefs) return;
    saving = (async () => {
      const sendState = dirtyState;
      const sendPrefs = dirtyPrefs;
      dirtyState = false;
      dirtyPrefs = false;
      try {
        const saved = await api.put<ServerGame>('/api/game', { baseVersion: snapshot.version, ...(sendState ? { state: snapshot.state } : {}), ...(sendPrefs ? { prefs: snapshot.prefs } : {}) });
        set({ ...snapshot, version: saved.version });
      } catch (error) {
        const status = (error as { status?: number }).status;
        const current = (error as { detail?: { current?: ServerGame } }).detail?.current;
        if (status === 409 && current) {
          const mine = snapshot.prefs;
          set({ ...fromServer(current), prefs: sendPrefs ? mine : gamePrefs(current.prefs as Partial<Prefs> | null) });
          if (sendPrefs) dirtyPrefs = true;
        } else {
          // Sin servidor: lo local sigue en memoria y se reintenta con el próximo cambio.
          dirtyState = dirtyState || sendState;
          dirtyPrefs = dirtyPrefs || sendPrefs;
        }
      } finally {
        saving = null;
      }
      if (dirtyPrefs) schedule();
    })();
    return saving;
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  /** Lee del servidor lo vigente (si hay cambios propios pendientes, primero los guarda). La primera vez pasa a ahí lo que había en este navegador. */
  const refresh = async (): Promise<void> => {
    await flush();
    const game = await api.get<ServerGame>('/api/game');
    if (!snapshot.loaded && game.state === null && game.prefs === null) {
      const old = legacy.read();
      if (old.state || old.prefs) {
        set({ loaded: true, version: game.version, state: normalizeState(old.state), prefs: gamePrefs(old.prefs as Partial<Prefs> | null) });
        dirtyState = old.state !== null;
        dirtyPrefs = old.prefs !== null;
        await flush();
        if (!dirtyState && !dirtyPrefs) legacy.clear();
        return;
      }
    }
    set(fromServer(game));
  };

  const load = (): Promise<void> => {
    loading ??= refresh().catch(() => {
      // Sin servidor: se sigue con los valores por defecto y se vuelve a intentar al pedirlo de nuevo.
      set({ ...snapshot, loaded: true });
    }).finally(() => {
      loading = null;
    });
    return loading;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    refresh,
    flush,
    updateState: (next: GameState | ((current: GameState) => GameState)) => {
      set({ ...snapshot, state: typeof next === 'function' ? next(snapshot.state) : next });
      dirtyState = true;
      schedule();
    },
    updatePrefs: (next: Prefs | ((current: Prefs) => Prefs)) => {
      set({ ...snapshot, prefs: typeof next === 'function' ? next(snapshot.prefs) : next });
      dirtyPrefs = true;
      schedule();
    },
  };
};

/** El almacén único de la interfaz. */
export const gameStore = createGameStore();

/** El estado y las preferencias de lo divertido, con carga automática desde el servidor. */
export const useGame = (): GameSnapshot => {
  const snapshot = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
  useEffect(() => {
    if (!snapshot.loaded) void gameStore.load();
  }, [snapshot.loaded]);
  return snapshot;
};

export const useGameState = (): [GameState, GameSnapshot['loaded'], typeof gameStore.updateState] => {
  const snapshot = useGame();
  return [snapshot.state, snapshot.loaded, gameStore.updateState];
};

export const useGamePrefs = (): [Prefs, typeof gameStore.updatePrefs] => {
  const snapshot = useGame();
  return [snapshot.prefs, gameStore.updatePrefs];
};

import { loadConfig, type DevPanelConfig } from '../config.js';
import { loadAccounts, readUsage, refreshLiveUsage, type ClaudeAccount } from './claudeAccounts.js';

/** Un dato de uso más viejo que esto se vuelve a consultar solo. */
export const STALE_MS = 10 * 60_000;
/** Cada cuánto se revisa si hace falta (es una comparación local: no consulta nada por sí sola). */
export const CHECK_EVERY_MS = 60_000;
/** Solo se actualiza si alguien miró el uso hace menos de esto: sin el panel abierto no se gasta ninguna consulta. */
export const ACTIVE_WINDOW_MS = 15 * 60_000;

export interface AutoRefreshState {
  /** Última vez que el navbar leyó el uso (el front lo consulta cada 30 s mientras está abierto). */
  lastSeenAt: number;
  /** Último intento automático, haya salido bien o no: un fallo no se reintenta cada minuto. */
  lastAttemptAt: number;
}

export const createAutoRefreshState = (): AutoRefreshState => ({ lastSeenAt: 0, lastAttemptAt: 0 });

export interface AutoRefreshDeps {
  config: DevPanelConfig;
  state: AutoRefreshState;
  now: number;
  account: ClaudeAccount | null;
  /** Antigüedad (s) del último dato de la cuenta; null si no hay ninguno. */
  ageSeconds: (account: ClaudeAccount) => number | null;
  refresh: (config: DevPanelConfig, account: ClaudeAccount) => Promise<unknown>;
}

/**
 * Un chequeo: si el panel se está usando, la cuenta activa tiene un dato con más de 10 min (o ninguno) y el último intento
 * automático fue hace más de 10 min, consulta una vez. Respeta el freno del 429 y el mínimo entre consultas de
 * `refreshLiveUsage`, que siguen valiendo. Devuelve si consultó.
 */
export const autoRefreshTick = async ({ config, state, now, account, ageSeconds, refresh }: AutoRefreshDeps): Promise<boolean> => {
  if (!account || !config.claude.liveUsage) return false;
  if (now - state.lastSeenAt > ACTIVE_WINDOW_MS) return false;
  if (now - state.lastAttemptAt < STALE_MS) return false;
  const age = ageSeconds(account);
  if (age !== null && age * 1000 < STALE_MS) return false;
  state.lastAttemptAt = now;
  await refresh(config, account);
  return true;
};

export const autoRefreshState = createAutoRefreshState();

/** El navbar leyó el uso: el panel está en uso. */
export const markUsageSeen = (now = Date.now()): void => {
  autoRefreshState.lastSeenAt = now;
};

/** Arranca el chequeo periódico. El temporizador no mantiene vivo el proceso. */
export const startUsageAutoRefresh = (): (() => void) => {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    // La configuración se relee en cada chequeo: puede cambiar desde Ajustes sin reiniciar el panel.
    const state = loadConfig();
    if (!state.configured) return;
    running = true;
    const config = state.config;
    const data = loadAccounts();
    const account = data.accounts.find((item) => item.id === data.activeId) ?? null;
    autoRefreshTick({
      config,
      state: autoRefreshState,
      now: Date.now(),
      account,
      ageSeconds: (item) => readUsage([item])[item.id]?.ageSeconds ?? null,
      refresh: refreshLiveUsage,
    })
      .catch(() => undefined)
      .finally(() => {
        running = false;
      });
  }, CHECK_EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
};

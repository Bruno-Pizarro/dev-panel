import { loadConfig } from '../config.js';
import { ensureDailyToken } from './gitlabDaily.js';

const EVERY_MS = 3_600_000;

/** Al arrancar y cada hora: si el token diario de GitLab para Claude está activo y le quedan menos de 4 h, pide uno nuevo. */
export const startDailyTokenRefresh = (): void => {
  const tick = () => {
    const state = loadConfig();
    if (state.configured && state.config.claudeEnv.gitlabDaily) void ensureDailyToken(state.config).catch(() => undefined);
  };
  tick();
  setInterval(tick, EVERY_MS).unref();
};

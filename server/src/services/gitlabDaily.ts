import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { claudeEnvFile, listVars, readVars, setVar } from './claudeEnv.js';
import { GitlabError, parseSshToken } from './gitlab.js';

export const DAILY_VAR = 'GITLAB_RW_TOKEN';
/** El token dura 1 día: se renueva cuando le quedan menos de 4 horas. */
export const RENEW_AFTER_MS = 20 * 3_600_000;
const RETRY_MS = 5 * 60_000;

export interface DailyState {
  enabled: boolean;
  /** Cuándo se pidió el token vigente (ISO), si hay. */
  mintedAt: string | null;
  error: string | null;
}

let lastError: string | null = null;
let lastFailureAt = 0;

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

export const dailyState = (config: DevPanelConfig, file: string = claudeEnvFile()): DailyState => ({
  enabled: config.claudeEnv.gitlabDaily,
  mintedAt: listVars(file).find((entry) => entry.name === DAILY_VAR)?.setAt ?? null,
  error: lastError,
});

/** Revoca el token anterior con él mismo (DELETE /personal_access_tokens/self); si ya venció o falla, no importa. */
const revokeSelf = async (config: DevPanelConfig, token: string, fetcher: Fetcher): Promise<void> => {
  try {
    await fetcher(`${config.gitlab.baseUrl.replace(/\/$/, '')}/api/v4/personal_access_tokens/self`, { method: 'DELETE', headers: { 'PRIVATE-TOKEN': token }, signal: AbortSignal.timeout(10_000) });
  } catch {
    // el token ya no sirve o GitLab no responde: el de 1 día se borra solo
  }
};

/**
 * Deja en el archivo de Claude un token de GitLab (api + read/write_repository, 1 día) pedido por SSH, y revoca el anterior.
 * Si el vigente tiene menos de 20 h no hace nada (salvo `force`). El token nunca se devuelve ni se registra.
 */
export const ensureDailyToken = async (
  config: DevPanelConfig,
  options: { file?: string; runner?: Runner; fetcher?: Fetcher; now?: number; force?: boolean } = {},
): Promise<DailyState> => {
  const file = options.file ?? claudeEnvFile();
  const runner = options.runner ?? run;
  const now = options.now ?? Date.now();
  if (!config.claudeEnv.gitlabDaily) return dailyState(config, file);
  const state = dailyState(config, file);
  const age = state.mintedAt ? now - Date.parse(state.mintedAt) : Infinity;
  if (!options.force && age < RENEW_AFTER_MS) return state;
  if (lastFailureAt > 0 && now - lastFailureAt < RETRY_MS) return state;

  const host = config.gitlab.sshHost || new URL(config.gitlab.baseUrl).hostname;
  const result = await runner('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', `git@${host}`, 'personal_access_token', 'dev-panel-claude', 'api,read_repository,write_repository', '1'], 30_000);
  const token = parseSshToken(`${result.stdout}\n${result.stderr}`);
  if (!result.ok || !token) {
    lastFailureAt = now;
    lastError = `No se pudo pedir el token por SSH a ${host} (¿clave SSH cargada y sin passphrase?)`;
    return dailyState(config, file);
  }
  const previous = readVars(file)[DAILY_VAR];
  setVar(DAILY_VAR, token, { file, managed: true, now });
  if (previous) await revokeSelf(config, previous, options.fetcher ?? (fetch as unknown as Fetcher));
  lastError = null;
  lastFailureAt = 0;
  return dailyState(config, file);
};

export const resetDailyFailure = (): void => {
  lastError = null;
  lastFailureAt = 0;
};

/** Token de escritura vigente para quien necesite usarlo dentro del panel (nunca para devolverlo). */
export const dailyToken = (file: string = claudeEnvFile()): string => {
  const token = readVars(file)[DAILY_VAR];
  if (!token) throw new GitlabError('No hay token de GitLab con escritura: activalo en Configuración → Variables de Claude', 409);
  return token;
};

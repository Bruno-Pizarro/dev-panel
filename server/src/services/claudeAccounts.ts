import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { paths } from '../config.js';
import { run, type Runner } from '../docker.js';

export class ClaudeError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface ClaudeAccount {
  id: string;
  label: string;
  /** Canales RGB, ej. "99 179 237". */
  color: string;
  configDir: string;
}

export interface AccountsFile {
  activeId: string | null;
  accounts: ClaudeAccount[];
}

const DEFAULT_ID = 'default';
const registryFile = () => join(paths.data, 'claude-accounts.json');
const defaultDir = () => join(homedir(), '.claude');

export const slugify = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

/** La cuenta con la que ya se usa Claude Code hoy (~/.claude) aparece siempre, aunque no se haya registrado nada. */
export const loadAccounts = (): AccountsFile => {
  let stored: AccountsFile = { activeId: null, accounts: [] };
  try {
    if (existsSync(registryFile())) stored = JSON.parse(readFileSync(registryFile(), 'utf8')) as AccountsFile;
  } catch {
    /* archivo dañado: se parte de cero */
  }
  const hasDefault = stored.accounts.some((account) => account.id === DEFAULT_ID);
  const accounts = hasDefault ? stored.accounts : [{ id: DEFAULT_ID, label: 'Cuenta actual (~/.claude)', color: '138 151 255', configDir: defaultDir() }, ...stored.accounts];
  return { activeId: stored.activeId ?? DEFAULT_ID, accounts };
};

/** Se guardan solo las cuentas agregadas: la cuenta actual (~/.claude) se deduce siempre. */
const saveAccounts = (data: AccountsFile): void => {
  data = { ...data, accounts: data.accounts.filter((account) => account.id !== DEFAULT_ID) };
  mkdirSync(paths.data, { recursive: true });
  const temp = `${registryFile()}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(temp, registryFile());
};

export const addAccount = (input: { label: string; color: string; configDir?: string }): ClaudeAccount => {
  const label = input.label.trim();
  if (!label || label.length > 40) throw new ClaudeError('Poné un nombre de hasta 40 caracteres');
  if (!/^\d{1,3} \d{1,3} \d{1,3}$/.test(input.color)) throw new ClaudeError('Color inválido');
  const data = loadAccounts();
  let id = slugify(label) || 'cuenta';
  for (let n = 2; data.accounts.some((account) => account.id === id); n += 1) id = `${slugify(label) || 'cuenta'}-${n}`;
  const configDir = resolve(input.configDir?.trim() || join(homedir(), `.claude-${id}`));
  if (!configDir.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(configDir)) throw new ClaudeError('La carpeta debe ser una ruta absoluta');
  if (data.accounts.some((account) => resolve(account.configDir) === configDir)) throw new ClaudeError('Esa carpeta ya está registrada en otra cuenta');
  const account = { id, label, color: input.color, configDir };
  saveAccounts({ activeId: data.activeId, accounts: [...data.accounts, account] });
  return account;
};

export const removeAccount = (id: string): void => {
  if (id === DEFAULT_ID) throw new ClaudeError('La cuenta actual no se puede quitar de la lista');
  const data = loadAccounts();
  if (!data.accounts.some((account) => account.id === id)) throw new ClaudeError('Cuenta inexistente', 404);
  saveAccounts({ activeId: data.activeId === id ? DEFAULT_ID : data.activeId, accounts: data.accounts.filter((account) => account.id !== id) });
};

export const setActive = (id: string): void => {
  const data = loadAccounts();
  if (!data.accounts.some((account) => account.id === id)) throw new ClaudeError('Cuenta inexistente', 404);
  saveAccounts({ activeId: id, accounts: data.accounts });
};

// ---------------------------------------------------------------- estado de la sesión (`claude auth status`)
export interface AuthStatus {
  loggedIn: boolean;
  email: string | null;
  orgName: string | null;
  plan: string | null;
  method: string | null;
}

export const parseAuthStatus = (text: string): AuthStatus => {
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const str = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : null);
    return { loggedIn: data['loggedIn'] === true, email: str('email'), orgName: str('orgName'), plan: str('subscriptionType'), method: str('authMethod') };
  } catch {
    return { loggedIn: false, email: null, orgName: null, plan: null, method: null };
  }
};

/** Pregunta a la propia CLI (no abre ningún archivo de credenciales). */
export const readAuthStatus = async (config: DevPanelConfig, account: ClaudeAccount, runner: Runner = run): Promise<AuthStatus> => {
  const env = account.id === DEFAULT_ID ? undefined : { CLAUDE_CONFIG_DIR: account.configDir };
  const result = await (env ? runWithEnv(config.claude.binary, ['auth', 'status', '--json'], env) : runner(config.claude.binary, ['auth', 'status', '--json'], 20_000));
  return parseAuthStatus(result.stdout);
};

const runWithEnv = (file: string, args: string[], env: Record<string, string>) =>
  new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolvePromise) => {
    const child = spawn(file, args, { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', () => (clearTimeout(timer), resolvePromise({ ok: false, stdout: '', stderr: 'No se pudo ejecutar claude' })));
    child.on('close', (code) => (clearTimeout(timer), resolvePromise({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() })));
  });

// ---------------------------------------------------------------- login desde el panel
export type LoginStatus = 'idle' | 'starting' | 'waiting-code' | 'done' | 'error';
export interface LoginState {
  accountId: string | null;
  status: LoginStatus;
  url: string | null;
  message: string | null;
}

const URL_PATTERN = /https:\/\/[^\s"']+/;
/** El código que muestra la página de Anthropic: sin espacios ni saltos de línea. */
export const validCode = (code: string): boolean => /^[A-Za-z0-9._~#:%\-+/=]{8,600}$/.test(code.trim());

export const extractLoginUrl = (output: string): string | null => {
  const match = URL_PATTERN.exec(output);
  return match && /^https:\/\/(claude|console|platform)\.(com|anthropic\.com)\//.test(match[0]) ? match[0] : null;
};

/** Un único login a la vez: lanza `claude auth login`, muestra el enlace y le pasa el código que pegás. */
export class LoginManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private timer: NodeJS.Timeout | null = null;
  private output = '';
  state: LoginState = { accountId: null, status: 'idle', url: null, message: null };

  constructor(private readonly config: DevPanelConfig) {}

  start(account: ClaudeAccount): LoginState {
    this.cancel();
    if (account.id !== DEFAULT_ID) mkdirSync(account.configDir, { recursive: true, mode: 0o700 });
    this.output = '';
    this.state = { accountId: account.id, status: 'starting', url: null, message: null };
    const env = account.id === DEFAULT_ID ? process.env : { ...process.env, CLAUDE_CONFIG_DIR: account.configDir };
    const child = spawn(this.config.claude.binary, ['auth', 'login', '--claudeai'], { env });
    this.child = child;
    const onData = (chunk: Buffer) => {
      this.output += chunk.toString();
      const url = extractLoginUrl(this.output);
      if (url && this.state.status === 'starting') this.state = { ...this.state, status: 'waiting-code', url };
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', () => (this.state = { ...this.state, status: 'error', message: 'No se pudo ejecutar la CLI de Claude' }));
    child.on('close', (code) => {
      this.clear();
      if (this.state.status === 'error') return;
      this.state = code === 0 ? { ...this.state, status: 'done', message: 'Sesión iniciada' } : { ...this.state, status: 'error', message: 'El inicio de sesión no se completó' };
    });
    this.timer = setTimeout(() => this.cancel('Se agotó el tiempo (10 min)'), 10 * 60_000);
    return this.state;
  }

  submitCode(code: string): void {
    if (!this.child || this.state.status !== 'waiting-code') throw new ClaudeError('No hay un inicio de sesión esperando el código', 409);
    if (!validCode(code)) throw new ClaudeError('El código no tiene el formato esperado');
    this.child.stdin.write(`${code.trim()}\n`);
  }

  cancel(message: string | null = null): void {
    this.child?.kill('SIGTERM');
    this.clear();
    if (message) this.state = { ...this.state, status: 'error', message };
    else if (this.state.status === 'starting' || this.state.status === 'waiting-code') this.state = { accountId: null, status: 'idle', url: null, message: null };
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.child = null;
  }
}

// ---------------------------------------------------------------- uso (snapshots del statusLine)
export interface UsageWindow {
  usedPercentage: number;
  resetsAt: number;
}
export interface UsageSnapshot {
  /** De dónde sale el dato: el statusLine (oficial) o el caché local que Claude Code guarda en .claude.json (no documentado). */
  source: 'statusline' | 'cache';
  capturedAt: string;
  ageSeconds: number;
  model: string | null;
  costUsd: number | null;
  contextUsedPercentage: number | null;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
}

const windowOf = (value: unknown, nowSeconds: number): UsageWindow | null => {
  const data = value as { used_percentage?: unknown; resets_at?: unknown } | null;
  if (!data || typeof data.used_percentage !== 'number' || typeof data.resets_at !== 'number') return null;
  // Claude Code descarta una ventana cuando pasó su hora de reinicio: acá igual (el dato ya no vale).
  return data.resets_at > nowSeconds ? { usedPercentage: data.used_percentage, resetsAt: data.resets_at } : null;
};

export const toSnapshot = (raw: Record<string, unknown>, now = Date.now()): UsageSnapshot | null => {
  const captured = typeof raw['capturedAt'] === 'string' ? Date.parse(raw['capturedAt']) : NaN;
  if (Number.isNaN(captured)) return null;
  const limits = (raw['rateLimits'] ?? null) as { five_hour?: unknown; seven_day?: unknown } | null;
  return {
    source: 'statusline',
    capturedAt: new Date(captured).toISOString(),
    ageSeconds: Math.max(0, Math.round((now - captured) / 1000)),
    model: typeof raw['model'] === 'string' ? raw['model'] : null,
    costUsd: typeof raw['costUsd'] === 'number' ? raw['costUsd'] : null,
    contextUsedPercentage: typeof raw['contextUsedPercentage'] === 'number' ? raw['contextUsedPercentage'] : null,
    fiveHour: windowOf(limits?.five_hour, Math.floor(now / 1000)),
    sevenDay: windowOf(limits?.seven_day, Math.floor(now / 1000)),
  };
};

/** Archivo de estado global de Claude Code de una cuenta: ~/.claude.json para la actual, <carpeta>/.claude.json para las demás. */
export const stateFileOf = (account: ClaudeAccount, home: string = homedir()): string => (account.id === DEFAULT_ID ? join(home, '.claude.json') : join(account.configDir, '.claude.json'));

/**
 * Caché de límites que Claude Code mantiene en `.claude.json` (`cachedUsageUtilization`): es lo mismo que muestra
 * "Account & usage" en la extensión. Formato no documentado: se lee SOLO ese bloque y se descarta cualquier otro dato del archivo.
 */
export const readCachedUsage = (account: ClaudeAccount, now = Date.now(), home: string = homedir()): UsageSnapshot | null => {
  try {
    const file = stateFileOf(account, home);
    if (!existsSync(file)) return null;
    const cached = (JSON.parse(readFileSync(file, 'utf8')) as { cachedUsageUtilization?: { fetchedAtMs?: unknown; utilization?: Record<string, unknown> } }).cachedUsageUtilization;
    if (!cached || typeof cached.fetchedAtMs !== 'number' || !cached.utilization) return null;
    const windowFrom = (value: unknown): unknown => {
      const data = value as { utilization?: unknown; resets_at?: unknown } | null;
      return data && typeof data.utilization === 'number' && typeof data.resets_at === 'string' ? { used_percentage: data.utilization, resets_at: Date.parse(data.resets_at) / 1000 } : null;
    };
    const snapshot = toSnapshot({ capturedAt: new Date(cached.fetchedAtMs).toISOString(), rateLimits: { five_hour: windowFrom(cached.utilization['five_hour']), seven_day: windowFrom(cached.utilization['seven_day']) } }, now);
    return snapshot ? { ...snapshot, source: 'cache' } : null;
  } catch {
    return null;
  }
};

/** Último dato de cada cuenta: el más reciente entre el colector del statusLine (emparejado por carpeta) y el caché de Claude Code. */
export const readUsage = (accounts: ClaudeAccount[], now = Date.now(), home: string = homedir()): Record<string, UsageSnapshot | null> => {
  const result: Record<string, UsageSnapshot | null> = Object.fromEntries(accounts.map((account) => [account.id, null]));
  const consider = (id: string, snapshot: UsageSnapshot | null) => {
    if (snapshot && (!result[id] || snapshot.ageSeconds < result[id]!.ageSeconds)) result[id] = snapshot;
  };
  for (const account of accounts) consider(account.id, readCachedUsage(account, now, home));
  const dir = join(paths.data, 'claude-usage');
  if (!existsSync(dir)) return result;
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.json') && !file.startsWith('_'))) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
      const account = accounts.find((item) => resolve(item.configDir) === resolve(String(raw['configDir'] ?? '')));
      if (account) consider(account.id, toSnapshot(raw, now));
    } catch {
      /* archivo a medias o dañado: se ignora */
    }
  }
  return result;
};

/** Comandos listos para copiar: terminal y extensión de VS Code. */
export const launchSnippets = (account: ClaudeAccount) => ({
  terminal: account.id === DEFAULT_ID ? 'claude' : `CLAUDE_CONFIG_DIR=${account.configDir} claude`,
  alias: account.id === DEFAULT_ID ? null : `alias claude-${account.id}='CLAUDE_CONFIG_DIR=${account.configDir} claude'`,
  vscodeCode: account.id === DEFAULT_ID ? 'code .' : `CLAUDE_CONFIG_DIR=${account.configDir} code .`,
  vscodeSetting: account.id === DEFAULT_ID ? null : JSON.stringify({ 'claudeCode.environmentVariables': [{ name: 'CLAUDE_CONFIG_DIR', value: account.configDir }] }, null, 2),
});

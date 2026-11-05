import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Variables y tokens para que Claude los use sin leerlos: un archivo `NOMBRE=valor` fuera del repo (permisos 600) que solo
 * lee el panel y el wrapper `dpx`. Los valores no salen nunca por la API: solo los nombres y cuándo se guardaron.
 */
export const NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
export const MAX_VALUE = 4096;
/** Las administra el panel solo (no se editan ni se borran a mano). */
export const MANAGED_NAMES = ['GITLAB_RW_TOKEN'];

export class ClaudeEnvError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const claudeEnvFile = (env: NodeJS.ProcessEnv = process.env): string => env['DEV_PANEL_CLAUDE_ENV'] || join(homedir(), '.config', 'dev-panel', 'claude.env');
const metaFile = (file: string): string => `${file}.meta.json`;

export const parseEnv = (text: string): Record<string, string> => {
  const vars: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) vars[match[1]!] = match[2]!;
  }
  return vars;
};

const readText = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const readMeta = (file: string): Record<string, string> => {
  try {
    return JSON.parse(readText(metaFile(file)) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
};

/** Escritura atómica con permisos 600 (el archivo temporal ya nace restringido). */
const writeSecure = (file: string, content: string): void => {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, content, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, file);
};

/** Valores (solo para uso interno del panel: nunca devolverlos por la API). */
export const readVars = (file: string = claudeEnvFile()): Record<string, string> => parseEnv(readText(file));

export interface EnvVarInfo {
  name: string;
  /** Cuándo se guardó (ISO). */
  setAt: string | null;
  /** La administra el panel: no se edita ni se borra a mano. */
  managed: boolean;
}

export const listVars = (file: string = claudeEnvFile()): EnvVarInfo[] => {
  const meta = readMeta(file);
  return Object.keys(readVars(file))
    .sort()
    .map((name) => ({ name, setAt: meta[name] ?? null, managed: MANAGED_NAMES.includes(name) }));
};

const save = (file: string, vars: Record<string, string>, meta: Record<string, string>): void => {
  writeSecure(file, `${Object.entries(vars).map(([name, value]) => `${name}=${value}`).join('\n')}\n`);
  writeSecure(metaFile(file), `${JSON.stringify(meta, null, 2)}\n`);
};

const checkName = (name: string): void => {
  if (!NAME_PATTERN.test(name)) throw new ClaudeEnvError('El nombre va en mayúsculas, números y guion bajo (ej. GITHUB_TOKEN)');
};

/** Guarda una variable. `managed` lo usa el propio panel para las que administra (GITLAB_RW_TOKEN). */
export const setVar = (name: string, value: string, options: { file?: string; managed?: boolean; now?: number } = {}): void => {
  const file = options.file ?? claudeEnvFile();
  checkName(name);
  if (MANAGED_NAMES.includes(name) && !options.managed) throw new ClaudeEnvError('Esa variable la administra el panel');
  // eslint-disable-next-line no-control-regex
  if (!value || value.length > MAX_VALUE || /[\u0000-\u001f\u007f]/.test(value)) throw new ClaudeEnvError('El valor no puede estar vacío, tener saltos de línea ni pasar de 4096 caracteres');
  const vars = readVars(file);
  vars[name] = value;
  save(file, vars, { ...readMeta(file), [name]: new Date(options.now ?? Date.now()).toISOString() });
};

export const deleteVar = (name: string, options: { file?: string; managed?: boolean } = {}): void => {
  const file = options.file ?? claudeEnvFile();
  checkName(name);
  if (MANAGED_NAMES.includes(name) && !options.managed) throw new ClaudeEnvError('Esa variable la administra el panel');
  const vars = readVars(file);
  if (!(name in vars)) throw new ClaudeEnvError('No existe esa variable', 404);
  delete vars[name];
  const meta = readMeta(file);
  delete meta[name];
  save(file, vars, meta);
};

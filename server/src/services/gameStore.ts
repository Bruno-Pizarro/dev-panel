import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config.js';

/**
 * Lo que recuerda la parte divertida del panel (logros, récords, contadores y preferencias de la mascota y los festejos), guardado en
 * `data/game.json` en el servidor: así se ve igual desde cualquier navegador, también si abrís el panel de forma remota. El servidor no
 * interpreta el estado (lo arma y lo evalúa la interfaz): solo lo guarda con un número de versión para que dos pestañas no se pisen.
 */
export interface GameSnapshot {
  /** Sube en cada guardado; quien guarda dice sobre qué versión se basó. */
  version: number;
  updatedAt: string | null;
  /** El estado del juego (logros, récords…) o null si todavía no hay. */
  state: Record<string, unknown> | null;
  prefs: Record<string, unknown> | null;
}

export class GameConflict extends Error {
  constructor(readonly current: GameSnapshot) {
    super('El estado cambió desde otra pestaña o dispositivo');
    this.name = 'GameConflict';
  }
}

/** Tope del archivo: un estado normal ocupa unos pocos KB. */
export const MAX_BYTES = 512 * 1024;

const file = () => join(paths.data, 'game.json');
const EMPTY: GameSnapshot = { version: 0, updatedAt: null, state: null, prefs: null };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export const readGame = (): GameSnapshot => {
  try {
    const parsed: unknown = existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : null;
    if (!isRecord(parsed)) return EMPTY;
    return { version: typeof parsed['version'] === 'number' ? parsed['version'] : 0, updatedAt: typeof parsed['updatedAt'] === 'string' ? parsed['updatedAt'] : null, state: isRecord(parsed['state']) ? parsed['state'] : null, prefs: isRecord(parsed['prefs']) ? parsed['prefs'] : null };
  } catch {
    return EMPTY;
  }
};

/** Preferencias conocidas, con su tipo: lo demás se descarta (el archivo no es un lugar para guardar cualquier cosa). */
const BOOLEANS = ['enabled', 'celebrations', 'achievements', 'praise', 'sound', 'closeDay', 'mascot'] as const;
export const cleanPrefs = (value: unknown): Record<string, unknown> => {
  const input = isRecord(value) ? value : {};
  const out: Record<string, unknown> = {};
  for (const key of BOOLEANS) if (typeof input[key] === 'boolean') out[key] = input[key];
  if (typeof input['mascotId'] === 'string' && /^[a-z0-9-]{1,40}$/.test(input['mascotId'])) out['mascotId'] = input['mascotId'];
  if (typeof input['mascotName'] === 'string') out['mascotName'] = input['mascotName'].slice(0, 20);
  return out;
};

/**
 * Guarda el estado y las preferencias. `baseVersion` es la versión sobre la que se basó quien guarda: si ya no es la actual, otro guardó antes
 * y se lanza `GameConflict` con lo vigente (quien guarda vuelve a leer y reintenta). Una pieza que no viene se conserva como estaba.
 */
export const writeGame = (input: { baseVersion: number; state?: unknown; prefs?: unknown }, now = new Date()): GameSnapshot => {
  const current = readGame();
  if (input.baseVersion !== current.version) throw new GameConflict(current);
  const next: GameSnapshot = {
    version: current.version + 1,
    updatedAt: now.toISOString(),
    state: input.state === undefined ? current.state : isRecord(input.state) ? input.state : current.state,
    prefs: input.prefs === undefined ? current.prefs : cleanPrefs(input.prefs),
  };
  const text = JSON.stringify(next);
  if (Buffer.byteLength(text) > MAX_BYTES) throw new RangeError('El estado es demasiado grande');
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(`${file()}.tmp`, text, { mode: 0o600 });
  renameSync(`${file()}.tmp`, file());
  return next;
};

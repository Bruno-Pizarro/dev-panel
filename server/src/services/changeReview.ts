import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config.js';

/**
 * Archivos de los cambios de un ticket que el usuario marcó como vistos (como el "Viewed" de GitHub). Por cada archivo se guarda
 * la huella que tenía al marcarlo: si después cambia (nuevo commit), la marca deja de valer y hay que verlo de nuevo.
 */
export type ViewedMap = Record<string, string>;

export const viewKey = (repo: string, scope: 'committed' | 'working', path: string): string => `${repo}|${scope}|${path}`;

const file = () => join(paths.data, 'change-review.json');
const readAll = (): Record<string, ViewedMap> => {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, ViewedMap>) : {};
  } catch {
    return {};
  }
};

export const getViewed = (dir: string): ViewedMap => readAll()[dir] ?? {};

/** Marca (con su huella actual) o desmarca un archivo. */
export const setViewed = (dir: string, key: string, signature: string | null): ViewedMap => {
  const all = readAll();
  const current = { ...(all[dir] ?? {}) };
  if (signature === null) delete current[key];
  else current[key] = signature;
  all[dir] = current;
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(`${file()}.tmp`, JSON.stringify(all, null, 2), { mode: 0o600 });
  renameSync(`${file()}.tmp`, file());
  return current;
};

export type ViewedState = 'yes' | 'changed' | 'no';

/** "yes": marcado y sin cambios desde entonces; "changed": estaba marcado pero el archivo cambió; "no": sin marcar. */
export const viewedStateOf = (viewed: ViewedMap, key: string, signature: string): ViewedState =>
  !(key in viewed) ? 'no' : viewed[key] === signature ? 'yes' : 'changed';

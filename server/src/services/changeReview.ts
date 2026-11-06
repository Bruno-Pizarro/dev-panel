import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
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

// ---- Para mostrar «solo lo que cambió desde que lo viste» hace falta saber CÓMO era el archivo al marcarlo.

/** Un archivo commiteado ya lo guarda git (la huella lleva el id del blob); uno sin commitear se copia acá al marcarlo. */
const snapshotDir = () => join(paths.data, 'change-snapshots');
const MAX_SNAPSHOT_BYTES = 1024 * 1024;
const SIGNATURE_NAME = /^[0-9a-f]{40}$/;

/** Guarda una copia del archivo tal como estaba al marcarlo (la huella es su hash). Sin copia (muy grande, ilegible) se mostrará completo. */
export const saveSnapshot = (signature: string, absolutePath: string): boolean => {
  try {
    if (!SIGNATURE_NAME.test(signature) || statSync(absolutePath).size > MAX_SNAPSHOT_BYTES) return false;
    mkdirSync(snapshotDir(), { recursive: true });
    const target = join(snapshotDir(), signature);
    if (!existsSync(target)) writeFileSync(target, readFileSync(absolutePath), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
};

export const snapshotPath = (signature: string): string | null => {
  if (!SIGNATURE_NAME.test(signature)) return null;
  const target = join(snapshotDir(), signature);
  return existsSync(target) ? target : null;
};

/** Referencia que acompaña a la marca (el commit del MR que se vio): los MRs no tienen blobs que comparar. */
const refsFile = () => join(paths.data, 'change-review-refs.json');
const readRefs = (): Record<string, Record<string, string>> => {
  try {
    return existsSync(refsFile()) ? (JSON.parse(readFileSync(refsFile(), 'utf8')) as Record<string, Record<string, string>>) : {};
  } catch {
    return {};
  }
};
export const getViewedRef = (dir: string, key: string): string | null => readRefs()[dir]?.[key] ?? null;
export const setViewedRef = (dir: string, key: string, ref: string | null): void => {
  const all = readRefs();
  const current = { ...(all[dir] ?? {}) };
  if (ref === null) delete current[key];
  else current[key] = ref;
  all[dir] = current;
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(`${refsFile()}.tmp`, JSON.stringify(all, null, 2), { mode: 0o600 });
  renameSync(`${refsFile()}.tmp`, refsFile());
};

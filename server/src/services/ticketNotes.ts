import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config.js';

/** Notas libres por ticket ("esperar a Nico por X", "falta probar celular"): `data/ticket-notes.json`, solo locales. */
export interface TicketNote {
  text: string;
  updatedAt: string | null;
}

export const MAX_NOTE = 5000;

const file = () => join(paths.data, 'ticket-notes.json');
const readAll = (): Record<string, TicketNote> => {
  try {
    const parsed: unknown = existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {};
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, TicketNote>) : {};
  } catch {
    return {};
  }
};

/** Texto con saltos de línea y tabulaciones, sin otros caracteres de control, recortado al máximo. */
export const cleanNote = (value: unknown): string => {
  // eslint-disable-next-line no-control-regex
  const text = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '') : '';
  return text.slice(0, MAX_NOTE);
};

export const getNote = (dir: string): TicketNote => {
  const note = readAll()[dir];
  return { text: typeof note?.text === 'string' ? note.text : '', updatedAt: note?.updatedAt ?? null };
};

/** Guarda la nota (un texto vacío la borra). */
export const setNote = (dir: string, value: unknown, now = new Date()): TicketNote => {
  const all = readAll();
  const text = cleanNote(value);
  if (text.trim()) all[dir] = { text, updatedAt: now.toISOString() };
  else delete all[dir];
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(`${file()}.tmp`, JSON.stringify(all, null, 2), { mode: 0o600 });
  renameSync(`${file()}.tmp`, file());
  return getNote(dir);
};

/** Carpetas que tienen nota (para marcarlas en las listas). */
export const dirsWithNotes = (): string[] => Object.keys(readAll());

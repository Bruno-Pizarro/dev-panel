import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config.js';

/**
 * Recordatorios del panel ("recordame mañana probar X"): datos locales en `data/reminders.json`. Se crean desde la interfaz o
 * desde Claude (herramienta MCP `reminder_add`, que solo agrega). Aparecen en "Para tener en cuenta" del Inicio cuando llega su
 * momento; uno sin fecha es un pendiente y se muestra hasta marcarlo como hecho.
 */
export interface Reminder {
  id: string;
  text: string;
  /** "AAAA-MM-DD" (ese día), un ISO con hora, o null (sin fecha: un pendiente). */
  at: string | null;
  createdAt: string;
  done: boolean;
  doneAt: string | null;
}

export class ReminderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'ReminderError';
  }
}

export const MAX_REMINDERS = 100;
export const MAX_TEXT = 200;
/** Los hechos se borran solos pasada una semana. */
export const KEEP_DONE_MS = 7 * 86_400_000;

const file = () => join(paths.data, 'reminders.json');
const readAll = (): Reminder[] => {
  try {
    const parsed: unknown = existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is Reminder => item !== null && typeof item === 'object' && typeof (item as Reminder).id === 'string' && typeof (item as Reminder).text === 'string') : [];
  } catch {
    return [];
  }
};
const writeAll = (list: Reminder[]): void => {
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(`${file()}.tmp`, JSON.stringify(list, null, 2), { mode: 0o600 });
  renameSync(`${file()}.tmp`, file());
};

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Texto de una línea, sin caracteres de control. */
export const cleanReminderText = (value: unknown): string => {
  // eslint-disable-next-line no-control-regex
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!text) throw new ReminderError('El recordatorio no puede estar vacío');
  return text.slice(0, MAX_TEXT);
};

/** "AAAA-MM-DD" válido, un ISO con hora válido (se guarda en ISO UTC) o null. */
export const normalizeAt = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ReminderError('La fecha no es válida');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime()) || localDay(date) !== value) throw new ReminderError('La fecha no es válida');
    return value;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new ReminderError('La fecha no es válida');
  return new Date(time).toISOString();
};

/** ¿Ya le toca mostrarse? Sin fecha, siempre; con día, desde ese día; con hora, desde ese momento. */
export const isDue = (reminder: Reminder, now: Date): boolean => {
  if (reminder.done) return false;
  if (reminder.at === null) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(reminder.at)) return localDay(now) >= reminder.at;
  return now.getTime() >= Date.parse(reminder.at);
};

const sortKey = (reminder: Reminder): string => reminder.at ?? '9999';

/** Todos, con los pendientes primero (por fecha) y los hechos al final; los hechos viejos se descartan. */
export const listReminders = (now = new Date()): Reminder[] => {
  const all = readAll();
  const kept = all.filter((reminder) => !reminder.done || (reminder.doneAt && now.getTime() - Date.parse(reminder.doneAt) <= KEEP_DONE_MS));
  if (kept.length !== all.length) writeAll(kept);
  return [...kept].sort((a, b) => Number(a.done) - Number(b.done) || sortKey(a).localeCompare(sortKey(b)) || a.createdAt.localeCompare(b.createdAt));
};

export const addReminder = (input: { text: unknown; at?: unknown }, now = new Date()): Reminder => {
  const list = readAll();
  if (list.filter((reminder) => !reminder.done).length >= MAX_REMINDERS) throw new ReminderError(`Hay demasiados recordatorios pendientes (máximo ${MAX_REMINDERS})`);
  const reminder: Reminder = { id: randomUUID(), text: cleanReminderText(input.text), at: normalizeAt(input.at), createdAt: now.toISOString(), done: false, doneAt: null };
  writeAll([...list, reminder]);
  return reminder;
};

export const setReminderDone = (id: string, done: boolean, now = new Date()): Reminder => {
  const list = readAll();
  const found = list.find((reminder) => reminder.id === id);
  if (!found) throw new ReminderError('Recordatorio inexistente', 404);
  found.done = done;
  found.doneAt = done ? now.toISOString() : null;
  writeAll(list);
  return found;
};

export const removeReminder = (id: string): void => {
  const list = readAll();
  if (!list.some((reminder) => reminder.id === id)) throw new ReminderError('Recordatorio inexistente', 404);
  writeAll(list.filter((reminder) => reminder.id !== id));
};

/** Los recordatorios que ya les toca mostrarse. */
export const dueReminders = (now = new Date()): Reminder[] => listReminders(now).filter((reminder) => isDue(reminder, now));

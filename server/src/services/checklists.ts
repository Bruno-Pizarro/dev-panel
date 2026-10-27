import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config.js';

export type Conclusion = 'aprobado' | 'requiere-cambios' | 'sin-conclusion';
export const CONCLUSIONS: Conclusion[] = ['aprobado', 'requiere-cambios', 'sin-conclusion'];

export class ChecklistError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const file = (name: string) => join(paths.data, name);
const read = <T>(name: string, fallback: T): T => {
  try {
    return existsSync(file(name)) ? (JSON.parse(readFileSync(file(name), 'utf8')) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (name: string, value: unknown): void => {
  mkdirSync(paths.data, { recursive: true });
  const temp = `${file(name)}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temp, file(name));
};

/** "Marcar entrada" → "marcar-entrada": id estable de un paso a partir de su texto. */
export const itemId = (label: string): string =>
  label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'paso';

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (date = new Date()): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEEP_DAYS = 14;

// ------------------------------------------------------------------ checklist diario
type DailyFile = Record<string, Record<string, boolean>>;

export interface DailyChecklist {
  date: string;
  items: Array<{ id: string; label: string; done: boolean }>;
}

export const getDailyChecklist = (labels: string[], date = localDay()): DailyChecklist => {
  if (!DAY.test(date)) throw new ChecklistError('Fecha inválida');
  const state = read<DailyFile>('daily-checklist.json', {})[date] ?? {};
  return { date, items: labels.map((label) => ({ id: itemId(label), label, done: state[itemId(label)] === true })) };
};

export const setDailyItem = (labels: string[], id: string, done: boolean, date = localDay()): DailyChecklist => {
  if (!DAY.test(date)) throw new ChecklistError('Fecha inválida');
  if (!labels.some((label) => itemId(label) === id)) throw new ChecklistError('Paso inexistente');
  const all = read<DailyFile>('daily-checklist.json', {});
  all[date] = { ...(all[date] ?? {}), [id]: done };
  // Solo se recuerdan los últimos días: el checklist es de todos los días, no un historial.
  const keep = Object.keys(all).sort().reverse().slice(0, KEEP_DAYS);
  write('daily-checklist.json', Object.fromEntries(keep.map((day) => [day, all[day]!])));
  return getDailyChecklist(labels, date);
};

// ------------------------------------------------------------------ checklist de cada tanda de pruebas
export interface TestRunState {
  items: Record<string, boolean>;
  conclusion: Conclusion | null;
  updatedAt: string | null;
}
type TestFile = Record<string, Record<string, TestRunState>>;

const emptyRun = (): TestRunState => ({ items: {}, conclusion: null, updatedAt: null });

export const getTestState = (dir: string): Record<string, TestRunState> => read<TestFile>('test-checklists.json', {})[dir] ?? {};

export const setTestRun = (dir: string, run: string, patch: { item?: { id: string; done: boolean }; conclusion?: Conclusion }, validItems: string[]): TestRunState => {
  if (!/^\d{1,3}$/.test(run)) throw new ChecklistError('Prueba inválida');
  if (patch.item && !validItems.includes(patch.item.id)) throw new ChecklistError('Paso inexistente');
  if (patch.conclusion && !CONCLUSIONS.includes(patch.conclusion)) throw new ChecklistError('Conclusión inválida');
  const all = read<TestFile>('test-checklists.json', {});
  const current = all[dir]?.[run] ?? emptyRun();
  const next: TestRunState = {
    items: patch.item ? { ...current.items, [patch.item.id]: patch.item.done } : current.items,
    conclusion: patch.conclusion ?? current.conclusion,
    updatedAt: new Date().toISOString(),
  };
  all[dir] = { ...(all[dir] ?? {}), [run]: next };
  write('test-checklists.json', all);
  return next;
};

export interface TestStatus {
  runs: number;
  /** Estado de la última tanda: lo marcado en el panel manda sobre lo que escribió la skill en ticket.json. */
  conclusion: Conclusion;
  checklistDone: number;
  checklistTotal: number;
}

/** Resumen de la última tanda de pruebas de un ticket (sin tandas registradas = "sin conclusión"). */
export const testStatusOf = (
  runs: Array<{ conclusion?: string | undefined }>,
  state: Record<string, TestRunState>,
  labels: string[],
): TestStatus => {
  if (!runs.length) return { runs: 0, conclusion: 'sin-conclusion', checklistDone: 0, checklistTotal: 0 };
  const last = String(runs.length - 1);
  const saved = state[last];
  const fromFile = CONCLUSIONS.find((value) => value === runs[runs.length - 1]?.conclusion);
  return {
    runs: runs.length,
    conclusion: saved?.conclusion ?? fromFile ?? 'sin-conclusion',
    checklistDone: labels.filter((label) => saved?.items[itemId(label)] === true).length,
    checklistTotal: labels.length,
  };
};

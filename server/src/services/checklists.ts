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

// ------------------------------------------------------------------ pruebas manuales de un ticket
export interface ManualCaseInput {
  caso: string;
  esperado?: string | undefined;
  grupo?: string | undefined;
  /** Path dentro del front (empieza con `/`): se abre contra `session.frontUrl` (por defecto http://localhost:4200). */
  ruta?: string | undefined;
  /** Enlace completo (solo http o https); manda sobre `ruta`. */
  url?: string | undefined;
}

/** Enlace para probar un caso: `url` (http/https) o `ruta` sobre la URL del front. Nada más: sin otros esquemas ni rutas que cambien de sitio. */
export const manualLink = (entry: Pick<ManualCaseInput, 'ruta' | 'url'>, frontUrl: string): string | null => {
  const url = entry.url?.trim();
  if (url) return /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
  const route = entry.ruta?.trim();
  if (!route || !route.startsWith('/') || route.startsWith('//') || /\s/.test(route)) return null;
  return `${frontUrl.replace(/\/+$/, '')}${route}`;
};
export interface ManualCase {
  id: string;
  caso: string;
  esperado: string | null;
  grupo: string | null;
  /** `ticket`: viene de ticket.json (solo lectura); `panel`: lo agregó el usuario desde el panel (se puede borrar). */
  source: 'ticket' | 'panel';
  done: boolean;
  /** Enlace para abrir y probar el caso (solo los que vienen de ticket.json). */
  enlace: string | null;
}
export interface ManualTests {
  items: ManualCase[];
  done: number;
  total: number;
}
interface ManualState {
  done: Record<string, boolean>;
  custom: Array<{ id: string; caso: string; esperado?: string }>;
}
type ManualFile = Record<string, ManualState>;

const MAX_CUSTOM = 100;
const MANUAL_FILE = 'manual-tests.json';

/** Id estable de un caso a partir de su texto (el texto de ticket.json puede cambiar de orden sin perder lo tildado). */
export const manualId = (text: string): string => {
  let hash = 5381;
  for (const char of text) hash = ((hash * 33) ^ char.codePointAt(0)!) >>> 0;
  return `${itemId(text).slice(0, 30)}-${hash.toString(16)}`;
};

const stateOf = (all: ManualFile, dir: string): ManualState => ({ done: all[dir]?.done ?? {}, custom: all[dir]?.custom ?? [] });

export const getManualTests = (dir: string, fromTicket: ManualCaseInput[], frontUrl = ''): ManualTests => {
  const state = stateOf(read<ManualFile>(MANUAL_FILE, {}), dir);
  const seen = new Set<string>();
  const items: ManualCase[] = [];
  for (const entry of fromTicket) {
    const id = manualId(`${entry.grupo ?? ''}|${entry.caso}`);
    if (seen.has(id) || !entry.caso.trim()) continue;
    seen.add(id);
    items.push({ id, caso: entry.caso.trim(), esperado: entry.esperado?.trim() || null, grupo: entry.grupo?.trim() || null, source: 'ticket', done: state.done[id] === true, enlace: frontUrl || entry.url ? manualLink(entry, frontUrl) : null });
  }
  for (const entry of state.custom) items.push({ id: entry.id, caso: entry.caso, esperado: entry.esperado ?? null, grupo: null, source: 'panel', done: state.done[entry.id] === true, enlace: null });
  return { items, done: items.filter((item) => item.done).length, total: items.length };
};

const saveManual = (dir: string, mutate: (state: ManualState) => void): void => {
  const all = read<ManualFile>(MANUAL_FILE, {});
  const state = stateOf(all, dir);
  mutate(state);
  all[dir] = state;
  write(MANUAL_FILE, all);
};

export const setManualDone = (dir: string, id: string, done: boolean, validIds: string[]): void => {
  if (!validIds.includes(id)) throw new ChecklistError('Caso inexistente');
  saveManual(dir, (state) => {
    state.done = { ...state.done, [id]: done };
  });
};

export const addManualCase = (dir: string, input: { caso: string; esperado?: string | undefined }): string => {
  const caso = input.caso.trim().slice(0, 300);
  if (!caso) throw new ChecklistError('Escribí el caso a probar');
  const id = manualId(`panel|${caso}`);
  saveManual(dir, (state) => {
    if (state.custom.length >= MAX_CUSTOM) throw new ChecklistError(`Máximo ${MAX_CUSTOM} casos propios por ticket`);
    if (state.custom.some((entry) => entry.id === id)) return;
    const esperado = input.esperado?.trim().slice(0, 300);
    state.custom.push({ id, caso, ...(esperado ? { esperado } : {}) });
  });
  return id;
};

export const removeManualCase = (dir: string, id: string): void => {
  const state = stateOf(read<ManualFile>(MANUAL_FILE, {}), dir);
  if (!state.custom.some((entry) => entry.id === id)) throw new ChecklistError('Solo se pueden borrar los casos agregados desde el panel');
  saveManual(dir, (next) => {
    next.custom = next.custom.filter((entry) => entry.id !== id);
    delete next.done[id];
  });
};

export const resetManualDone = (dir: string): void =>
  saveManual(dir, (state) => {
    state.done = {};
  });

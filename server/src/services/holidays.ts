import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config.js';

/**
 * Feriados de Argentina para el aviso del Inicio. Salen de la API pública argentinadatos.com (sin clave; no se manda ningún dato
 * personal, solo el año) y se guardan en `data/holidays-<año>.json`: se pide una vez por año.
 */
export interface Holiday {
  /** AAAA-MM-DD */
  date: string;
  name: string;
  /** inamovible, trasladable, puente… tal como lo informa la API. */
  type: string;
}

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const file = (year: number) => join(paths.data, `holidays-${year}.json`);

/** Mapea la respuesta de la API a la lista propia; ignora lo que no tiene fecha válida. */
export const parseHolidays = (raw: unknown): Holiday[] =>
  (Array.isArray(raw) ? raw : []).flatMap((entry: unknown) => {
    const item = entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const date = item['fecha'];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return [{ date, name: typeof item['nombre'] === 'string' ? item['nombre'] : 'Feriado', type: typeof item['tipo'] === 'string' ? item['tipo'] : '' }];
  });

const readSaved = (year: number): Holiday[] | null => {
  try {
    return existsSync(file(year)) ? (JSON.parse(readFileSync(file(year), 'utf8')) as Holiday[]) : null;
  } catch {
    return null;
  }
};

/** Los feriados de un año: lo guardado o, si no hay, la API (y se guarda). Si falla y no hay nada guardado, lista vacía. */
export const holidaysOf = async (year: number, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<Holiday[]> => {
  const saved = readSaved(year);
  if (saved) return saved;
  try {
    const response = await fetcher(`https://api.argentinadatos.com/v1/feriados/${year}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];
    const list = parseHolidays(await response.json());
    if (list.length) {
      mkdirSync(paths.data, { recursive: true });
      writeFileSync(`${file(year)}.tmp`, JSON.stringify(list), { mode: 0o600 });
      renameSync(`${file(year)}.tmp`, file(year));
    }
    return list;
  } catch {
    return [];
  }
};

const MS_DAY = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_DAY);

/** El feriado de hoy y el próximo dentro de `withinDays` días (sin contar hoy). Fechas en AAAA-MM-DD, del día local. */
export const upcomingHolidays = (holidays: Holiday[], today: string, withinDays = 7): { today: Holiday | null; next: { holiday: Holiday; inDays: number } | null } => {
  const base = dayNumber(today);
  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const todayHoliday = sorted.find((holiday) => holiday.date === today) ?? null;
  const next = sorted.find((holiday) => dayNumber(holiday.date) > base && dayNumber(holiday.date) - base <= withinDays);
  return { today: todayHoliday, next: next ? { holiday: next, inDays: dayNumber(next.date) - base } : null };
};

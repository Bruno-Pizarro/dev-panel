export interface DailyChoice {
  /** El día que se está mirando ("AAAA-MM-DD") y si es de hoy. */
  shown: string | null;
  /** Se muestra el último daily guardado porque todavía no hay uno de hoy. */
  fallback: boolean;
}

/**
 * Qué daily se abre primero: el elegido, si no el de hoy y, si todavía no se generó el de hoy, el último guardado (por ejemplo
 * el del viernes un lunes), que es el que hay que recordar para el update. Sin ningún daily guardado, hoy (vacío).
 */
export const dailyToShow = (chosen: string | null, today: string | null, saved: string[]): DailyChoice => {
  if (chosen) return { shown: chosen, fallback: false };
  if (!today) return { shown: null, fallback: false };
  if (saved.includes(today)) return { shown: today, fallback: false };
  const last = [...saved].filter((date) => date < today).sort().at(-1);
  return last ? { shown: last, fallback: true } : { shown: today, fallback: false };
};

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "viernes 31/10" para un día "AAAA-MM-DD". */
export const dayLabel = (date: string): string => {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year!, month! - 1, day!);
  return `${WEEKDAYS[d.getDay()]} ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
};

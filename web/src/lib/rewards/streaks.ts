/** Días seguidos de trabajo sin culpa: los fines de semana y los feriados no cortan una racha; un día hábil sin actividad, sí. */
const parse = (key: string): Date => new Date(`${key}T12:00:00`);
const keyOf = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** La racha después de un día con actividad: sigue si entre el último día activo y hoy solo hubo fines de semana o feriados; si no, vuelve a 1. */
export const nextStreak = (previous: number, lastDay: string, today: string, offDays: readonly string[] = []): number => {
  if (!lastDay) return 1;
  if (lastDay === today) return Math.max(1, previous);
  const end = parse(today).getTime();
  for (let cursor = parse(lastDay).getTime() + 86_400_000; cursor < end; cursor += 86_400_000) {
    const date = new Date(cursor);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    if (!weekend && !offDays.includes(keyOf(date))) return 1;
  }
  return previous + 1;
};

/** Días corridos entre dos fechas (AAAA-MM-DD). */
export const daysBetween = (from: string, to: string): number => Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);

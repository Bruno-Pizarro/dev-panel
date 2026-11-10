/** Barra de actividad del pie (ver `server/src/services/activityBar.ts`). */
export interface ActivityBarData {
  generatedAt: string;
  context: { repo: string; branch: string; ticket: string | null; dirty: number; ahead: number } | null;
  commitsToday: number;
  services: { running: number; total: number } | null;
  workday: { entry: string; exit: string };
  agents: { running: number; today: number; tokensToday: number };
}

export type SegmentId = 'context' | 'today' | 'agents' | 'workday' | 'services';
export const SEGMENT_LABELS: Record<SegmentId, string> = {
  context: 'En qué trabajás (repo, rama y ticket)',
  today: 'Lo de hoy (commits)',
  agents: 'Agentes de Claude y tokens de hoy',
  workday: 'Jornada (cuánto llevás)',
  services: 'Servicios del entorno',
};

export interface ActivityBarPrefs {
  enabled: boolean;
  segments: Record<SegmentId, boolean>;
}
export const DEFAULT_BAR_PREFS: ActivityBarPrefs = { enabled: true, segments: { context: true, today: true, agents: true, workday: true, services: true } };

/** Las preferencias guardadas antes de que existiera un segmento se completan con las de por defecto. */
export const withDefaults = (stored: Partial<ActivityBarPrefs> | null | undefined): ActivityBarPrefs => ({ enabled: stored?.enabled ?? true, segments: { ...DEFAULT_BAR_PREFS.segments, ...(stored?.segments ?? {}) } });

const minutesOf = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const span = (minutes: number): string => (minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`);

/** Cuánto lleva la jornada: antes de entrar, en curso (lo que llevás y lo que falta) o terminada. Sin horarios configurados, nada. */
export const workdayText = (now: Date, workday: { entry: string; exit: string }): { text: string; state: 'before' | 'during' | 'after' } | null => {
  const entry = minutesOf(workday.entry);
  const exit = minutesOf(workday.exit);
  if (entry === null || exit === null) return null;
  const current = now.getHours() * 60 + now.getMinutes();
  if (current < entry) return { text: `Entrás a las ${workday.entry}`, state: 'before' };
  if (current >= exit) return { text: `Jornada terminada (${workday.exit})`, state: 'after' };
  return { text: `${span(current - entry)} · faltan ${span(exit - current)}`, state: 'during' };
};

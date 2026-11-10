import type { GameState, RecordKey, RewardFacts } from './types';

export interface RecordDef {
  key: RecordKey;
  label: string;
  emoji: string;
  /** Cómo se muestra el valor. */
  format: (value: number) => string;
  /** `max`: gana el más alto; `min`: gana el más bajo (llegar más temprano). */
  better: 'max' | 'min';
  /** Menos que esto no es un récord digno de festejar. */
  minimum: number;
  value: (facts: RewardFacts) => number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const minutesOf = (time: string | null): number | null => {
  const match = time ? /^(\d{2}):(\d{2})$/.exec(time) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** Días seguidos con commits, hasta hoy. Los fines de semana sin commits no cortan la racha, y si hoy todavía no hubo, cuenta desde ayer. */
export const commitStreak = (byDay: Record<string, number>, today: string): number => {
  const parse = (key: string) => new Date(`${key}T12:00:00`);
  const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  let cursor = parse(today);
  let streak = 0;
  for (let step = 0; step < 14; step += 1) {
    const key = keyOf(cursor);
    const commits = byDay[key] ?? 0;
    const weekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    if (commits > 0) streak += 1;
    else if (!weekend && !(step === 0 && key === today)) break;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
};

export const RECORDS: RecordDef[] = [
  { key: 'commitsDay', label: 'Más commits en un día', emoji: '🔥', format: (v) => `${v}`, better: 'max', minimum: 3, value: (f) => f.commits.today },
  { key: 'parallel', label: 'Más agentes en paralelo', emoji: '🎼', format: (v) => `${v}`, better: 'max', minimum: 3, value: (f) => f.agents.maxParallelToday },
  { key: 'agentsDay', label: 'Más agentes lanzados en un día', emoji: '🤖', format: (v) => `${v}`, better: 'max', minimum: 5, value: (f) => f.agents.today },
  { key: 'tokensDay', label: 'Más tokens en un día', emoji: '🪙', format: (v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')} M` : `${Math.round(v / 1000)} k`), better: 'max', minimum: 500_000, value: (f) => f.agents.tokensToday },
  { key: 'commitsWeek', label: 'Más commits en una semana', emoji: '📅', format: (v) => `${v}`, better: 'max', minimum: 10, value: (f) => f.commits.week },
  { key: 'streak', label: 'Racha más larga de días con commits', emoji: '⚡', format: (v) => `${v} días`, better: 'max', minimum: 3, value: (f) => (f.commits.today > 0 ? commitStreak(f.commits.byDay, f.day) : null) },
  { key: 'ticketsDay', label: 'Más tickets tocados en un día', emoji: '🎫', format: (v) => `${v}`, better: 'max', minimum: 2, value: (f) => f.ticketsToday.length },
  // Llegar más temprano: solo desde las 04:00 (un commit de las 02:00 es otra cosa).
  { key: 'earliest', label: 'Primer commit más temprano', emoji: '🌅', format: (v) => `${pad(Math.floor(v / 60))}:${pad(v % 60)}`, better: 'min', minimum: 0, value: (f) => { const m = minutesOf(f.commits.firstToday); return m !== null && m >= 4 * 60 ? m : null; } },
];

export interface BrokenRecord {
  key: RecordKey;
  value: number;
  previous: number;
}

/**
 * Actualiza los récords con los hechos de hoy y devuelve los que se rompieron (la primera marca solo fija la base, no se festeja).
 * Un mismo récord se anuncia una vez por día, aunque se siga mejorando (si no, cada commit sería «¡nuevo récord!»).
 */
export const updateRecords = (state: GameState, facts: RewardFacts): { records: GameState['records']; broken: BrokenRecord[]; announced: string[] } => {
  const records = { ...state.records };
  const announced = [...state.today.recordsAnnounced];
  const broken: BrokenRecord[] = [];
  for (const def of RECORDS) {
    const value = def.value(facts);
    if (value === null || value <= 0) continue;
    const current = records[def.key];
    const beats = !current || (def.better === 'max' ? value > current.value : value < current.value);
    if (!beats) continue;
    records[def.key] = { value, day: facts.day };
    const meaningful = def.better === 'max' ? value >= def.minimum : true;
    if (current && meaningful && !announced.includes(def.key)) {
      announced.push(def.key);
      broken.push({ key: def.key, value, previous: current.value });
    }
  }
  return { records, broken, announced };
};

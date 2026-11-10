/** Los hechos del día que entrega `GET /api/rewards/facts` (ver `server/src/services/rewardFacts.ts`). */
export interface RewardFacts {
  generatedAt: string;
  day: string;
  weekday: number;
  commits: { today: number; firstToday: string | null; lastToday: string | null; week: number; byDay: Record<string, number> };
  ticketsToday: string[];
  repos: { dirty: number; unpushed: number; onProtectedWithChanges: boolean };
  agents: { today: number; running: number; finishedToday: number; maxParallelToday: number; tokensToday: number; tokensWeek: number; modelsToday: string[] };
  checklist: { total: number; done: number; items: Record<string, boolean> };
  services: { running: number; total: number } | null;
  workday: { entry: string; exit: string };
}

export type RecordKey = 'commitsDay' | 'parallel' | 'tokensDay' | 'agentsDay' | 'commitsWeek' | 'streak' | 'ticketsDay' | 'earliest';

export interface RecordEntry {
  value: number;
  day: string;
}

/** Lo que el juego recuerda de la persona. Todo local (`localStorage`), nada sale de la máquina. */
export interface GameState {
  version: 1;
  /** Logros ganados: la primera vez, la última y cuántas veces (los diarios se pueden ganar todos los días). */
  unlocked: Record<string, { first: string; last: string; count: number }>;
  today: { day: string; earned: string[]; recordsAnnounced: string[]; praised: number; lastPraiseAt: number; finishedSeen: number };
  counters: { agents: number; commits: number; activeDays: number; checklistDays: number; celebrations: number; recordsBroken: number; lastDay: string; lastAgentsToday: number; lastCommitsToday: number; activeToday: boolean; checklistToday: boolean };
  records: Partial<Record<RecordKey, RecordEntry>>;
  /** Cosas que anota la interfaz (nombró a la mascota, probó varias…). */
  flags: Record<string, number | boolean>;
}

export const EMPTY_GAME: GameState = {
  version: 1,
  unlocked: {},
  today: { day: '', earned: [], recordsAnnounced: [], praised: 0, lastPraiseAt: 0, finishedSeen: 0 },
  counters: { agents: 0, commits: 0, activeDays: 0, checklistDays: 0, celebrations: 0, recordsBroken: 0, lastDay: '', lastAgentsToday: 0, lastCommitsToday: 0, activeToday: false, checklistToday: false },
  records: {},
  flags: {},
};

export type CelebrationLevel = 'small' | 'medium' | 'big';

/** Lo que pasó al evaluar los hechos: lo que el panel festeja o anuncia. */
export type RewardEvent =
  | { type: 'achievement'; id: string; first: boolean }
  | { type: 'record'; key: RecordKey; value: number; previous: number }
  | { type: 'celebrate'; reason: string; level: CelebrationLevel }
  | { type: 'praise'; text: string };

export interface Prefs {
  /** Todo lo divertido junto. */
  enabled: boolean;
  celebrations: boolean;
  achievements: boolean;
  praise: boolean;
  /** Sonidos (apagados por defecto). */
  sound: boolean;
  closeDay: boolean;
  mascot: boolean;
  mascotId: string;
  mascotName: string;
}

export const DEFAULT_GAME_PREFS: Prefs = { enabled: true, celebrations: true, achievements: true, praise: true, sound: false, closeDay: true, mascot: true, mascotId: 'gato', mascotName: '' };

/** Completa lo guardado con los valores por defecto (por si se sumó una opción). */
export const gamePrefs = (stored: Partial<Prefs> | null | undefined): Prefs => ({ ...DEFAULT_GAME_PREFS, ...(stored ?? {}) });

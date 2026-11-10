/**
 * Avisos espontáneos (tarjeta discreta de abajo a la derecha). El servidor calcula los CANDIDATOS (`GET /api/nudges`); acá se decide
 * CUÁNDO mostrar uno: poco y solo cuando sirve. Reglas: nunca con «No molestar», en pantalla completa ni mientras se escribe; como
 * mucho uno cada `minGapMin` minutos y `maxPerDay` por día; cada condición se avisa una vez por día (salvo «Posponer»); y las frases
 * graciosas solo cuando no hay nada útil pendiente, con tope propio.
 */
export type NudgeKind = 'git-dirty' | 'git-unpushed' | 'git-wrong-branch' | 'service-down' | 'test-data' | 'workday' | 'daily-unsaved' | 'holiday';

export interface Nudge {
  id: string;
  kind: NudgeKind;
  title: string;
  detail: string;
  priority: number;
  link: string | null;
}

export const KIND_LABELS: Record<NudgeKind, string> = {
  'git-wrong-branch': 'Cambios en una rama protegida',
  'git-dirty': 'Cambios sin commitear hace rato',
  'git-unpushed': 'Commits sin pushear al final del día',
  'service-down': 'Servicios caídos',
  'test-data': 'Datos de prueba sin limpiar',
  workday: 'Jornada: marcar, horas y notas',
  'daily-unsaved': 'Daily sin guardar',
  holiday: 'Feriados que se vienen',
};

export interface NudgePrefs {
  enabled: boolean;
  /** Frases graciosas de vez en cuando. */
  funny: boolean;
  /** Tipos que se silenciaron. */
  muted: NudgeKind[];
  /** Minutos mínimos entre un aviso y el siguiente. */
  minGapMin: number;
  maxPerDay: number;
}

export const DEFAULT_PREFS: NudgePrefs = { enabled: true, funny: true, muted: [], minGapMin: 45, maxPerDay: 8 };
export const MAX_FUNNY_PER_DAY = 3;
/** Probabilidad, por cada minuto en que podría salir, de que salga una frase graciosa. */
export const FUNNY_CHANCE = 0.03;
/** Cuánto queda a la vista un aviso antes de cerrarse solo. */
export const AUTO_CLOSE_MS = 15_000;
export const SNOOZE_MS = 3_600_000;

export interface NudgeState {
  day: string;
  /** Avisos mostrados hoy (de todo tipo) y cuántos fueron frases graciosas. */
  count: number;
  funny: number;
  /** Cuándo se mostró el último (se conserva entre días: la separación mínima vale siempre). */
  lastAt: number;
  /** Condiciones ya avisadas hoy. */
  seen: Record<string, true>;
  /** Condiciones pospuestas: no vuelven antes de esta hora. */
  snoozed: Record<string, number>;
  /** Frases graciosas ya vistas hoy. */
  funnySeen: string[];
}

export const dayKey = (now: number): string => {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const EMPTY_STATE: NudgeState = { day: '', count: 0, funny: 0, lastAt: 0, seen: {}, snoozed: {}, funnySeen: [] };

/** El estado de hoy: si cambió el día, los contadores y lo ya avisado arrancan de cero. */
export const stateForToday = (state: NudgeState, now: number): NudgeState => (state.day === dayKey(now) ? state : { ...EMPTY_STATE, day: dayKey(now), lastAt: state.lastAt, snoozed: state.snoozed });

export interface PickInput {
  now: number;
  prefs: NudgePrefs;
  state: NudgeState;
  nudges: Nudge[];
  /** Frases graciosas disponibles ahora (ya rellenadas). */
  funnyPhrases: string[];
  /** No molestar activo, pantalla completa o escribiendo: ahora no se muestra nada. */
  blocked: boolean;
  rng: () => number;
}

export type Pick = { type: 'useful'; nudge: Nudge } | { type: 'funny'; text: string };

/** Qué mostrar ahora, si corresponde algo. Función pura: no guarda nada (eso lo hace `afterShown`). */
export const pickNext = (input: PickInput): Pick | null => {
  const { now, prefs, nudges, funnyPhrases, rng } = input;
  const state = stateForToday(input.state, now);
  if (!prefs.enabled || input.blocked) return null;
  if (state.count >= prefs.maxPerDay) return null;
  if (now - state.lastAt < prefs.minGapMin * 60_000) return null;
  const eligible = nudges
    .filter((nudge) => !prefs.muted.includes(nudge.kind))
    .filter((nudge) => {
      const until = state.snoozed[nudge.id];
      if (until !== undefined) return until <= now;
      return !state.seen[nudge.id];
    })
    .sort((a, b) => b.priority - a.priority);
  if (eligible[0]) return { type: 'useful', nudge: eligible[0] };
  if (!prefs.funny || state.funny >= MAX_FUNNY_PER_DAY || rng() >= FUNNY_CHANCE) return null;
  const fresh = funnyPhrases.filter((phrase) => !state.funnySeen.includes(phrase));
  const text = fresh[Math.min(fresh.length - 1, Math.floor(rng() * fresh.length))];
  return text ? { type: 'funny', text } : null;
};

/** El estado después de mostrar algo. */
export const afterShown = (input: NudgeState, pick: Pick, now: number): NudgeState => {
  const state = stateForToday(input, now);
  if (pick.type === 'funny') return { ...state, count: state.count + 1, funny: state.funny + 1, lastAt: now, funnySeen: [...state.funnySeen, pick.text] };
  // Al mostrarse de nuevo, la condición ya no queda pospuesta.
  const snoozed = Object.fromEntries(Object.entries(state.snoozed).filter(([id]) => id !== pick.nudge.id));
  return { ...state, count: state.count + 1, lastAt: now, seen: { ...state.seen, [pick.nudge.id]: true }, snoozed };
};

export const snoozeNudge = (input: NudgeState, id: string, now: number): NudgeState => {
  const state = stateForToday(input, now);
  return { ...state, snoozed: { ...state.snoozed, [id]: now + SNOOZE_MS } };
};

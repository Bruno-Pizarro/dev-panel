import { ACHIEVEMENTS } from './achievements';
import { pickPraise } from './praise';
import { updateRecords } from './records';
import { EMPTY_GAME, type CelebrationLevel, type GameState, type Prefs, type RewardEvent, type RewardFacts } from './types';

/** Mínimo entre dos elogios sorpresa, tope por día y probabilidad con la que sale uno cuando pasa algo bueno. */
export const PRAISE_GAP_MS = 20 * 60_000;
export const PRAISE_MAX_PER_DAY = 6;
export const PRAISE_CHANCE = 0.4;

/** El estado de hoy: al cambiar el día, lo del día (logros diarios, récords anunciados, elogios) arranca de cero. */
const forToday = (state: GameState, day: string): GameState => (state.today.day === day ? state : { ...state, today: { day, earned: [], recordsAnnounced: [], praised: 0, lastPraiseAt: state.today.lastPraiseAt, finishedSeen: 0 } });

/** Suma a los contadores de toda la vida lo que pasó desde la última mirada (solo lo nuevo: no se cuenta dos veces). */
export const updateCounters = (state: GameState, facts: RewardFacts): GameState['counters'] => {
  const c = state.counters;
  const sameDay = c.lastDay === facts.day;
  const agentsDelta = Math.max(0, facts.agents.today - (sameDay ? c.lastAgentsToday : 0));
  const commitsDelta = Math.max(0, facts.commits.today - (sameDay ? c.lastCommitsToday : 0));
  const active = facts.commits.today > 0 || facts.agents.today > 0;
  const complete = facts.checklist.total > 0 && facts.checklist.done === facts.checklist.total;
  const activeToday = sameDay ? c.activeToday : false;
  const checklistToday = sameDay ? c.checklistToday : false;
  return {
    ...c,
    agents: c.agents + agentsDelta,
    commits: c.commits + commitsDelta,
    activeDays: c.activeDays + (active && !activeToday ? 1 : 0),
    checklistDays: c.checklistDays + (complete && !checklistToday ? 1 : 0),
    lastDay: facts.day,
    lastAgentsToday: facts.agents.today,
    lastCommitsToday: facts.commits.today,
    activeToday: activeToday || active,
    checklistToday: checklistToday || complete,
  };
};

const LEVEL_OF: Record<'daily' | 'lifetime', CelebrationLevel> = { daily: 'small', lifetime: 'medium' };

export interface StepInput {
  state: GameState;
  facts: RewardFacts;
  now: Date;
  prefs: Pick<Prefs, 'enabled' | 'achievements' | 'celebrations' | 'praise'>;
  rng: () => number;
}

/**
 * Mira los hechos y decide qué festejar: logros nuevos (los diarios, una vez por día; los de toda la vida, una sola vez), récords rotos y,
 * a veces, un elogio sorpresa. Función pura: devuelve el estado nuevo y los eventos; mostrarlos es cosa de la interfaz. Apagado, solo se
 * cuenta lo que pasó (para no perder la cuenta), pero no se anuncia nada.
 */
export const step = ({ state: input, facts, now, prefs, rng }: StepInput): { state: GameState; events: RewardEvent[] } => {
  let state = forToday(input, facts.day);
  state = { ...state, counters: updateCounters(state, facts) };
  const events: RewardEvent[] = [];
  const stamp = now.toISOString();

  // Primero los récords: «Rompe-marcas» y compañía miran cuántos se rompieron.
  const records = updateRecords(state, facts);
  state = { ...state, records: records.records, counters: { ...state.counters, recordsBroken: state.counters.recordsBroken + records.broken.length } };
  if (prefs.enabled) {
    for (const broken of records.broken) {
      events.push({ type: 'record', key: broken.key, value: broken.value, previous: broken.previous });
      if (prefs.celebrations) events.push({ type: 'celebrate', reason: `record:${broken.key}`, level: 'big' });
    }
  }

  const unlocked = { ...state.unlocked };
  const earned = [...state.today.earned];
  for (const achievement of ACHIEVEMENTS) {
    const already = achievement.kind === 'daily' ? earned.includes(achievement.id) : unlocked[achievement.id] !== undefined;
    if (already) continue;
    if (!achievement.test({ facts, state: { ...state, unlocked }, now })) continue;
    const previous = unlocked[achievement.id];
    unlocked[achievement.id] = { first: previous?.first ?? stamp, last: stamp, count: (previous?.count ?? 0) + 1 };
    if (achievement.kind === 'daily') earned.push(achievement.id);
    if (prefs.enabled && prefs.achievements) {
      events.push({ type: 'achievement', id: achievement.id, first: previous === undefined });
      if (prefs.celebrations) events.push({ type: 'celebrate', reason: `achievement:${achievement.id}`, level: previous === undefined && achievement.kind === 'lifetime' ? 'big' : LEVEL_OF[achievement.kind] });
    }
  }

  let today = { ...state.today, earned, recordsAnnounced: records.announced };
  // Un agente terminó desde la última mirada: un festejo chiquito (solo brillo).
  if (facts.agents.finishedToday > today.finishedSeen) {
    if (prefs.enabled && prefs.celebrations && today.finishedSeen > 0) events.push({ type: 'celebrate', reason: 'agent-done', level: 'small' });
    today = { ...today, finishedSeen: facts.agents.finishedToday };
  }

  // Elogio sorpresa: cuando pasó algo bueno, a veces, con un máximo por día y una separación mínima.
  const goodNews = events.some((event) => event.type === 'achievement' || event.type === 'record' || (event.type === 'celebrate' && event.reason === 'agent-done'));
  if (goodNews && prefs.enabled && prefs.praise && today.praised < PRAISE_MAX_PER_DAY && now.getTime() - today.lastPraiseAt >= PRAISE_GAP_MS && rng() < PRAISE_CHANCE) {
    events.push({ type: 'praise', text: pickPraise(rng) });
    today = { ...today, praised: today.praised + 1, lastPraiseAt: now.getTime() };
  }

  const counters = { ...state.counters, celebrations: state.counters.celebrations + events.filter((event) => event.type === 'celebrate').length };
  return { state: { ...state, unlocked, records: records.records, today, counters }, events };
};

/** ¿Corresponde un elogio sorpresa ahora? Con las mismas reglas de siempre (separación mínima, tope por día y un poco de azar). */
export const rollPraise = (state: GameState, now: Date, rng: () => number, last?: string): { state: GameState; text: string | null } => {
  const today = state.today.day === dayOf(now) ? state.today : { ...state.today, day: dayOf(now), praised: 0 };
  if (today.praised >= PRAISE_MAX_PER_DAY || now.getTime() - today.lastPraiseAt < PRAISE_GAP_MS || rng() >= PRAISE_CHANCE) return { state, text: null };
  return { state: { ...state, today: { ...today, praised: today.praised + 1, lastPraiseAt: now.getTime() } }, text: pickPraise(rng, last) };
};

const dayOf = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Un festejo pedido directo por la interfaz (completaste algo): suma al contador y no depende de los hechos. */
export const celebrated = (state: GameState): GameState => ({ ...state, counters: { ...state.counters, celebrations: state.counters.celebrations + 1 } });

export { EMPTY_GAME };

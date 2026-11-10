import { CLOSE_LINES } from './praise';
import type { GameState, Prefs, RewardFacts } from './types';

/** La interfaz pide abrir «Tu día en 10 segundos» (a mano o cuando termina la jornada). */
export const DAY_WRAP_EVENT = 'dev-panel:day-wrap';

const minutes = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** El flag con el que se recuerda que el cierre de un día ya se mostró. */
export const wrapFlag = (day: string): string => `wrap:${day}`;

/**
 * ¿Toca mostrar el cierre del día solo? Una vez por día, pasada la hora de salida (hasta 3 horas después), en día de semana y solo si hubo algo
 * que contar. Con «No molestar» no se muestra (queda para pedirlo a mano).
 */
export const shouldWrap = (facts: RewardFacts, game: GameState, prefs: Pick<Prefs, 'enabled' | 'closeDay'>, now: Date, quiet: boolean): boolean => {
  if (!prefs.enabled || !prefs.closeDay || quiet) return false;
  const exit = minutes(facts.workday.exit);
  if (exit === null || facts.weekday === 0 || facts.weekday === 6) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (current < exit || current > exit + 180) return false;
  if (game.flags[wrapFlag(facts.day)]) return false;
  return facts.commits.today > 0 || facts.agents.today > 0;
};

export type DayLevel = 'big' | 'good' | 'quiet';

/** Qué tan movido fue el día, para elegir la frase de cierre. */
export const dayLevel = (facts: RewardFacts, earnedToday: number): DayLevel => {
  const score = facts.commits.today + facts.agents.today * 0.5 + earnedToday * 1.5 + (facts.checklist.total > 0 && facts.checklist.done === facts.checklist.total ? 3 : 0);
  return score >= 10 ? 'big' : score >= 3 ? 'good' : 'quiet';
};

export const closingLine = (level: DayLevel, rng: () => number = Math.random): string => {
  const lines = CLOSE_LINES[level];
  return lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))]!;
};

const tokens = (value: number): string => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} M` : value >= 1000 ? `${Math.round(value / 1000)} k` : String(value));

/** El resumen del día como texto, para pegar en el daily o en una nota. */
export const wrapText = (facts: RewardFacts, earnedNames: string[], line: string): string => {
  const rows = [
    `Mi día (${facts.day})`,
    `- Commits: ${facts.commits.today}${facts.commits.firstToday ? ` (de ${facts.commits.firstToday} a ${facts.commits.lastToday})` : ''}`,
    facts.ticketsToday.length ? `- Tickets: ${facts.ticketsToday.map((ticket) => `#${ticket}`).join(', ')}` : null,
    `- Agentes de Claude: ${facts.agents.today}${facts.agents.maxParallelToday > 1 ? ` (hasta ${facts.agents.maxParallelToday} en paralelo)` : ''}`,
    `- Tokens: ${tokens(facts.agents.tokensToday)}`,
    facts.checklist.total ? `- Checklist: ${facts.checklist.done}/${facts.checklist.total}` : null,
    earnedNames.length ? `- Logros: ${earnedNames.join(', ')}` : null,
    line,
  ];
  return rows.filter((row): row is string => row !== null).join('\n');
};

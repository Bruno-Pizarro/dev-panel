import { describe, expect, it } from 'vitest';
import { closingLine, dayLevel, shouldWrap, wrapFlag, wrapText } from './dayWrap';
import { EMPTY_GAME, type RewardFacts } from './types';

const facts = (over: Partial<RewardFacts> = {}): RewardFacts => ({ generatedAt: '', day: '2026-11-10', weekday: 2, commits: { today: 4, firstToday: '09:10', lastToday: '17:40', week: 9, byDay: {} }, ticketsToday: ['33528', '33939'], repos: { dirty: 0, unpushed: 0, onProtectedWithChanges: false }, agents: { today: 6, running: 0, finishedToday: 6, maxParallelToday: 3, tokensToday: 1_200_000, tokensWeek: 3_000_000, modelsToday: [] }, checklist: { total: 4, done: 3, items: {} }, services: null, workday: { entry: '09:00', exit: '18:00' }, ...over });
const at = (h: number, m = 0) => new Date(2026, 10, 10, h, m);
const prefs = { enabled: true, closeDay: true };

describe('cuándo se muestra el cierre del día', () => {
  it('pasada la hora de salida, una vez por día, en día de semana y con algo que contar', () => {
    expect(shouldWrap(facts(), EMPTY_GAME, prefs, at(18, 5), false)).toBe(true);
    expect(shouldWrap(facts(), EMPTY_GAME, prefs, at(17, 30), false)).toBe(false);
    expect(shouldWrap(facts(), EMPTY_GAME, prefs, at(21, 30), false)).toBe(false);
    expect(shouldWrap(facts(), { ...EMPTY_GAME, flags: { [wrapFlag('2026-11-10')]: true } }, prefs, at(18, 5), false)).toBe(false);
    expect(shouldWrap(facts({ weekday: 6 }), EMPTY_GAME, prefs, at(18, 5), false)).toBe(false);
    expect(shouldWrap(facts({ commits: { today: 0, firstToday: null, lastToday: null, week: 0, byDay: {} }, agents: { ...facts().agents, today: 0 } }), EMPTY_GAME, prefs, at(18, 5), false)).toBe(false);
  });
  it('apagado, con No molestar o sin horario de salida no se muestra solo', () => {
    expect(shouldWrap(facts(), EMPTY_GAME, { ...prefs, closeDay: false }, at(18, 5), false)).toBe(false);
    expect(shouldWrap(facts(), EMPTY_GAME, prefs, at(18, 5), true)).toBe(false);
    expect(shouldWrap(facts({ workday: { entry: '', exit: '' } }), EMPTY_GAME, prefs, at(18, 5), false)).toBe(false);
  });
});

describe('cómo fue el día', () => {
  it('movido, bueno o tranquilo, y la frase sale de su grupo', () => {
    expect(dayLevel(facts({ commits: { ...facts().commits, today: 8 } }), 4)).toBe('big');
    expect(dayLevel(facts({ commits: { ...facts().commits, today: 2 }, agents: { ...facts().agents, today: 0 }, checklist: { total: 4, done: 0, items: {} } }), 0)).toBe('quiet');
    expect(dayLevel(facts(), 1)).toBe('good');
    expect(closingLine('big', () => 0)).toBe('Hoy la rompiste.');
  });
});

describe('texto del resumen', () => {
  it('lista commits, tickets, agentes, tokens, checklist y logros', () => {
    const text = wrapText(facts(), ['Madrugador', 'Trío dinámico'], 'Buen día de laburo.');
    expect(text).toContain('Mi día (2026-11-10)');
    expect(text).toContain('Commits: 4 (de 09:10 a 17:40)');
    expect(text).toContain('Tickets: #33528, #33939');
    expect(text).toContain('Agentes de Claude: 6 (hasta 3 en paralelo)');
    expect(text).toContain('Tokens: 1.2 M');
    expect(text).toContain('Checklist: 3/4');
    expect(text).toContain('Logros: Madrugador, Trío dinámico');
    expect(text.endsWith('Buen día de laburo.')).toBe(true);
  });
});

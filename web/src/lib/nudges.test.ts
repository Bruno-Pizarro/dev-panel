import { describe, expect, it } from 'vitest';
import { afterShown, AUTO_CLOSE_MS, DEFAULT_PREFS, dayKey, EMPTY_STATE, FUNNY_CHANCE, MAX_FUNNY_PER_DAY, pickNext, snoozeNudge, stateForToday, type Nudge, type PickInput } from './nudges';

const NOW = new Date(2026, 10, 6, 15, 0).getTime();
const MIN = 60_000;
const nudge = (over: Partial<Nudge> = {}): Nudge => ({ id: 'dirty:front:3', kind: 'git-dirty', title: 'Cambios sin commitear', detail: 'x', priority: 50, link: null, ...over });
const input = (over: Partial<PickInput> = {}): PickInput => ({ now: NOW, prefs: DEFAULT_PREFS, state: EMPTY_STATE, nudges: [nudge()], funnyPhrases: ['Frase uno', 'Frase dos'], blocked: false, rng: () => 0.99, ...over });

describe('cuándo se muestra un aviso', () => {
  it('muestra el candidato más importante', () => {
    const pick = pickNext(input({ nudges: [nudge({ id: 'a', priority: 30 }), nudge({ id: 'b', priority: 90 }), nudge({ id: 'c', priority: 60 })] }));
    expect(pick).toMatchObject({ type: 'useful', nudge: { id: 'b' } });
  });

  it('nada si está apagado, con No molestar / pantalla completa / escribiendo, o sin candidatos y sin frases', () => {
    expect(pickNext(input({ prefs: { ...DEFAULT_PREFS, enabled: false } }))).toBeNull();
    expect(pickNext(input({ blocked: true }))).toBeNull();
    expect(pickNext(input({ nudges: [], rng: () => 0.99 }))).toBeNull();
  });

  it('respeta la separación mínima: no antes de 45 minutos del último', () => {
    const recent = { ...EMPTY_STATE, day: dayKey(NOW), lastAt: NOW - 30 * MIN };
    expect(pickNext(input({ state: recent }))).toBeNull();
    expect(pickNext(input({ state: { ...recent, lastAt: NOW - 46 * MIN } }))).not.toBeNull();
  });

  it('respeta el tope por día (8) y que el día nuevo arranca de cero', () => {
    const full = { ...EMPTY_STATE, day: dayKey(NOW), count: 8, lastAt: NOW - 120 * MIN };
    expect(pickNext(input({ state: full }))).toBeNull();
    const yesterday = { ...full, day: dayKey(NOW - 86_400_000) };
    expect(pickNext(input({ state: yesterday }))).not.toBeNull();
    expect(stateForToday(yesterday, NOW)).toMatchObject({ day: dayKey(NOW), count: 0, seen: {} });
  });

  it('cada condición se avisa una vez por día, y vuelve a avisarse si cambia (otro id)', () => {
    const once = afterShown(EMPTY_STATE, { type: 'useful', nudge: nudge() }, NOW - 120 * MIN);
    expect(pickNext(input({ state: once }))).toBeNull();
    expect(pickNext(input({ state: once, nudges: [nudge({ id: 'dirty:front:4' })] }))).not.toBeNull();
  });

  it('un tipo silenciado no se muestra', () => {
    expect(pickNext(input({ prefs: { ...DEFAULT_PREFS, muted: ['git-dirty'] } }))).toBeNull();
  });

  it('«posponer»: no vuelve antes de una hora y después sí, aunque ya se hubiera visto', () => {
    const shown = afterShown(EMPTY_STATE, { type: 'useful', nudge: nudge() }, NOW - 200 * MIN);
    const snoozed = snoozeNudge(shown, 'dirty:front:3', NOW);
    expect(pickNext(input({ state: { ...snoozed, lastAt: NOW - 100 * MIN } }))).toBeNull();
    expect(pickNext(input({ now: NOW + 61 * MIN, state: { ...snoozed, lastAt: NOW - 100 * MIN } }))).toMatchObject({ type: 'useful' });
    // al mostrarse de nuevo ya no queda pospuesto
    expect(afterShown(snoozed, { type: 'useful', nudge: nudge() }, NOW + 61 * MIN).snoozed).toEqual({});
  });
});

describe('frases graciosas', () => {
  it('solo cuando no hay nada útil, por azar, y sin repetir la misma en el día', () => {
    const first = pickNext(input({ nudges: [], rng: () => 0 }));
    expect(first).toMatchObject({ type: 'funny', text: 'Frase uno' });
    const state = afterShown(EMPTY_STATE, first!, NOW - 120 * MIN);
    expect(pickNext(input({ nudges: [], state, rng: () => 0 }))).toMatchObject({ text: 'Frase dos' });
    // con algo útil pendiente no sale una frase
    expect(pickNext(input({ rng: () => 0 }))).toMatchObject({ type: 'useful' });
  });

  it('con poca suerte no sale, con el interruptor apagado tampoco, y tiene su propio tope (3 por día)', () => {
    expect(pickNext(input({ nudges: [], rng: () => FUNNY_CHANCE }))).toBeNull();
    expect(pickNext(input({ nudges: [], prefs: { ...DEFAULT_PREFS, funny: false } }))).toBeNull();
    const capped = { ...EMPTY_STATE, day: dayKey(NOW), funny: MAX_FUNNY_PER_DAY, lastAt: NOW - 120 * MIN };
    expect(pickNext(input({ nudges: [], state: capped }))).toBeNull();
  });

  it('cuenta para el tope del día y deja la hora del último', () => {
    const state = afterShown(EMPTY_STATE, { type: 'funny', text: 'x' }, NOW);
    expect(state).toMatchObject({ count: 1, funny: 1, lastAt: NOW, funnySeen: ['x'] });
  });

  it('se cierra solo a los 15 segundos', () => {
    expect(AUTO_CLOSE_MS).toBe(15_000);
  });
});

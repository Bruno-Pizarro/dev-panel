import { describe, expect, it } from 'vitest';
import { bandOf, pickTalk, talkPools } from './mascotTalk';

const at = (iso: string): Date => new Date(iso);
const base = { mood: 'idle' as const, now: at('2026-11-13T15:30:00'), weather: null };

describe('franjas de temperatura', () => {
  it('cubren todo el rango', () => {
    expect([-5, 3, 4, 10, 11, 16, 17, 23, 24, 29, 30, 34, 35, 42].map(bandOf)).toEqual(['freezing', 'freezing', 'cold', 'cold', 'cool', 'cool', 'mild', 'mild', 'warm', 'warm', 'hot', 'hot', 'scorching', 'scorching']);
  });
});

describe('frases del momento', () => {
  it('sin clima no hay frases de temperatura ni de cielo', () => {
    const { moment } = talkPools(base);
    expect(moment.every((line) => !/°/.test(line))).toBe(true);
  });
  it('con clima suma frases con los grados reales', () => {
    const { moment } = talkPools({ ...base, weather: { temperature: 31.6, code: 0, isDay: true } });
    expect(moment.some((line) => line.includes('32°'))).toBe(true);
    expect(moment.every((line) => !line.includes('{'))).toBe(true);
  });
  it('la lluvia suma frases de lluvia', () => {
    const { moment } = talkPools({ ...base, weather: { temperature: 14, code: 63, isDay: true } });
    expect(moment.some((line) => /llov|Llov|lluvia/.test(line))).toBe(true);
  });
  it('trae la hora y el día de la semana', () => {
    const { moment } = talkPools({ ...base, now: at('2026-11-13T12:05:00') });
    expect(moment.some((line) => line.includes('12:05') || /almorz|comer/.test(line))).toBe(true);
    expect(moment.some((line) => /viernes|Viernes/.test(line))).toBe(true);
  });
  it('tiene frases para todas las horas, todos los días y los límites del mes', () => {
    for (let hour = 0; hour < 24; hour += 1) expect(talkPools({ ...base, now: new Date(2026, 10, 10, hour) }).moment.length).toBeGreaterThan(0);
    for (let day = 0; day < 7; day += 1) expect(talkPools({ ...base, now: new Date(2026, 10, 8 + day, 9) }).moment.length).toBeGreaterThan(0);
    expect(talkPools({ ...base, now: new Date(2026, 10, 30, 9) }).moment.some((line) => /mes/.test(line))).toBe(true);
    expect(talkPools({ ...base, now: new Date(2026, 10, 1, 9) }).moment.some((line) => /mes/.test(line))).toBe(true);
  });
});

describe('pickTalk', () => {
  it('con rng bajo elige del momento; con rng alto, de su ánimo', () => {
    const pools = talkPools(base);
    expect(pools.moment).toContain(pickTalk(base, () => 0.1));
    expect(pools.mood).toContain(pickTalk(base, () => 0.99));
  });
  it('no repite la frase anterior', () => {
    const pools = talkPools(base);
    const last = pools.mood[0]!;
    for (let i = 0; i < 30; i += 1) expect(pickTalk({ ...base }, Math.random, last)).not.toBe(last);
  });
  it('nunca devuelve vacío ni con marcas sin reemplazar', () => {
    for (let i = 0; i < 80; i += 1) {
      const line = pickTalk({ mood: 'sleep', now: new Date(2026, 10, 14, i % 24), weather: { temperature: i - 10, code: i % 99, isDay: i % 2 === 0 } });
      expect(line.length).toBeGreaterThan(3);
      expect(line).not.toMatch(/[{}]/);
    }
  });
});

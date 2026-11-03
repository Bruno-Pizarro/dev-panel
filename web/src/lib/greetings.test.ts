import { describe, expect, it } from 'vitest';
import { DAY_PHRASES, PHRASES, pickGreeting, poolFor, slotOf, type Slot } from './greetings';

const at = (hour: number, day = 3) => {
  const date = new Date(2026, 10, 4, hour, 0, 0); // miércoles
  return day === 3 ? date : new Date(date.getTime() + (day - 3) * 86_400_000);
};

describe('frases del Inicio', () => {
  it('slotOf divide el día: madrugada, mañana, mediodía, tarde y noche', () => {
    expect([0, 5, 6, 11, 12, 13, 14, 19, 20, 23].map(slotOf)).toEqual(['madrugada', 'madrugada', 'manana', 'manana', 'mediodia', 'mediodia', 'tarde', 'tarde', 'noche', 'noche']);
  });

  it('cada franja tiene varias frases, con y sin nombre', () => {
    for (const slot of Object.keys(PHRASES) as Slot[]) {
      expect(PHRASES[slot].length).toBeGreaterThanOrEqual(5);
      expect(PHRASES[slot].some((phrase) => phrase.named)).toBe(true);
      expect(PHRASES[slot].some((phrase) => !phrase.named)).toBe(true);
      expect(PHRASES[slot].filter((phrase) => phrase.named).every((phrase) => phrase.text.includes('{name}'))).toBe(true);
    }
  });

  it('con nombre usa también las frases con nombre, y lo reemplaza', () => {
    const pool = poolFor(at(9), 'Bruno');
    expect(pool.some((text) => text.includes('Bruno'))).toBe(true);
    expect(pool.every((text) => !text.includes('{name}'))).toBe(true);
  });

  it('sin nombre (vacío o solo espacios) nunca usa frases con nombre', () => {
    for (const name of ['', '   ']) {
      for (let hour = 0; hour < 24; hour += 1) {
        for (let day = 0; day < 7; day += 1) {
          const pool = poolFor(at(hour, day), name);
          expect(pool.length).toBeGreaterThan(0);
          expect(pool.every((text) => !text.includes('{name}') && !/\s,|,\s*\./.test(text))).toBe(true);
        }
      }
    }
  });

  it('suma las frases del día de la semana (lunes y viernes) al pool de la hora', () => {
    expect(poolFor(at(9, 1), 'Ana')).toEqual(expect.arrayContaining(DAY_PHRASES[1]!.map((phrase) => phrase.text.replace('{name}', 'Ana'))));
    expect(poolFor(at(9, 2), 'Ana').length).toBeLessThan(poolFor(at(9, 1), 'Ana').length);
  });

  it('pickGreeting elige según el azar y evita repetir la última frase', () => {
    const pool = poolFor(at(15), 'Ana');
    expect(pickGreeting(at(15), 'Ana', () => 0)).toBe(pool[0]);
    expect(pickGreeting(at(15), 'Ana', () => 0.999)).toBe(pool[pool.length - 1]);
    expect(pickGreeting(at(15), 'Ana', () => 0, pool[0])).not.toBe(pool[0]);
  });
});

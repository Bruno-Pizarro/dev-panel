import { describe, expect, it } from 'vitest';
import { ATTENTION_PHRASES, contextFromNotices, DAY_PHRASES, HOLIDAY_PHRASES, PHRASES, pickGreeting, poolFor, slotOf, type Slot } from './greetings';

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

  it('un feriado reemplaza a las frases normales, con el nombre del feriado y sin llaves sueltas', () => {
    const pool = poolFor(at(10), 'Ana', { holiday: 'Día de la Tradición' });
    expect(pool.length).toBe(HOLIDAY_PHRASES.length);
    expect(pool.some((text) => text.includes('Día de la Tradición'))).toBe(true);
    expect(pool.some((text) => text.includes('Ana'))).toBe(true);
    expect(pool.every((text) => !/[{}]/.test(text))).toBe(true);
    expect(poolFor(at(10), '', { holiday: 'X' }).length).toBe(HOLIDAY_PHRASES.filter((phrase) => !phrase.named).length);
    expect(PHRASES.manana.map((phrase) => phrase.text)).not.toContain(pool[0]);
  });

  it('si hay algo importante, suma frases que lo mencionan (con singular y plural) a las simpáticas', () => {
    const base = poolFor(at(10), 'Ana');
    const one = poolFor(at(10), 'Ana', { important: 1 });
    const many = poolFor(at(10), 'Ana', { important: 3 });
    expect(one.length).toBeGreaterThan(base.length);
    expect(base.every((text) => base.includes(text))).toBe(true);
    expect(one.some((text) => text.includes('1 aviso importante'))).toBe(true);
    expect(many.some((text) => text.includes('3 avisos importantes'))).toBe(true);
    expect(one.concat(many).every((text) => !/[{}]/.test(text))).toBe(true);
  });

  it('cada situación suma las suyas, y sin nombre no usa las que lo llevan', () => {
    for (const key of ['dueSoon', 'reviews', 'sprintLastDay', 'mrProblems'] as const) {
      const context = key === 'sprintLastDay' ? { sprintLastDay: true } : { [key]: 2 };
      expect(poolFor(at(10), 'Ana', context).length).toBeGreaterThan(poolFor(at(10), 'Ana').length);
      expect(poolFor(at(10), '', context).every((text) => !/[{}]/.test(text))).toBe(true);
      expect(ATTENTION_PHRASES[key].length).toBeGreaterThanOrEqual(2);
    }
    expect(poolFor(at(10), 'Ana', { important: 0, dueSoon: 0 })).toEqual(poolFor(at(10), 'Ana'));
  });

  it('contextFromNotices lee los avisos del día', () => {
    const notices = [
      { id: 'holiday-2026-11-04', kind: 'holiday', level: 'info', title: 'Hoy es feriado: Día de prueba' },
      { id: 'due-1', kind: 'due', level: 'important', title: '#1 vence hoy' },
      { id: 'due-2', kind: 'due', level: 'info', title: '#2 vence en 3 días' },
      { id: 'review-3', kind: 'review', level: 'important', title: 'Alguien comentó en #3' },
      { id: 'mr-conflict-front!1', kind: 'mr', level: 'important', title: 'front !1 tiene conflictos' },
      { id: 'mr-notes-front!2', kind: 'mr', level: 'important', title: 'front !2: 1 comentario nuevo' },
      { id: 'sprint-9', kind: 'sprint', level: 'important', title: 'Hoy es el último día del sprint' },
    ];
    expect(contextFromNotices(notices, '2026-11-04')).toEqual({ holiday: 'Día de prueba', important: 5, dueSoon: 1, reviews: 1, sprintLastDay: true, mrProblems: 1 });
    expect(contextFromNotices(notices, '2026-11-05').holiday).toBeNull();
    expect(contextFromNotices([], '2026-11-04')).toEqual({ holiday: null, important: 0, dueSoon: 0, reviews: 0, sprintLastDay: false, mrProblems: 0 });
  });
});

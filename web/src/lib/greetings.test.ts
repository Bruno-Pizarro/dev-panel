import { describe, expect, it } from 'vitest';
import { WORKDAY_PHRASES, workdayPhase, AI_PHRASES, ATTENTION_PHRASES, contextFromNotices, DAY_PHRASES, HOLIDAY_PHRASES, ODD_HOUR_PHRASES, PHRASES, pickGreeting, poolFor, slotOf, type Slot } from './greetings';

const at = (hour: number, day = 3) => {
  const date = new Date(2026, 10, 4, hour, 0, 0); // miércoles
  return day === 3 ? date : new Date(date.getTime() + (day - 3) * 86_400_000);
};

describe('frases del Inicio', () => {
  it('slotOf divide el día: madrugada, mañana, mediodía, tarde y noche', () => {
    expect([0, 5, 6, 7, 11, 12, 13, 14, 19, 20, 23].map(slotOf)).toEqual(['madrugada', 'madrugada', 'madrugada', 'manana', 'manana', 'mediodia', 'mediodia', 'tarde', 'tarde', 'noche', 'noche']);
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

  it('los rangos de horarios raros no se pisan, cubren de 22 a 7 y solo suman en su hora', () => {
    const sorted = [...ODD_HOUR_PHRASES].sort((a, b) => a.from - b.from);
    expect(sorted.map((range) => [range.from, range.to])).toEqual([[0, 2], [2, 4], [4, 6], [6, 7], [22, 24]]);
    for (const range of ODD_HOUR_PHRASES) {
      expect(range.phrases.length).toBeGreaterThanOrEqual(3);
      expect(range.phrases.filter((phrase) => phrase.named).every((phrase) => phrase.text.includes('{name}'))).toBe(true);
      const mine = range.phrases.filter((phrase) => !phrase.named).map((phrase) => phrase.text);
      expect(poolFor(at(range.from), '').filter((text) => mine.includes(text)).length).toBe(mine.length * 2);
    }
    const night = ODD_HOUR_PHRASES.find((range) => range.from === 2)!.phrases[0]!.text;
    expect(poolFor(at(3), 'Ana')).toContain(night);
    expect(poolFor(at(10), 'Ana')).not.toContain(night);
    expect(poolFor(at(21), 'Ana').length).toBeLessThan(poolFor(at(23), 'Ana').length);
  });

  it('las frases sobre Claude salen a cualquier hora, y las que llevan nombre solo con nombre', () => {
    expect(AI_PHRASES.length).toBeGreaterThanOrEqual(10);
    expect(AI_PHRASES.filter((phrase) => phrase.named).every((phrase) => phrase.text.includes('{name}'))).toBe(true);
    const anonymous = AI_PHRASES.filter((phrase) => !phrase.named).map((phrase) => phrase.text);
    for (const hour of [3, 9, 13, 17, 22]) {
      const pool = poolFor(at(hour), '');
      expect(anonymous.every((text) => pool.includes(text))).toBe(true);
      expect(pool.every((text) => !/[{}]/.test(text))).toBe(true);
    }
    expect(poolFor(at(9), 'Ana').some((text) => text.startsWith('Ana, ¿lo escribiste vos'))).toBe(true);
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

describe('frases según la jornada', () => {
  const day = (hh: number, mm = 0, weekday = 3) => new Date(2026, 10, 2 + weekday - 1, hh, mm); // 2/11/2026 es lunes
  const wd = { entry: '09:00', exit: '18:00' };
  const none = { entry: false, hours: false };

  it('workdayPhase reconoce cada momento de la jornada', () => {
    expect(workdayPhase(day(7, 30), wd, none)).toBe('beforeEntry');
    expect(workdayPhase(day(8, 50), wd, none)).toBe('entryPending');
    expect(workdayPhase(day(9, 30), wd, none)).toBe('entryPending');
    expect(workdayPhase(day(9, 30), wd, { entry: true, hours: false })).toBeNull();
    expect(workdayPhase(day(11, 30), wd, none)).toBeNull();
    expect(workdayPhase(day(17, 15), wd, none)).toBe('lastHour');
    expect(workdayPhase(day(18, 10), wd, none)).toBe('afterExitHours');
    expect(workdayPhase(day(18, 10), wd, { entry: true, hours: true })).toBe('afterExit');
    expect(workdayPhase(day(21, 30), wd, none)).toBe('longAfter');
  });

  it('sin horarios cargados, o en fin de semana, no hay fase', () => {
    expect(workdayPhase(day(18, 10), { entry: '', exit: '' }, none)).toBeNull();
    expect(workdayPhase(day(18, 10, 6), wd, none)).toBeNull();
    expect(workdayPhase(day(18, 10, 7), wd, none)).toBeNull();
    expect(workdayPhase(day(18, 10), { entry: '09:00', exit: '' }, none)).toBeNull();
  });

  it('cada fase suma sus frases (pesan más que las de avisos) y sin nombre no usa las que lo llevan', () => {
    for (const phase of Object.keys(WORKDAY_PHRASES) as Array<keyof typeof WORKDAY_PHRASES>) {
      expect(WORKDAY_PHRASES[phase].length).toBeGreaterThanOrEqual(4);
      const named = poolFor(at(10), 'Ana', { workday: phase });
      const own = WORKDAY_PHRASES[phase].map((phrase) => phrase.text.replaceAll('{name}', 'Ana'));
      own.forEach((text) => expect(named.filter((item) => item === text).length).toBe(3));
      expect(poolFor(at(10), '', { workday: phase }).every((text) => !/[{}]/.test(text))).toBe(true);
    }
    expect(poolFor(at(10), 'Ana', { workday: null })).toEqual(poolFor(at(10), 'Ana'));
  });

  it('un feriado sigue mandando sobre la jornada', () => {
    expect(poolFor(at(10), 'Ana', { holiday: 'X', workday: 'longAfter' }).length).toBe(HOLIDAY_PHRASES.length);
  });
});

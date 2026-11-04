import { describe, expect, it } from 'vitest';
import { dndLabel, isDndActive, untilTomorrow } from './dnd';

describe('no molestar', () => {
  const now = new Date(2026, 10, 4, 15, 20).getTime();
  it('está activo hasta la hora indicada, o para siempre, y nunca si no se pidió', () => {
    expect(isDndActive(null, now)).toBe(false);
    expect(isDndActive({ until: now + 60_000 }, now)).toBe(true);
    expect(isDndActive({ until: now - 1 }, now)).toBe(false);
    expect(isDndActive({ forever: true }, now)).toBe(true);
  });
  it('"hasta mañana" es la mañana siguiente a las 06:00, también a fin de mes', () => {
    expect(untilTomorrow(new Date(2026, 10, 4, 23, 59))).toBe(new Date(2026, 10, 5, 6, 0).getTime());
    expect(untilTomorrow(new Date(2026, 10, 30, 10, 0))).toBe(new Date(2026, 11, 1, 6, 0).getTime());
  });
  it('el texto dice hasta cuándo', () => {
    expect(dndLabel({ until: new Date(2026, 10, 4, 17, 30).getTime() }, new Date(now))).toBe('hasta las 17:30');
    expect(dndLabel({ until: new Date(2026, 10, 5, 6, 0).getTime() }, new Date(now))).toBe('hasta mañana 06:00');
    expect(dndLabel({ forever: true }, new Date(now))).toBe('hasta que lo apagues');
    expect(dndLabel(null, new Date(now))).toBe('');
    expect(dndLabel({ until: now - 1000 }, new Date(now))).toBe('');
  });
});

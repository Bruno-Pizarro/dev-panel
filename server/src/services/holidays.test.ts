import { describe, expect, it } from 'vitest';
import { parseHolidays, upcomingHolidays } from './holidays.js';

describe('feriados', () => {
  it('parseHolidays se queda con lo que tiene fecha válida', () => {
    expect(parseHolidays([{ fecha: '2026-11-23', nombre: 'Soberanía', tipo: 'trasladable' }, { fecha: 'mal', nombre: 'x' }, { nombre: 'sin fecha' }, null, 'texto'])).toEqual([{ date: '2026-11-23', name: 'Soberanía', type: 'trasladable' }]);
    expect(parseHolidays({})).toEqual([]);
  });

  it('upcomingHolidays: el de hoy y el próximo dentro de la ventana, aunque la lista venga desordenada', () => {
    const list = [{ date: '2026-12-08', name: 'C', type: '' }, { date: '2026-11-09', name: 'B', type: '' }, { date: '2026-11-04', name: 'A', type: '' }];
    expect(upcomingHolidays(list, '2026-11-04', 7)).toMatchObject({ today: { name: 'A' }, next: { holiday: { name: 'B' }, inDays: 5 } });
    expect(upcomingHolidays(list, '2026-11-10', 7).next).toBeNull();
    expect(upcomingHolidays(list, '2026-12-01', 7).next?.inDays).toBe(7);
    expect(upcomingHolidays([], '2026-11-04').today).toBeNull();
  });
});

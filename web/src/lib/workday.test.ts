import { describe, expect, it } from 'vitest';
import { itemUrgency, minutesSince, urgencyOf } from './workday';

const at = (h: number, m: number, day = 2) => new Date(2026, 9, day + 25, h, m); // 27/10/2026 es martes
const workday = { entry: '09:00', exit: '18:00' };
const items = (entry: boolean, exit: boolean, hours: boolean) => [{ id: 'marcar-entrada', done: entry }, { id: 'marcar-salida', done: exit }, { id: 'cargar-horas', done: hours }];

describe('colores del checklist según el horario', () => {
  it('niveles: antes del horario nada, hasta 15 min ámbar, hasta 1 h naranja, más rojo', () => {
    expect(urgencyOf(-5)).toBe('none');
    expect(urgencyOf(0)).toBe('none');
    expect(urgencyOf(15)).toBe('soft');
    expect(urgencyOf(16)).toBe('medium');
    expect(urgencyOf(60)).toBe('medium');
    expect(urgencyOf(61)).toBe('high');
    expect(urgencyOf(null)).toBe('none');
  });

  it('marcar entrada se va poniendo más urgente y se apaga al hacerlo', () => {
    const r = (h: number, m: number) => itemUrgency('marcar-entrada', false, items(false, false, false), workday, at(h, m)).urgency;
    expect([r(8, 50), r(9, 10), r(9, 40), r(11, 0)]).toEqual(['none', 'soft', 'medium', 'high']);
    expect(itemUrgency('marcar-entrada', true, items(true, false, false), workday, at(11, 0)).urgency).toBe('none');
    expect(itemUrgency('marcar-entrada', false, items(false, false, false), workday, at(9, 40)).note).toBe('40 min tarde');
  });

  it('marcar salida cuenta desde el horario de salida', () => {
    expect(itemUrgency('marcar-salida', false, items(true, false, false), workday, at(17, 0)).urgency).toBe('none');
    expect(itemUrgency('marcar-salida', false, items(true, false, false), workday, at(19, 30)).urgency).toBe('high');
    expect(itemUrgency('marcar-salida', false, items(true, false, false), workday, at(19, 30)).note).toBe('1 h 30 min tarde');
  });

  it('cargar horas es rojo apenas marcaste salida y no cargaste, y no antes', () => {
    expect(itemUrgency('cargar-horas', false, items(true, false, false), workday, at(17, 0)).urgency).toBe('none');
    expect(itemUrgency('cargar-horas', false, items(true, true, false), workday, at(18, 1)).urgency).toBe('high');
    expect(itemUrgency('cargar-horas', true, items(true, true, true), workday, at(18, 1)).urgency).toBe('none');
  });

  it('sin horario configurado o en fin de semana no se colorea', () => {
    expect(itemUrgency('marcar-entrada', false, items(false, false, false), { entry: '', exit: '' }, at(15, 0)).urgency).toBe('none');
    expect(minutesSince('09:00', new Date(2026, 9, 31, 12, 0))).toBeNull(); // sábado
    expect(itemUrgency('marcar-entrada', false, items(false, false, false), workday, new Date(2026, 10, 1, 12, 0)).urgency).toBe('none'); // domingo
  });
});

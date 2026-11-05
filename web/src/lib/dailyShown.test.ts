import { describe, expect, it } from 'vitest';
import { dailyToShow, dayLabel } from './dailyShown';

describe('qué daily se abre primero', () => {
  const saved = ['2026-10-31', '2026-10-30', '2026-10-29'];
  it('un lunes sin daily de hoy abre el del viernes y avisa que es uno anterior', () => {
    expect(dailyToShow(null, '2026-11-02', saved)).toEqual({ shown: '2026-10-31', fallback: true });
  });
  it('con el daily de hoy ya guardado abre ese', () => {
    expect(dailyToShow(null, '2026-11-02', ['2026-11-02', ...saved])).toEqual({ shown: '2026-11-02', fallback: false });
  });
  it('lo que el usuario eligió manda, aunque sea hoy vacío', () => {
    expect(dailyToShow('2026-11-02', '2026-11-02', saved)).toEqual({ shown: '2026-11-02', fallback: false });
    expect(dailyToShow('2026-10-29', '2026-11-02', saved)).toEqual({ shown: '2026-10-29', fallback: false });
  });
  it('sin ningún daily guardado abre hoy (vacío); sin datos todavía, nada', () => {
    expect(dailyToShow(null, '2026-11-02', [])).toEqual({ shown: '2026-11-02', fallback: false });
    expect(dailyToShow(null, null, [])).toEqual({ shown: null, fallback: false });
  });
  it('ignora los daily de fechas futuras y toma el más reciente anterior a hoy', () => {
    expect(dailyToShow(null, '2026-11-02', ['2026-11-05', '2026-10-28', '2026-10-31'])).toEqual({ shown: '2026-10-31', fallback: true });
  });
  it('dayLabel pone el día de la semana', () => {
    expect(dayLabel('2026-10-31')).toBe('sábado 31/10');
    expect(dayLabel('2026-10-30')).toBe('viernes 30/10');
  });
});

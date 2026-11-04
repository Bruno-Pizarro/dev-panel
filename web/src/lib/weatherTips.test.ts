import { describe, expect, it } from 'vitest';
import { weatherIcon, weatherTip } from './weatherTips';

describe('clima en el Inicio', () => {
  it('elige el ícono según el código y si es de día', () => {
    expect(weatherIcon(0, true)).toBe('sun');
    expect(weatherIcon(0, false)).toBe('moon');
    expect(weatherIcon(2, true)).toBe('cloud-sun');
    expect(weatherIcon(2, false)).toBe('cloud');
    expect(weatherIcon(3, true)).toBe('cloud');
    expect(weatherIcon(45, true)).toBe('fog');
    expect(weatherIcon(53, true)).toBe('drizzle');
    expect(weatherIcon(63, true)).toBe('rain');
    expect(weatherIcon(81, true)).toBe('rain');
    expect(weatherIcon(73, true)).toBe('snow');
    expect(weatherIcon(95, true)).toBe('storm');
    expect(weatherIcon(-1, true)).toBe('cloud');
  });

  it('la frase reacciona a la lluvia, tormenta, calor y frío; si no hay nada que decir es null', () => {
    expect(weatherTip(61, 18)).toBe('Llueve: llevá paraguas.');
    expect(weatherTip(96, 25)).toContain('Tormenta');
    expect(weatherTip(0, 34)).toBe('Mucho calor: hidratate.');
    expect(weatherTip(3, 5)).toBe('Hace frío: abrigate.');
    expect(weatherTip(1, 21)).toBeNull();
  });
});

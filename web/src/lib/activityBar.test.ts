import { describe, expect, it } from 'vitest';
import { DEFAULT_BAR_PREFS, withDefaults, workdayText } from './activityBar';

const at = (h: number, m = 0) => new Date(2026, 10, 10, h, m);
const day = { entry: '09:00', exit: '18:00' };

describe('jornada en la barra', () => {
  it('antes de entrar, en curso y terminada', () => {
    expect(workdayText(at(8, 30), day)).toEqual({ text: 'Entrás a las 09:00', state: 'before' });
    expect(workdayText(at(15, 5), day)).toEqual({ text: '6 h 05 min · faltan 2 h 55 min', state: 'during' });
    expect(workdayText(at(9, 20), day)).toEqual({ text: '20 min · faltan 8 h 40 min', state: 'during' });
    expect(workdayText(at(18, 0), day)).toEqual({ text: 'Jornada terminada (18:00)', state: 'after' });
  });
  it('sin horarios configurados, nada', () => {
    expect(workdayText(at(12), { entry: '', exit: '' })).toBeNull();
    expect(workdayText(at(12), { entry: '09:00', exit: '' })).toBeNull();
  });
});

describe('preferencias de la barra', () => {
  it('activada por defecto, con todos los segmentos', () => {
    expect(DEFAULT_BAR_PREFS.enabled).toBe(true);
    expect(Object.values(DEFAULT_BAR_PREFS.segments).every(Boolean)).toBe(true);
  });
  it('lo guardado se completa con los valores por defecto', () => {
    expect(withDefaults({ segments: { context: false } as never })).toMatchObject({ enabled: true, segments: { context: false, today: true, services: true } });
    expect(withDefaults(null)).toEqual(DEFAULT_BAR_PREFS);
    expect(withDefaults({ enabled: false }).enabled).toBe(false);
  });
});

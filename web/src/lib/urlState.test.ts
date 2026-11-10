import { describe, expect, it } from 'vitest';
import { pickTab, withParam } from './urlState';

const TABS = ['resumen', 'estado', 'cambios'] as const;

describe('estado en la URL', () => {
  it('la pestaña pedida si es válida; si no, la de por defecto', () => {
    expect(pickTab('estado', TABS, 'resumen')).toBe('estado');
    expect(pickTab('inventada', TABS, 'resumen')).toBe('resumen');
    expect(pickTab(null, TABS, 'resumen')).toBe('resumen');
    expect(pickTab('', TABS, 'resumen')).toBe('resumen');
  });

  it('pone o quita un parámetro sin tocar los demás ni el original', () => {
    const original = new URLSearchParams('tab=estado&otro=1');
    expect(withParam(original, 'full', '1').toString()).toBe('tab=estado&otro=1&full=1');
    expect(withParam(original, 'tab', null).toString()).toBe('otro=1');
    expect(withParam(original, 'tab', 'cambios').toString()).toBe('tab=cambios&otro=1');
    expect(original.toString()).toBe('tab=estado&otro=1');
  });
});

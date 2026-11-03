import { describe, expect, it } from 'vitest';
import { buildDefs, canBind, DEFS, displayKey, findConflict, isEditableTarget, matchAction, resolveBindings } from './shortcuts';

describe('atajos de teclado', () => {
  const defaults = resolveBindings(DEFS, undefined);

  it('las teclas por defecto: A/D pestañas (con flechas de alternativa), W/S tickets, F, R, g, ? y una letra por destino del menú', () => {
    expect(defaults['tabs.prev']).toBe('a');
    expect(defaults['tabs.next']).toBe('d');
    expect(defaults['ticket.prev']).toBe('w');
    expect(defaults['ticket.next']).toBe('s');
    expect(defaults['frame.full']).toBe('f');
    expect(defaults['refresh']).toBe('r');
    expect(defaults['goto.prefix']).toBe('g');
    expect(defaults['help']).toBe('?');
    expect(DEFS.filter((def) => def.context === 'goto').every((def) => def.defaultKey.length === 1)).toBe(true);
    expect(defaults['go:/planificacion']).toBe('d');
  });

  it('las teclas por defecto no chocan entre sí dentro de un mismo contexto', () => {
    for (const context of ['main', 'goto'] as const) {
      const keys = DEFS.filter((def) => def.context === context).flatMap((def) => [defaults[def.id]!, ...def.alt]);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('lo que el usuario cambió pisa el valor por defecto; lo inválido se ignora', () => {
    const custom = resolveBindings(DEFS, { 'tabs.prev': 'Q', 'tabs.next': 'AltGraph', 'frame.full': '' });
    expect(custom['tabs.prev']).toBe('q');
    expect(custom['tabs.next']).toBe('d');
    expect(custom['frame.full']).toBe('f');
  });

  it('matchAction resuelve la tecla (sin distinguir mayúsculas), las flechas alternativas y el contexto', () => {
    expect(matchAction(DEFS, defaults, 'main', 'A')?.id).toBe('tabs.prev');
    expect(matchAction(DEFS, defaults, 'main', 'ArrowRight')?.id).toBe('tabs.next');
    expect(matchAction(DEFS, defaults, 'main', 'x')).toBeNull();
    expect(matchAction(DEFS, defaults, 'goto', 'i')?.id).toBe('go:/');
    expect(matchAction(DEFS, defaults, 'goto', 'w')).toBeNull();
    const custom = resolveBindings(DEFS, { 'tabs.prev': 'q' });
    expect(matchAction(DEFS, custom, 'main', 'a')).toBeNull();
    expect(matchAction(DEFS, custom, 'main', 'q')?.id).toBe('tabs.prev');
  });

  it('findConflict detecta una tecla ya usada en el mismo contexto, incluidas las flechas fijas, pero no en el otro', () => {
    expect(findConflict(DEFS, defaults, 'tabs.prev', 'd')?.id).toBe('tabs.next');
    expect(findConflict(DEFS, defaults, 'ticket.prev', 'ArrowLeft')?.id).toBe('tabs.prev');
    expect(findConflict(DEFS, defaults, 'tabs.prev', 'a')).toBeNull();
    expect(findConflict(DEFS, defaults, 'tabs.prev', 'z')).toBeNull();
    // 's' es "ticket siguiente" (main) y "Servicios" (después de g): no chocan.
    expect(findConflict(DEFS, defaults, 'go:/claude', 's')?.id).toBe('go:/servicios');
    expect(findConflict(DEFS, defaults, 'go:/claude', 'w')).toBeNull();
  });

  it('canBind: letras, símbolos y flechas sí; números 1–9, espacio, Tab y modificadores no', () => {
    for (const ok of ['q', '?', '/', 'ArrowUp']) expect(canBind(ok)).toBe(true);
    for (const bad of ['1', '9', ' ', 'Tab', 'Escape', 'Shift', 'Enter']) expect(canBind(bad)).toBe(false);
  });

  it('displayKey dibuja las flechas y pone las letras en mayúscula', () => {
    expect(displayKey('a')).toBe('A');
    expect(displayKey('ArrowLeft')).toBe('←');
    expect(displayKey('?')).toBe('?');
  });

  it('isEditableTarget: campos de texto sí, el resto no', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('hay un destino por cada entrada del menú', () => {
    expect(buildDefs().filter((def) => def.context === 'goto')).toHaveLength(12);
  });
});

import { describe, expect, it } from 'vitest';
import { hasAnsi, parseAnsi } from './ansi';

const ESC = '\u001b';

describe('parseAnsi', () => {
  it('convierte los colores de la consola de Docker en segmentos con estilo', () => {
    const segments = parseAnsi(`[1] ${ESC}[32minfo${ESC}[39m: Listening to port 3010`);
    expect(segments.map((segment) => segment.text)).toEqual(['[1] ', 'info', ': Listening to port 3010']);
    expect(segments[1]!.style.color).toBeDefined();
    expect(segments[0]!.style.color).toBeUndefined();
    expect(segments[2]!.style.color).toBeUndefined();
  });

  it('soporta negrita, reinicio, 256 colores y truecolor', () => {
    const [bold, plain] = parseAnsi(`${ESC}[1mfuerte${ESC}[0m normal`);
    expect(bold!.style.bold).toBe(true);
    expect(plain!.style).toEqual({});
    expect(parseAnsi(`${ESC}[38;5;196mrojo`)[0]!.style.color).toBe('rgb(255, 0, 0)');
    expect(parseAnsi(`${ESC}[38;2;10;20;30mx`)[0]!.style.color).toBe('rgb(10, 20, 30)');
  });

  it('descarta secuencias de cursor y deja el texto', () => {
    expect(parseAnsi(`${ESC}[2K${ESC}[1Ghola`).map((segment) => segment.text).join('')).toBe('hola');
  });

  it('detecta si hay ANSI', () => {
    expect(hasAnsi(`${ESC}[31mx`)).toBe(true);
    expect(hasAnsi('texto')).toBe(false);
  });
});

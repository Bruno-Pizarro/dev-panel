import { describe, expect, it } from 'vitest';
import { languageOf, tokenizeLine } from './highlight';

const classes = (line: string, path = 'a.ts') => tokenizeLine(line, languageOf(path)).filter((t) => t.cls).map((t) => [t.text, t.cls]);
const joined = (line: string, path = 'a.ts') => tokenizeLine(line, languageOf(path)).map((t) => t.text).join('');

describe('highlight', () => {
  it('detecta el lenguaje por extensión', () => {
    expect(languageOf('src/a.tsx')).toBe('js');
    expect(languageOf('x/b.html')).toBe('markup');
    expect(languageOf('Dockerfile')).toBe('hash');
    expect(languageOf('README')).toBe('plain');
  });
  it('colorea palabras clave, tipos, funciones, textos, números y comentarios de TypeScript', () => {
    expect(classes("const total: Money = sum(items, 42); // listo")).toEqual([
      ['const', 'kw'], ['total', 'prop'], ['Money', 'type'], ['sum', 'fn'], ['42', 'num'], ['// listo', 'com'],
    ]);
    expect(classes("import { a } from 'x';")).toEqual([['import', 'kw'], ['from', 'kw'], ["'x'", 'str']]);
  });
  it('en JSON la clave es propiedad y el valor texto', () => {
    expect(classes('"name": "dev-panel",', 'package.json')).toEqual([['"name"', 'prop'], ['"dev-panel"', 'str']]);
  });
  it('colorea etiquetas y atributos de HTML', () => {
    expect(classes('<div class="a">', 'x.html')).toEqual([['<div', 'kw'], [' class', 'type'], ['"a"', 'str']]);
  });
  it('nunca pierde ni altera texto', () => {
    for (const [line, path] of [["  if (a < b) { return `x${1}`; }", 'a.ts'], ['a { color: #fff; margin: 4px }', 'a.css'], ['# titulo', 'a.md'], ["SELECT * FROM t -- c", 'a.sql'], ['ruta/con "comilla sin cerrar', 'a.ts']] as const) {
      expect(joined(line, path)).toBe(line);
    }
  });
});

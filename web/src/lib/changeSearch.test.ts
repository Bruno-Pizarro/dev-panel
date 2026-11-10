import { describe, expect, it } from 'vitest';
import { findMatches, splitByQuery, type SearchFile } from './changeSearch';
import { parseDiffLines } from './diff';

const DIFF = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1,3 +1,3 @@ function Buscar()', ' const a = 1;', '-const Total = 2;', '+const total = 3;'].join('\n');

const files = (): SearchFile[] => [
  { key: 'front|committed|src/total.ts', path: 'src/total.ts', rows: parseDiffLines(DIFF) },
  { key: 'front|committed|src/otro.ts', path: 'src/otro.ts', rows: null },
  { key: 'front|working|README.md', path: 'README.md', rows: [] },
];

describe('búsqueda en los cambios', () => {
  it('encuentra el nombre del archivo y las líneas del diff, sin distinguir mayúsculas', () => {
    expect(findMatches(files(), 'TOTAL')).toEqual([
      { file: 'front|committed|src/total.ts', line: null },
      { file: 'front|committed|src/total.ts', line: 2 },
      { file: 'front|committed|src/total.ts', line: 3 },
    ]);
  });

  it('no busca en los encabezados @@ ni en la cabecera técnica del diff', () => {
    expect(findMatches(files(), 'Buscar')).toEqual([]);
    expect(findMatches(files(), 'diff --git')).toEqual([]);
  });

  it('un archivo sin cargar solo se busca por nombre; uno sin diff, también', () => {
    expect(findMatches(files(), 'otro')).toEqual([{ file: 'front|committed|src/otro.ts', line: null }]);
    expect(findMatches(files(), 'readme')).toEqual([{ file: 'front|working|README.md', line: null }]);
  });

  it('sin búsqueda no hay resultados', () => {
    expect(findMatches(files(), '')).toEqual([]);
  });

  it('resalta todas las apariciones sin cambiar el texto', () => {
    const parts = splitByQuery('Total total TOTAL x', 'total');
    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual(['Total', 'total', 'TOTAL']);
    expect(parts.map((part) => part.text).join('')).toBe('Total total TOTAL x');
    expect(splitByQuery('nada', 'zzz')).toEqual([{ text: 'nada', hit: false }]);
    expect(splitByQuery('algo', '')).toEqual([{ text: 'algo', hit: false }]);
  });
});

import { describe, expect, it } from 'vitest';
import { placeCriticalPoints, type DiffLineRef } from './critical';
import type { CriticalPoint } from './types';

const point = (line: number | null, severity: 'critica' | 'alta' = 'alta', endLine?: number): CriticalPoint =>
  ({ repo: 'r', path: 'a.ts', scope: 'committed', source: 'regla', category: 'liquidacion', severity, line, endLine: endLine ?? null, reason: 'x' }) as unknown as CriticalPoint;

// Un diff incremental: solo trae las líneas 100 a 102 del archivo nuevo (y un salto de bloque delante).
const lines: DiffLineRef[] = [{ kind: 'hunk', next: null }, { kind: 'ctx', next: 100 }, { kind: 'add', next: 101 }, { kind: 'add', next: 102 }];

describe('placeCriticalPoints', () => {
  it('pone el motivo bajo la fila de su línea y la resalta', () => {
    const p = point(101);
    const r = placeCriticalPoints(lines, [p]);
    expect(r.notes.get(2)).toEqual([p]);
    expect(r.marked.get(2)).toBe('alta');
    expect(r.outside).toEqual([]);
  });

  it('un punto de una línea que no está en el diff queda en `outside` y no se ubica (antes se apilaba arriba con su número)', () => {
    const r = placeCriticalPoints(lines, [point(452), point(101)]);
    expect(r.outside.map((p) => p.line)).toEqual([452]);
    expect(r.notes.size).toBe(1);
  });

  it('un punto sin línea es de archivo entero y no cuenta como fuera del diff', () => {
    const r = placeCriticalPoints(lines, [point(null)]);
    expect(r.fileWide).toHaveLength(1);
    expect(r.outside).toEqual([]);
  });

  it('un rango resalta todas sus filas pero el motivo va solo bajo la primera línea', () => {
    const r = placeCriticalPoints(lines, [point(100, 'critica', 102)]);
    expect([...r.marked.keys()]).toEqual([1, 2, 3]);
    expect([...r.notes.keys()]).toEqual([1]);
    expect(r.marked.get(2)).toBe('critica');
  });

  it('la severidad crítica gana sobre la alta en la misma fila', () => {
    const r = placeCriticalPoints(lines, [point(101, 'critica'), point(101, 'alta')]);
    expect(r.marked.get(2)).toBe('critica');
  });

  it('los saltos de bloque no se marcan', () => {
    expect(placeCriticalPoints(lines, [point(100)]).marked.has(0)).toBe(false);
  });
});

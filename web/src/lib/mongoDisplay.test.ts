import { describe, expect, it } from 'vitest';
import { cellText, columnsOf, formatBytes, idFilter, numberText, prettyJson, simplify, specialText } from './mongoDisplay';

describe('mongoDisplay', () => {
  it('muestra ObjectId, fechas y números largos como valores legibles', () => {
    expect(specialText({ $oid: 'abc123' })).toBe('abc123');
    expect(specialText({ $date: '2026-11-24T10:00:00Z' })).toBe('2026-11-24T10:00:00Z');
    expect(specialText({ $date: { $numberLong: '0' } })).toBe('1970-01-01T00:00:00.000Z');
    expect(specialText({ a: 1 })).toBeNull();
    expect(specialText('texto')).toBeNull();
  });
  it('simplify convierte tipos especiales a cualquier profundidad y los números a número', () => {
    expect(simplify({ _id: { $oid: 'a1' }, edad: { $numberInt: '5' }, n: { $numberLong: '7' }, d: { $numberDecimal: '1.50' }, lista: [{ f: { $date: '2026-01-01' } }], x: 'y' })).toEqual({ _id: 'a1', edad: 5, n: 7, d: 1.5, lista: [{ f: '2026-01-01' }], x: 'y' });
  });
  it('los números grandes o en notación científica se muestran completos', () => {
    expect(numberText('2.0940148082E10')).toBe('20940148082');
    expect(numberText('1.5')).toBe('1.5');
    expect(numberText('9007199254740993')).toBe('9007199254740993');
    expect(numberText('NaN')).toBe('NaN');
    expect(specialText({ $numberDouble: '2.0940148082E10' })).toBe('20940148082');
    expect(cellText({ $numberDouble: '2.0940148082E10' })).toBe('20940148082');
    expect(simplify({ n: { $numberLong: '9007199254740993' } })).toEqual({ n: '9007199254740993' });
  });
  it('prettyJson indenta y simplifica', () => {
    expect(prettyJson({ _id: { $oid: 'a1' } })).toBe('{\n  "_id": "a1"\n}');
  });
  it('cellText resume cualquier valor y corta lo largo', () => {
    expect(cellText(undefined)).toBe('');
    expect(cellText(null)).toBe('null');
    expect(cellText({ $oid: 'a1' })).toBe('a1');
    expect(cellText(true)).toBe('true');
    expect(cellText([1, 2])).toBe('[2] [1,2]');
    expect(cellText({ a: { $oid: 'x' } })).toBe('{"a":"x"}');
    expect(cellText('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
  });
  it('las columnas llevan _id primero y siguen por frecuencia, con un tope', () => {
    expect(columnsOf([{ b: 1, _id: 1, a: 1 }, { _id: 2, a: 2 }])).toEqual(['_id', 'a', 'b']);
    expect(columnsOf([Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`c${index}`, 1]))], 5)).toHaveLength(5);
  });
  it('idFilter distingue un ObjectId de un texto', () => {
    expect(idFilter('6980f46cb4a8e1644fb9e569')).toBe('{"_id":{"$oid":"6980f46cb4a8e1644fb9e569"}}');
    expect(idFilter('abc')).toBe('{"_id":"abc"}');
    expect(idFilter('  ')).toBe('');
  });
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

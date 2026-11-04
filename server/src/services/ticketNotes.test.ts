import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'dp-notes-'));
let n: typeof import('./ticketNotes.js');
beforeAll(async () => {
  process.env['DEV_PANEL_DATA'] = dir;
  n = await import('./ticketNotes.js');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('notas por ticket', () => {
  it('guarda una nota por carpeta, la lee y un texto vacío la borra', () => {
    expect(n.getNote('33527-x')).toEqual({ text: '', updatedAt: null });
    const saved = n.setNote('33527-x', 'Esperar a Nico por el rol RRHH\n- falta probar celular', new Date('2026-11-04T12:00:00Z'));
    expect(saved).toEqual({ text: 'Esperar a Nico por el rol RRHH\n- falta probar celular', updatedAt: '2026-11-04T12:00:00.000Z' });
    expect(n.getNote('33526-y').text).toBe('');
    expect(n.dirsWithNotes()).toEqual(['33527-x']);
    expect(n.setNote('33527-x', '   \n ')).toEqual({ text: '', updatedAt: null });
    expect(n.dirsWithNotes()).toEqual([]);
  });
  it('conserva saltos de línea y tabulaciones, quita otros caracteres de control y recorta al máximo', () => {
    expect(n.cleanNote('a\r\nb\tc\u0007d')).toBe('a\nb\tcd');
    expect(n.cleanNote('x'.repeat(n.MAX_NOTE + 50))).toHaveLength(n.MAX_NOTE);
    expect(n.cleanNote(42)).toBe('');
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'dp-manual-'));
type Checklists = typeof import('./checklists.js');
let c: Checklists;

beforeAll(async () => {
  process.env['DEV_PANEL_DATA'] = dir;
  c = await import('./checklists.js');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const FROM_TICKET = [{ caso: 'Abrir Pendientes de firma', esperado: 'Se ve la insignia', grupo: 'Perfil' }, { caso: 'Firmar con PIN' }, { caso: 'Firmar con PIN' }, { caso: '   ' }];

describe('pruebas manuales', () => {
  it('arma la lista desde ticket.json sin duplicados ni casos vacíos, todo sin tildar', () => {
    const result = c.getManualTests('33526-x', FROM_TICKET);
    expect(result).toMatchObject({ done: 0, total: 2 });
    expect(result.items[0]).toMatchObject({ caso: 'Abrir Pendientes de firma', esperado: 'Se ve la insignia', grupo: 'Perfil', source: 'ticket', done: false });
  });

  it('recuerda lo tildado y solo acepta ids que existen', () => {
    const first = c.getManualTests('33526-x', FROM_TICKET).items[0]!;
    const ids = c.getManualTests('33526-x', FROM_TICKET).items.map((item) => item.id);
    c.setManualDone('33526-x', first.id, true, ids);
    expect(c.getManualTests('33526-x', FROM_TICKET)).toMatchObject({ done: 1, total: 2 });
    expect(() => c.setManualDone('33526-x', 'inventado', true, ids)).toThrow('Caso inexistente');
  });

  it('un caso tildado sigue tildado si ticket.json cambia el orden', () => {
    const reordered = [FROM_TICKET[1]!, FROM_TICKET[0]!];
    expect(c.getManualTests('33526-x', reordered).items.find((item) => item.caso.startsWith('Abrir'))?.done).toBe(true);
  });

  it('el usuario agrega y borra casos propios, y no puede borrar los de ticket.json', () => {
    const id = c.addManualCase('33526-x', { caso: 'Probar en celular', esperado: 'Se ven tarjetas' });
    const list = c.getManualTests('33526-x', FROM_TICKET);
    expect(list.items.at(-1)).toMatchObject({ id, source: 'panel', esperado: 'Se ven tarjetas' });
    expect(() => c.addManualCase('33526-x', { caso: '  ' })).toThrow('Escribí el caso a probar');
    expect(() => c.removeManualCase('33526-x', list.items[0]!.id)).toThrow('Solo se pueden borrar');
    c.removeManualCase('33526-x', id);
    expect(c.getManualTests('33526-x', FROM_TICKET).total).toBe(2);
  });

  it('reiniciar destilda todo y cada ticket tiene su propio estado', () => {
    c.resetManualDone('33526-x');
    expect(c.getManualTests('33526-x', FROM_TICKET).done).toBe(0);
    c.setManualDone('otro', c.getManualTests('otro', FROM_TICKET).items[0]!.id, true, c.getManualTests('otro', FROM_TICKET).items.map((item) => item.id));
    expect(c.getManualTests('33526-x', FROM_TICKET).done).toBe(0);
    expect(c.getManualTests('otro', FROM_TICKET).done).toBe(1);
  });
});

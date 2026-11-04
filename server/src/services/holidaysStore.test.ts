import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Guarda en disco: se carga después de apuntar los datos a una carpeta temporal (nunca a la real).
describe('feriados guardados por año', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp-holidays-'));
  let holidaysOf: typeof import('./holidays.js').holidaysOf;
  beforeAll(async () => {
    process.env['DEV_PANEL_DATA'] = dir;
    ({ holidaysOf } = await import('./holidays.js'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('pide el año una sola vez y después usa lo guardado; si la API falla y no hay nada, lista vacía', async () => {
    let calls = 0;
    const api = (async (url: string) => { calls += 1; expect(url).toContain('/feriados/2030'); return { ok: true, json: async () => [{ fecha: '2030-05-01', nombre: 'Día del Trabajo', tipo: 'inamovible' }] }; }) as never;
    expect(await holidaysOf(2030, api)).toHaveLength(1);
    expect(await holidaysOf(2030, api)).toHaveLength(1);
    expect(calls).toBe(1);
    expect(await holidaysOf(2031, (async () => ({ ok: false, json: async () => ({}) })) as never)).toEqual([]);
    expect(await holidaysOf(2032, (async () => { throw new Error('sin red'); }) as never)).toEqual([]);
  });
});

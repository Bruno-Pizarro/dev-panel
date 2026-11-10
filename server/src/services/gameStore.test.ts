import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// Los datos van a una carpeta temporal (se fija ANTES de importar el servicio): nunca a la `data/` real.
const dir = mkdtempSync(join(tmpdir(), 'dp-game-'));
process.env['DEV_PANEL_DATA'] = dir;
const { cleanPrefs, GameConflict, MAX_BYTES, readGame, writeGame } = await import('./gameStore.js');

afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => rmSync(join(dir, 'game.json'), { force: true }));

describe('guardado de lo divertido en el servidor', () => {
  it('sin archivo está vacío, en la versión 0', () => {
    expect(readGame()).toEqual({ version: 0, updatedAt: null, state: null, prefs: null });
  });

  it('guarda el estado y las preferencias, sube la versión y el archivo queda privado', () => {
    const saved = writeGame({ baseVersion: 0, state: { version: 1, unlocked: { rompehielo: { first: 'x', last: 'x', count: 1 } } }, prefs: { enabled: true, mascotId: 'gatito', mascotName: 'Michi' } }, new Date('2026-11-10T12:00:00Z'));
    expect(saved).toMatchObject({ version: 1, updatedAt: '2026-11-10T12:00:00.000Z', prefs: { enabled: true, mascotId: 'gatito', mascotName: 'Michi' } });
    expect(readGame().state).toMatchObject({ unlocked: { rompehielo: { count: 1 } } });
    expect(statSync(join(dir, 'game.json')).mode & 0o777).toBe(0o600);
    expect(existsSync(join(dir, 'game.json.tmp'))).toBe(false);
  });

  it('una pieza que no viene se conserva como estaba', () => {
    writeGame({ baseVersion: 0, state: { a: 1 }, prefs: { mascotId: 'oso' } });
    writeGame({ baseVersion: 1, prefs: { mascotId: 'lobo' } });
    expect(readGame()).toMatchObject({ version: 2, state: { a: 1 }, prefs: { mascotId: 'lobo' } });
  });

  it('si otro guardó antes (versión distinta) no pisa y devuelve lo vigente', () => {
    writeGame({ baseVersion: 0, state: { dueño: 'primero' } });
    let conflict: unknown;
    try {
      writeGame({ baseVersion: 0, state: { dueño: 'segundo' } });
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(GameConflict);
    expect((conflict as InstanceType<typeof GameConflict>).current).toMatchObject({ version: 1, state: { dueño: 'primero' } });
    expect(readGame().state).toEqual({ dueño: 'primero' });
  });

  it('las preferencias solo guardan lo conocido y con su tipo', () => {
    expect(cleanPrefs({ enabled: 'si', sound: true, mascotId: '../x', mascotName: 'x'.repeat(50), inventado: 1, closeDay: false })).toEqual({ sound: true, closeDay: false, mascotName: 'x'.repeat(20) });
    expect(cleanPrefs(null)).toEqual({});
  });

  it('un estado demasiado grande se rechaza sin tocar lo guardado', () => {
    writeGame({ baseVersion: 0, state: { ok: true } });
    expect(() => writeGame({ baseVersion: 1, state: { grande: 'x'.repeat(MAX_BYTES) } })).toThrow(RangeError);
    expect(readGame().state).toEqual({ ok: true });
  });

  it('un archivo dañado se toma como vacío', () => {
    writeGame({ baseVersion: 0, state: { a: 1 } });
    writeFileSync(join(dir, 'game.json'), '{no es json');
    expect(readGame().version).toBe(0);
    expect(readFileSync(join(dir, 'game.json'), 'utf8')).toContain('no es json');
  });
});

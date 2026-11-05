import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'dp-home-routes-'));
beforeAll(() => {
  process.env['DEV_PANEL_DATA'] = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('rutas del Inicio', () => {
  it('/api/weather valida la ubicación (sin salir a internet cuando es inválida)', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerHomeRoutes } = await import('./home.js');
    const app = Fastify();
    registerHomeRoutes(app);
    for (const query of ['', '?lat=abc&lon=1', '?lat=95&lon=1', '?lat=1&lon=200', '?lat=1']) {
      expect((await app.inject({ method: 'GET', url: `/api/weather${query}` })).statusCode).toBe(400);
    }
    await app.close();
  });
});

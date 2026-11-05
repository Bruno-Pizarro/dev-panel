import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'dp-reminders-routes-'));
beforeAll(() => {
  process.env['DEV_PANEL_DATA'] = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('rutas de recordatorios', () => {
  it('crea, lista, marca como hecho y borra; rechaza datos inválidos', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerReminderRoutes } = await import('./reminders.js');
    const app = Fastify();
    registerReminderRoutes(app);
    const created = await app.inject({ method: 'POST', url: '/api/reminders', payload: { text: 'Probar lo de Mariano', at: '2026-11-06' } });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    expect((await app.inject({ method: 'GET', url: '/api/reminders' })).json().reminders).toMatchObject([{ id, text: 'Probar lo de Mariano', at: '2026-11-06', done: false }]);
    expect((await app.inject({ method: 'PUT', url: `/api/reminders/${id}`, payload: { done: true } })).json()).toMatchObject({ done: true });
    expect((await app.inject({ method: 'DELETE', url: `/api/reminders/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/reminders/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/reminders', payload: { text: '   ' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/reminders', payload: { text: 'x', at: 'mañana' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/reminders', payload: { nada: 1 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: `/api/reminders/${id}`, payload: { done: 'si' } })).statusCode).toBe(400);
    await app.close();
  });
});

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'dp-system-'));
const file = join(dir, 'config.json');
const PORT = 4777;
let app: FastifyInstance;
let base: Record<string, unknown>;

beforeAll(async () => {
  process.env['DEV_PANEL_CONFIG'] = file;
  process.env['DEV_PANEL_DATA'] = join(dir, 'data');
  const { buildApp } = await import('../app.js');
  const { defaultConfig } = await import('../config.js');
  base = defaultConfig('/work') as unknown as Record<string, unknown>;
  app = await buildApp({ port: PORT, serveWeb: false });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const put = (redmine: Record<string, unknown>) =>
  app.inject({ method: 'PUT', url: '/api/config', headers: { host: `127.0.0.1:${PORT}`, 'x-dev-panel': '1' }, payload: { ...base, redmine: { ...(base['redmine'] as object), ...redmine } } });
const stored = () => (JSON.parse(readFileSync(file, 'utf8')) as { redmine: { apiKey: string } }).redmine.apiKey;

describe('API key de Redmine en la configuración', () => {
  it('se guarda en config.json pero nunca vuelve al navegador', async () => {
    const saved = await put({ apiKey: 'secreto-123' });
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain('secreto-123');
    expect(saved.json().config.redmine).toMatchObject({ apiKey: '', apiKeySet: true });
    expect(stored()).toBe('secreto-123');
    const read = await app.inject({ method: 'GET', url: '/api/config', headers: { host: `127.0.0.1:${PORT}` } });
    expect(read.body).not.toContain('secreto-123');
    expect(read.json().config.redmine.apiKeySet).toBe(true);
  });

  it('un campo vacío conserva la guardada; clearApiKey la quita', async () => {
    await put({ apiKey: '' });
    expect(stored()).toBe('secreto-123');
    const cleared = await put({ apiKey: '', clearApiKey: true });
    expect(cleared.json().config.redmine.apiKeySet).toBe(false);
    expect(stored()).toBe('');
  });
});

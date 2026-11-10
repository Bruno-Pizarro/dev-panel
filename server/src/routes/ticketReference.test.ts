import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = mkdtempSync(join(tmpdir(), 'dp-ref-routes-'));
beforeAll(() => {
  process.env['DEV_PANEL_DATA'] = join(root, 'data');
  process.env['DEV_PANEL_CONFIG'] = join(root, 'config.json');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('GET /api/tickets/:dir/reference', () => {
  it('sirve el HTML aislado (CSP con sandbox, sin sniffing) y rechaza lo que no es HTML', async () => {
    const { defaultConfig } = await import('../config.js');
    const extra = join(root, 'extra');
    mkdirSync(join(extra, '33638-demo'), { recursive: true });
    writeFileSync(join(extra, '33638-demo', 'demo.html'), '<h1>Demo</h1><script>fetch("/api/config")</script>');
    writeFileSync(join(extra, '33638-demo', 'nota.md'), '# nota');
    const config = defaultConfig(join(root, 'projects'));
    config.paths.extra = extra;
    writeFileSync(process.env['DEV_PANEL_CONFIG']!, JSON.stringify(config));
    const { default: Fastify } = await import('fastify');
    const { registerTicketRoutes } = await import('./tickets.js');
    const app = Fastify();
    registerTicketRoutes(app);

    const ok = await app.inject({ method: 'GET', url: '/api/tickets/33638-demo/reference?path=demo.html' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toContain('text/html');
    expect(ok.headers['content-security-policy']).toContain('sandbox allow-scripts');
    expect(ok.headers['content-security-policy']).not.toContain('allow-same-origin');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.body).toContain('<h1>Demo</h1>');

    expect((await app.inject({ method: 'GET', url: '/api/tickets/33638-demo/reference?path=nota.md' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/tickets/33638-demo/reference?path=../x.html' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/tickets/33638-demo/reference?path=no.html' })).statusCode).toBe(404);
    await app.close();
  });
});

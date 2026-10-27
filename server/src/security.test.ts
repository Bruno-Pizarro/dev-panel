import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

const PORT = 4777;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ port: PORT, serveWeb: false });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url, headers: { host: `127.0.0.1:${PORT}`, ...headers } });

describe('seguridad de acceso', () => {
  it('acepta 127.0.0.1 y localhost con el puerto propio', async () => {
    expect((await get('/api/health')).statusCode).toBe(200);
    expect((await get('/api/health', { host: `localhost:${PORT}` })).statusCode).toBe(200);
  });

  it('rechaza un Host ajeno (DNS rebinding)', async () => {
    expect((await get('/api/health', { host: 'evil.example.com' })).statusCode).toBe(403);
    expect((await get('/api/health', { host: '127.0.0.1:9999' })).statusCode).toBe(403);
  });

  it('rechaza un Origin ajeno y acepta el de Vite en desarrollo', async () => {
    expect((await get('/api/health', { origin: 'https://evil.example.com' })).statusCode).toBe(403);
    expect((await get('/api/health', { origin: 'http://localhost:5173' })).statusCode).toBe(200);
  });

  it('rechaza una escritura sin la cabecera X-Dev-Panel', async () => {
    const response = await app.inject({ method: 'PUT', url: '/api/config', headers: { host: `127.0.0.1:${PORT}` }, payload: {} });
    expect(response.statusCode).toBe(403);
  });

  it('con la cabecera, una configuración inválida responde 400 y no escribe nada', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: { host: `127.0.0.1:${PORT}`, 'x-dev-panel': '1' },
      payload: { paths: {} },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Configuración inválida');
  });
});

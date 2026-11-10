import type { FastifyInstance } from 'fastify';
import { collectActivityBar, type ActivityBar } from '../services/activityBar.js';
import { orchestration, scanIfStale } from '../services/orchestrationStore.js';
import { requireConfig } from './helpers.js';

const CACHE_MS = 30_000;
let cache: { at: number; value: ActivityBar } | null = null;

/** Datos de la barra de actividad del pie (solo lectura; se guardan 30 s para no repetir git y Docker por cada pantalla). */
export const registerActivityBarRoutes = (app: FastifyInstance): void => {
  app.get('/api/activity-bar', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      await scanIfStale().catch(() => undefined);
      cache = { at: Date.now(), value: await collectActivityBar(config, { sessions: () => orchestration.sessions() }) };
    }
    return cache.value;
  });
};

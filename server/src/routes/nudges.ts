import type { FastifyInstance } from 'fastify';
import { collectNudges, type Nudge } from '../services/nudges.js';
import { requireConfig } from './helpers.js';

const CACHE_MS = 60_000;
let cache: { at: number; nudges: Nudge[] } | null = null;

/** Candidatos a aviso espontáneo (solo lectura; el navegador decide cuándo mostrarlos). Se guardan 1 minuto para no repetir git y Docker. */
export const registerNudgeRoutes = (app: FastifyInstance): void => {
  app.get('/api/nudges', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), nudges: await collectNudges(config) };
    return { generatedAt: new Date(cache.at).toISOString(), nudges: cache.nudges };
  });
};

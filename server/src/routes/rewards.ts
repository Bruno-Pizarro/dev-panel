import type { FastifyInstance } from 'fastify';
import { collectRewardFacts, type RewardFacts } from '../services/rewardFacts.js';
import { orchestration, scanIfStale } from '../services/orchestrationStore.js';
import { requireConfig } from './helpers.js';

const CACHE_MS = 30_000;
let cache: { at: number; value: RewardFacts } | null = null;

/** Hechos del día para los logros, récords y festejos (solo lectura; se guardan 30 s). Ver `services/rewardFacts.ts`. */
export const registerRewardRoutes = (app: FastifyInstance): void => {
  app.get('/api/rewards/facts', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      await scanIfStale().catch(() => undefined);
      cache = { at: Date.now(), value: await collectRewardFacts(config, { sessions: () => orchestration.sessions() }) };
    }
    return cache.value;
  });
};

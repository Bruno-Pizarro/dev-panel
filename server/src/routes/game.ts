import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GameConflict, readGame, writeGame } from '../services/gameStore.js';

/** Logros, récords y preferencias de lo divertido: se guardan en el servidor (`data/game.json`) para verlos desde cualquier navegador. */
export const registerGameRoutes = (app: FastifyInstance): void => {
  app.get('/api/game', async () => readGame());

  app.put('/api/game', { bodyLimit: 600 * 1024 }, async (request, reply) => {
    const body = z.object({ baseVersion: z.number().int().min(0), state: z.record(z.unknown()).optional(), prefs: z.record(z.unknown()).optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    try {
      return writeGame(body.data);
    } catch (error) {
      if (error instanceof GameConflict) return reply.code(409).send({ error: error.message, current: error.current });
      if (error instanceof RangeError) return reply.code(413).send({ error: error.message });
      throw error;
    }
  });
};

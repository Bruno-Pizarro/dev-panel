import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RedmineError } from '../services/redmine.js';
import { fetchReviewQueue, startReview } from '../services/reviewQueue.js';
import { requireConfig } from './helpers.js';

/** Cola de revisión: tickets en Revisión del sprint actual cuyo Control QA nadie tomó. La lectura no escribe nada; `start` solo crea la carpeta local del ticket. */
export const registerReviewQueueRoutes = (app: FastifyInstance): void => {
  app.get<{ Querystring: { refresh?: string } }>('/api/review-queue', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    try {
      return await fetchReviewQueue(config, undefined, new Date(), request.query.refresh === '1');
    } catch (error) {
      if (error instanceof RedmineError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>('/api/review-queue/:id/start', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Número de ticket inválido' });
    try {
      return await startReview(config, params.data.id);
    } catch (error) {
      if (error instanceof RedmineError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });
};

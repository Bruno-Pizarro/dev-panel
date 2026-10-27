import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RedmineError, fetchBoard, fetchIssue, loadCredentials } from '../services/redmine.js';
import { requireConfig } from './helpers.js';

export const registerRedmineRoutes = (app: FastifyInstance): void => {
  /** ¿Hay credenciales? Nunca devuelve la key. */
  app.get('/api/redmine/status', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const credentials = loadCredentials(config);
    return { configured: credentials !== null, baseUrl: credentials?.baseUrl ?? null };
  });

  app.get('/api/redmine/board', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const query = z.object({ scope: z.enum(['me', 'all']).default('me'), days: z.coerce.number().int().min(1).max(90).default(30) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    try {
      return await fetchBoard(config, query.data.scope, query.data.days);
    } catch (error) {
      if (error instanceof RedmineError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>('/api/redmine/issues/:id', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    try {
      return await fetchIssue(config, request.params.id);
    } catch (error) {
      if (error instanceof RedmineError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });
};

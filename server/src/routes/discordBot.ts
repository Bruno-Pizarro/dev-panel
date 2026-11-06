import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DiscordBotError, listThreads, threadMessages } from '../services/discordBot.js';
import { requireConfig } from './helpers.js';

/** Lectura del foro de MRs de Discord con el bot (solo lectura; ninguna ruta envía nada). */
export const registerDiscordBotRoutes = (app: FastifyInstance): void => {
  app.get<{ Querystring: { refresh?: string } }>('/api/discord/threads', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return listThreads(config, { force: request.query.refresh === '1' });
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>('/api/discord/threads/:id/messages', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(30) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Parámetros inválidos' });
    try {
      return { messages: await threadMessages(config, request.params.id, { limit: query.data.limit }) };
    } catch (error) {
      if (error instanceof DiscordBotError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });
};

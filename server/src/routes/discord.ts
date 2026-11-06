import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DiscordError, previewThread, publishThread } from '../services/discord.js';
import { requireConfig } from './helpers.js';

/** Hilo del ticket en el foro de MRs de Discord: la vista previa solo lee; publicar exige `confirm: true` (lo pide el usuario o Claude a pedido suyo). */
export const registerDiscordRoutes = (app: FastifyInstance): void => {
  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/discord', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return await previewThread(config, request.params.dir);
  });

  app.post<{ Params: { dir: string } }>('/api/tickets/:dir/discord', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ confirm: z.literal(true) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Falta la confirmación: publicar en Discord lo tiene que pedir el usuario' });
    try {
      return await publishThread(config, request.params.dir, { confirm: true });
    } catch (error) {
      if (error instanceof DiscordError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });
};

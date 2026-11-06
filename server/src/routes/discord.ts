import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DiscordError, previewThread, publishThread } from '../services/discord.js';
import { previewThreadMessage, sendThreadMessage } from '../services/discordMessage.js';
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

  const names = (value: string | undefined) => (value ?? '').split(',').map((name) => name.trim()).filter(Boolean);

  // Mensaje en el hilo del ticket: la vista previa solo lee; enviar exige `confirm: true`.
  app.get<{ Params: { dir: string }; Querystring: { text?: string; to?: string } }>('/api/tickets/:dir/discord/message', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return await previewThreadMessage(config, request.params.dir, { text: request.query.text ?? '', to: names(request.query.to) });
  });

  app.post<{ Params: { dir: string } }>('/api/tickets/:dir/discord/message', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ confirm: z.literal(true), text: z.string().min(1).max(4000), to: z.array(z.string().min(1).max(60)).max(10).default([]) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Faltan el texto o la confirmación: enviar a Discord lo tiene que pedir el usuario' });
    try {
      return await sendThreadMessage(config, request.params.dir, { text: body.data.text, to: body.data.to }, { confirm: true });
    } catch (error) {
      if (error instanceof DiscordError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });
};

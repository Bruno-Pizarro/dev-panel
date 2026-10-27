import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DailyError, buildDraft, listDaily, localDate, readDaily, writeDaily, MAX_DAILY_FILES } from '../services/daily.js';
import { requireConfig } from './helpers.js';

const fail = (reply: FastifyReply, error: unknown) => {
  if (error instanceof DailyError) return reply.code(error.status).send({ error: error.message });
  throw error;
};

export const registerDailyRoutes = (app: FastifyInstance): void => {
  app.get('/api/daily', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return { dir: config.paths.daily, today: localDate(new Date()), dates: listDaily(config.paths.daily), maxFiles: MAX_DAILY_FILES };
  });

  app.get<{ Params: { date: string } }>('/api/daily/:date', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    try {
      const content = readDaily(config.paths.daily, request.params.date);
      return content === null ? reply.code(404).send({ error: 'No hay daily para esa fecha' }) : { date: request.params.date, content };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put<{ Params: { date: string } }>('/api/daily/:date', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ content: z.string() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Falta el contenido' });
    try {
      return writeDaily(config.paths.daily, request.params.date, body.data.content);
    } catch (error) {
      return fail(reply, error);
    }
  });

  /** Borrador a partir de git y de _EXTRA; no se guarda hasta que el usuario lo confirme con PUT. */
  app.post('/api/daily/draft', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ since: z.enum(['today', 'yesterday', 'last']).default('today') }).safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Parámetro inválido' });
    return { markdown: await buildDraft(config, body.data.since) };
  });
};

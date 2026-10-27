import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { runChecks } from '../services/checks.js';
import { readRepoStatus } from '../services/gitRepos.js';
import { createJob } from '../services/jobs.js';
import { MongoError } from '../services/mongo.js';
import { SessionService } from '../services/session.js';
import { assertTicket, cleanTestData, listTestData } from '../services/testData.js';
import { requireConfig } from './helpers.js';

const fail = (reply: FastifyReply, error: unknown) => {
  if (error instanceof MongoError) return reply.code(error.status).send({ error: error.message });
  throw error;
};

export const registerToolRoutes = (app: FastifyInstance): void => {
  app.get('/api/repos', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return { baseBranch: config.git.baseBranch, repos: await readRepoStatus(config) };
  });

  app.get('/api/checks', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return { checks: await runChecks(config) };
  });

  app.get<{ Querystring: { q?: string } }>('/api/session/users', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    try {
      return { users: await new SessionService(config).searchUsers(request.query.q ?? '') };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/api/session/active', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return { sessions: new SessionService(config).list() };
  });

  app.post('/api/session/token', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ userId: z.string(), confirm: z.literal(true) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Falta el usuario o la confirmación' });
    try {
      return await new SessionService(config).mint(body.data.userId);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/api/session/revoke', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ id: z.string().optional(), confirm: z.literal(true) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Falta la confirmación' });
    try {
      return { deleted: await new SessionService(config).revoke(body.data.id) };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get<{ Querystring: { ticket?: string } }>('/api/testdata', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    try {
      const ticket = assertTicket(request.query.ticket);
      return { ticket, rows: await listTestData(config, ticket) };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/api/testdata/clean', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ ticket: z.string(), confirm: z.literal(true) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Falta el ticket o la confirmación' });
    try {
      const ticket = assertTicket(body.data.ticket);
      return { jobId: createJob(`Limpiar datos de [${ticket}]`, (log) => cleanTestData(config, ticket, log)).id };
    } catch (error) {
      return fail(reply, error);
    }
  });
};

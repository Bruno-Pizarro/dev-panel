import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MongoError } from '../services/mongo.js';
import { MongoExplorer } from '../services/mongoExplorer.js';
import { requireConfig } from './helpers.js';

const fail = (reply: FastifyReply, error: unknown) => {
  if (error instanceof MongoError) return reply.code(error.status).send({ error: error.message });
  throw error;
};

const target = z.object({ db: z.string().min(1), collection: z.string().min(1) });
const documents = target.extend({
  filter: z.string().optional(),
  sort: z.string().optional(),
  fields: z.string().optional(),
  limit: z.coerce.number().optional(),
  skip: z.coerce.number().optional(),
});

/** Explorador de bases de solo lectura: solo rutas GET, ninguna escribe en Mongo. */
export const registerExplorerRoutes = (app: FastifyInstance): void => {
  /** Solo los nombres de las bases: las colecciones y sus conteos se piden de a una base, al expandirla. */
  app.get('/api/explorer/databases', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    try {
      return { databases: await new MongoExplorer(config).databases() };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/api/explorer/collections', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const query = z.object({ db: z.string().min(1) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Falta la base' });
    try {
      return { collections: await new MongoExplorer(config).collections(query.data.db) };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/api/explorer/documents', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const query = documents.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Faltan la base o la colección' });
    try {
      return await new MongoExplorer(config).documents(query.data);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/api/explorer/indexes', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const query = target.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Faltan la base o la colección' });
    try {
      return await new MongoExplorer(config).indexes(query.data.db, query.data.collection);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/api/explorer/schema', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const query = target.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Faltan la base o la colección' });
    try {
      return await new MongoExplorer(config).schema(query.data.db, query.data.collection);
    } catch (error) {
      return fail(reply, error);
    }
  });
};

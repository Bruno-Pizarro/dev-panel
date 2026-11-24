import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MongoClient, MongoError } from '../services/mongo.js';
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
  app.get('/api/explorer/databases', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    try {
      return { databases: await new MongoClient(config).listCollections() };
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

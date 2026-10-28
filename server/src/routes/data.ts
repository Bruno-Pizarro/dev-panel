import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createJob, registerJobRoutes } from '../services/jobs.js';
import { existsSync } from 'node:fs';
import { MongoClient, MongoError, listBackupScripts, resolveBackupScript, scriptsDir, createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot, runRemoteBackup } from '../services/mongo.js';
import { requireConfig } from './helpers.js';

const itemSchema = z.object({ db: z.string(), collection: z.string() });
const confirm = z.literal(true);

const fail = (reply: FastifyReply, error: unknown) => {
  if (error instanceof MongoError) return reply.code(error.status).send({ error: error.message });
  throw error;
};

export const registerDataRoutes = (app: FastifyInstance): void => {
  registerJobRoutes(app);

  /** Bases y colecciones reales del Mongo local con su conteo: alimenta los chips de selección. */
  app.get('/api/data/collections', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    try {
      return { databases: await new MongoClient(config).listCollections() };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/api/data/snapshots', async () => ({ snapshots: listSnapshots() }));

  app.post('/api/data/snapshots', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ items: z.array(itemSchema).min(1).max(500), label: z.string().max(80).default('') }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Elegí al menos una colección' });
    const job = createJob('Snapshot', (log) => createSnapshot(config, body.data.items, body.data.label, log));
    return { jobId: job.id };
  });

  app.post<{ Params: { id: string } }>('/api/data/snapshots/:id/restore', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ confirm, items: z.array(itemSchema).optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Falta la confirmación' });
    const { id } = request.params;
    if (!listSnapshots().some((snapshot) => snapshot.id === id)) return reply.code(404).send({ error: 'Snapshot inexistente' });
    const job = createJob(`Restaurar ${id}`, (log) => restoreSnapshot(config, id, body.data.items, log));
    return { jobId: job.id };
  });

  app.delete<{ Params: { id: string } }>('/api/data/snapshots/:id', async (request, reply) => {
    if (!listSnapshots().some((snapshot) => snapshot.id === request.params.id)) return reply.code(404).send({ error: 'Snapshot inexistente' });
    deleteSnapshot(request.params.id);
    return { ok: true };
  });

  app.post('/api/data/password/preview', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ email: z.string() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Mail inválido' });
    try {
      return { rows: await new MongoClient(config).passwordPreview(body.data.email) };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/api/data/password/reset', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ email: z.string().regex(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/), confirm }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Mail inválido o falta la confirmación' });
    const job = createJob(`Contraseña de ${body.data.email}`, (log) => new MongoClient(config).resetPassword(body.data.email, log));
    return { jobId: job.id };
  });

  app.get('/api/data/remote-backup/options', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const selected = resolveBackupScript(config);
    return { types: config.remoteBackup.types, scriptsDir: scriptsDir(config), scriptsDirExists: existsSync(scriptsDir(config)), scripts: listBackupScripts(config), selected: selected.split('/').pop(), selectedExists: existsSync(selected) };
  });

  app.post('/api/data/remote-backup', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ script: z.string().optional(), types: z.array(z.string()).min(1), restore: z.boolean().default(false), dryRun: z.boolean().default(true), confirm: z.boolean().default(false) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Elegí al menos un tipo de backup' });
    if (!body.data.dryRun && !body.data.confirm) return reply.code(400).send({ error: 'Falta la confirmación' });
    const job = createJob('Backup remoto', (log) => runRemoteBackup(config, body.data, log));
    return { jobId: job.id };
  });
};

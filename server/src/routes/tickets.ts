import { createReadStream, readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { IMAGE_TYPES, getTicket, listTickets, resolveTicketFile } from '../services/tickets.js';
import { requireConfig } from './helpers.js';

export const registerTicketRoutes = (app: FastifyInstance): void => {
  app.get('/api/tickets', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return { extra: config.paths.extra, tickets: listTickets(config.paths.extra) };
  });

  app.get<{ Params: { dir: string } }>('/api/tickets/:dir', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const ticket = getTicket(config.paths.extra, request.params.dir);
    return ticket ?? reply.code(404).send({ error: 'Ticket no encontrado' });
  });

  app.get<{ Params: { dir: string }; Querystring: { path?: string } }>('/api/tickets/:dir/file', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const file = resolveTicketFile(config.paths.extra, request.params.dir, request.query.path ?? '', 'text');
    if (!file.ok) return reply.code(file.status).send({ error: file.error });
    return { path: request.query.path, content: readFileSync(file.absolute, 'utf8') };
  });

  app.get<{ Params: { dir: string }; Querystring: { path?: string } }>('/api/tickets/:dir/asset', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const file = resolveTicketFile(config.paths.extra, request.params.dir, request.query.path ?? '', 'image');
    if (!file.ok) return reply.code(file.status).send({ error: file.error });
    return reply
      .header('Content-Type', IMAGE_TYPES[file.ext] ?? 'application/octet-stream')
      .header('Cache-Control', 'private, max-age=60')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .send(createReadStream(file.absolute));
  });
};

import { createReadStream, readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IMAGE_TYPES, TicketDeleteError, getTicket, ignoredDirs, listTickets, servicesForTicket, resolveTicketFile, trashTicket } from '../services/tickets.js';
import { getTestState, testStatusOf } from '../services/checklists.js';
import { getTicketState, kindOf, setTicketState } from '../services/ticketState.js';
import { requireConfig } from './helpers.js';

export const registerTicketRoutes = (app: FastifyInstance): void => {
  app.get('/api/tickets', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const tickets = listTickets(config.paths.extra, ignoredDirs(config)).map((summary) => {
      const meta = getTicket(config.paths.extra, summary.dir, ignoredDirs(config))?.meta;
      const state = getTicketState(summary.dir);
      return { ...summary, kind: kindOf(state, meta?.tipo), readyForTests: state.readyForTests === true, testStatus: testStatusOf(meta?.pruebas ?? [], getTestState(summary.dir), config.checklists.test) };
    });
    return { extra: config.paths.extra, tickets };
  });

  app.get<{ Params: { dir: string } }>('/api/tickets/:dir', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const ticket = getTicket(config.paths.extra, request.params.dir, ignoredDirs(config));
    if (!ticket) return reply.code(404).send({ error: 'Ticket no encontrado' });
    const state = getTicketState(request.params.dir);
    return { ...ticket, kind: kindOf(state, ticket.meta?.tipo), readyForTests: state.readyForTests === true, services: servicesForTicket(config, ticket.meta) };
  });

  /** Estado que se maneja desde el panel: "listo para pruebas" y si el ticket es desarrollo propio o solo revisión. */
  app.put<{ Params: { dir: string } }>('/api/tickets/:dir/state', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ ready: z.boolean().optional(), kind: z.enum(['desarrollo', 'revision']).optional() }).strict().safeParse(request.body);
    if (!body.success || (body.data.ready === undefined && body.data.kind === undefined)) return reply.code(400).send({ error: 'Pedido inválido' });
    if (!getTicket(config.paths.extra, request.params.dir, ignoredDirs(config))) return reply.code(404).send({ error: 'Ticket no encontrado' });
    return setTicketState(request.params.dir, body.data);
  });

  /** Mueve la carpeta a `.papelera/`; hay que mandar el nombre de la carpeta escrito a mano. */
  app.delete<{ Params: { dir: string } }>('/api/tickets/:dir', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ confirmName: z.string() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Falta escribir el nombre de la carpeta' });
    try {
      return trashTicket(config.paths.extra, request.params.dir, body.data.confirmName, ignoredDirs(config));
    } catch (error) {
      if (error instanceof TicketDeleteError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  app.get<{ Params: { dir: string }; Querystring: { path?: string } }>('/api/tickets/:dir/file', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const file = resolveTicketFile(config.paths.extra, request.params.dir, request.query.path ?? '', 'text', ignoredDirs(config));
    if (!file.ok) return reply.code(file.status).send({ error: file.error });
    return { path: request.query.path, content: readFileSync(file.absolute, 'utf8') };
  });

  app.get<{ Params: { dir: string }; Querystring: { path?: string } }>('/api/tickets/:dir/asset', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const file = resolveTicketFile(config.paths.extra, request.params.dir, request.query.path ?? '', 'image', ignoredDirs(config));
    if (!file.ok) return reply.code(file.status).send({ error: file.error });
    return reply
      .header('Content-Type', IMAGE_TYPES[file.ext] ?? 'application/octet-stream')
      .header('Cache-Control', 'private, max-age=60')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .send(createReadStream(file.absolute));
  });
};

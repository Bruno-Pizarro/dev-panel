import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { addReminder, listReminders, ReminderError, removeReminder, setReminderDone } from '../services/reminders.js';
import { publish } from '../sse.js';

const fail = (reply: FastifyReply, error: unknown) => {
  if (error instanceof ReminderError) return reply.code(error.status).send({ error: error.message });
  throw error;
};

/** Recordatorios: la interfaz y la herramienta MCP `reminder_add` usan estas mismas rutas. */
export const registerReminderRoutes = (app: FastifyInstance): void => {
  app.get('/api/reminders', async () => ({ reminders: listReminders() }));

  app.post('/api/reminders', async (request, reply) => {
    const body = z.object({ text: z.string(), at: z.string().nullish() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    try {
      const reminder = addReminder(body.data);
      publish('reminders', { changed: reminder.id });
      return reply.code(201).send(reminder);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put<{ Params: { id: string } }>('/api/reminders/:id', async (request, reply) => {
    const body = z.object({ done: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    try {
      const reminder = setReminderDone(request.params.id, body.data.done);
      publish('reminders', { changed: reminder.id });
      return reminder;
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/reminders/:id', async (request, reply) => {
    try {
      removeReminder(request.params.id);
      publish('reminders', { changed: request.params.id });
      return { ok: true };
    } catch (error) {
      return fail(reply, error);
    }
  });
};

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { KEEP_DAYS, refreshActivity } from '../services/activity.js';
import { CONCLUSIONS, ChecklistError, addManualCase, getDailyChecklist, getManualTests, getTestState, itemId, localDay, removeManualCase, resetManualDone, setDailyItem, setManualDone, setTestRun, type ManualCaseInput } from '../services/checklists.js';
import { getTicket, ignoredDirs } from '../services/tickets.js';
import { buildWeeklyReport } from '../services/weekly.js';
import { requireConfig } from './helpers.js';

const fail = (reply: FastifyReply, error: unknown) => {
  if (error instanceof ChecklistError) return reply.code(400).send({ error: error.message });
  throw error;
};

export const registerWorkRoutes = (app: FastifyInstance): void => {
  /** Historial de los últimos 5 días: lee git y las carpetas de la base de conocimiento; no escribe en ningún repo. */
  app.get('/api/activity', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return { keepDays: KEEP_DAYS, days: await refreshActivity(config) };
  });

  /** Datos de la semana (por ticket) y el pedido listo para que Claude arme el resumen semanal con el formato del Google Doc. */
  app.post('/api/daily/weekly', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ week: z.enum(['current', 'previous']).default('current') }).safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Parámetro inválido' });
    return buildWeeklyReport(config, body.data.week);
  });

  app.get<{ Querystring: { date?: string } }>('/api/checklist/daily', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    try {
      return { ...getDailyChecklist(config.checklists.daily, request.query.date ?? localDay()), workday: config.workday };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.put('/api/checklist/daily', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ id: z.string(), done: z.boolean(), date: z.string().optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Pedido inválido' });
    try {
      return { ...setDailyItem(config.checklists.daily, body.data.id, body.data.done, body.data.date ?? localDay()), workday: config.workday };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/test-state', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return { items: config.checklists.test.map((label) => ({ id: itemId(label), label })), runs: getTestState(request.params.dir) };
  });

  app.put<{ Params: { dir: string; run: string } }>('/api/tickets/:dir/test-state/:run', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ item: z.object({ id: z.string(), done: z.boolean() }).optional(), conclusion: z.enum(CONCLUSIONS as [string, ...string[]]).optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Pedido inválido' });
    try {
      return setTestRun(request.params.dir, request.params.run, body.data as never, config.checklists.test.map(itemId));
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---- pruebas manuales: los casos vienen de ticket.json (`pruebasManuales`) o los agrega el usuario; lo tildado vive en el panel
  const manualFromTicket = (config: NonNullable<ReturnType<typeof requireConfig>>, dir: string): ManualCaseInput[] | null => {
    const ticket = getTicket(config.paths.extra, dir, ignoredDirs(config));
    if (!ticket) return null;
    return (ticket.meta?.pruebasManuales ?? []).map((entry) => (typeof entry === 'string' ? { caso: entry } : entry));
  };

  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/manual-tests', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const cases = manualFromTicket(config, request.params.dir);
    if (!cases) return reply.code(404).send({ error: 'Ticket no encontrado' });
    return getManualTests(request.params.dir, cases);
  });

  app.put<{ Params: { dir: string; id: string } }>('/api/tickets/:dir/manual-tests/:id', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ done: z.boolean() }).safeParse(request.body);
    const cases = manualFromTicket(config, request.params.dir);
    if (!body.success || !cases) return reply.code(body.success ? 404 : 400).send({ error: body.success ? 'Ticket no encontrado' : 'Pedido inválido' });
    try {
      setManualDone(request.params.dir, request.params.id, body.data.done, getManualTests(request.params.dir, cases).items.map((item) => item.id));
      return getManualTests(request.params.dir, cases);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post<{ Params: { dir: string } }>('/api/tickets/:dir/manual-tests', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ caso: z.string().max(300), esperado: z.string().max(300).optional() }).safeParse(request.body);
    const cases = manualFromTicket(config, request.params.dir);
    if (!body.success || !cases) return reply.code(body.success ? 404 : 400).send({ error: body.success ? 'Ticket no encontrado' : 'Pedido inválido' });
    try {
      addManualCase(request.params.dir, body.data);
      return getManualTests(request.params.dir, cases);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete<{ Params: { dir: string; id: string } }>('/api/tickets/:dir/manual-tests/:id', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const cases = manualFromTicket(config, request.params.dir);
    if (!cases) return reply.code(404).send({ error: 'Ticket no encontrado' });
    try {
      removeManualCase(request.params.dir, request.params.id);
      return getManualTests(request.params.dir, cases);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post<{ Params: { dir: string } }>('/api/tickets/:dir/manual-tests/reset', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const cases = manualFromTicket(config, request.params.dir);
    if (!cases) return reply.code(404).send({ error: 'Ticket no encontrado' });
    resetManualDone(request.params.dir);
    return getManualTests(request.params.dir, cases);
  });
};

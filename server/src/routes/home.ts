import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDailyChecklist } from '../services/checklists.js';
import { getNotices, reminderNotices } from '../services/homeNotices.js';
import { dueReminders } from '../services/reminders.js';
import { fetchWeather, isValidCoordinates } from '../services/weather.js';
import { requireConfig } from './helpers.js';

/** Inicio: avisos del día (revisados una vez por día) y temperatura (con la ubicación que manda el navegador). */
export const registerHomeRoutes = (app: FastifyInstance): void => {
  app.get<{ Querystring: { refresh?: string } }>('/api/home/notices', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    let hoursLoaded = false;
    try {
      hoursLoaded = getDailyChecklist(config.checklists.daily).items.some((item) => /horas/i.test(item.label) && item.done);
    } catch {
      /* sin checklist: no se avisa de las horas */
      hoursLoaded = true;
    }
    // Los recordatorios no se guardan con la revisión del día: se calculan al pedirlos.
    return { ...(await getNotices(config, { refresh: request.query.refresh === '1', hoursLoaded })), reminders: reminderNotices(dueReminders()) };
  });

  app.get('/api/weather', async (request, reply) => {
    const query = z.object({ lat: z.coerce.number(), lon: z.coerce.number() }).safeParse(request.query);
    if (!query.success || !isValidCoordinates(query.data.lat, query.data.lon)) return reply.code(400).send({ error: 'Ubicación inválida' });
    const weather = await fetchWeather(query.data.lat, query.data.lon);
    return weather ?? reply.code(502).send({ error: 'No se pudo consultar el clima' });
  });
};

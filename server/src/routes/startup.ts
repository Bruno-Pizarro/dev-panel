import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { run } from '../docker.js';
import { publish } from '../sse.js';
import { StartupEngine, StartupError, stopServices } from '../services/startup.js';
import { loadPersonalPresets, presetSchema, savePersonalPresets } from '../services/presets.js';
import { requireConfig } from './helpers.js';

const runSchema = z.object({ services: z.array(z.string()).default([]), from: z.enum(['stage1', 'stage2', 'wait', 'stage3']).optional() });
const stopSchema = z.object({ scope: z.enum(['apps', 'all']), confirm: z.literal(true) });

export const registerStartupRoutes = (app: FastifyInstance): void => {
  const engine = new StartupEngine({
    getConfig: () => {
      const state = loadConfig();
      if (!state.configured) throw new StartupError(state.reason);
      return state.config;
    },
    runner: run,
    onChange: (state) => publish('startup', state),
  });

  app.get('/api/startup/state', async () => ({ run: engine.snapshot }));

  app.get<{ Querystring: { services?: string } }>('/api/startup/plan', async (request, reply) => {
    if (!requireConfig(reply)) return reply;
    const selected = (request.query.services ?? '').split(',').filter(Boolean);
    try {
      engine.validateSelection(selected);
      return { steps: engine.plan(selected) };
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  app.post('/api/startup/run', async (request, reply) => {
    if (!requireConfig(reply)) return reply;
    const body = runSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Cuerpo inválido' });
    if (engine.running) return reply.code(409).send({ error: 'Ya hay un levantado en curso' });
    try {
      engine.validateSelection(body.data.services);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
    // La corrida sigue en segundo plano; el avance llega por SSE (canal "startup") y por /api/startup/state.
    void engine.run(body.data.services, body.data.from).catch(() => undefined);
    return reply.code(202).send({ started: true });
  });

  app.post('/api/startup/cancel', async () => {
    engine.cancel();
    return { ok: true };
  });

  app.post('/api/startup/stop', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = stopSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Falta la confirmación o el alcance' });
    if (engine.running) return reply.code(409).send({ error: 'Hay un levantado en curso' });
    try {
      return { stopped: await stopServices(config, body.data.scope, run) };
    } catch (error) {
      return reply.code(500).send({ error: (error as Error).message });
    }
  });

  app.get('/api/presets', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    return { shared: config.startup.presets, personal: loadPersonalPresets() };
  });

  app.put('/api/presets/personal', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.array(presetSchema).max(30).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Presets inválidos' });
    const invalid = body.data.flatMap((preset) => preset.services).filter((name) => !config.startup.optional.includes(name));
    if (invalid.length) return reply.code(400).send({ error: `Servicios no permitidos: ${[...new Set(invalid)].join(', ')}` });
    savePersonalPresets(body.data);
    return { personal: body.data };
  });
};

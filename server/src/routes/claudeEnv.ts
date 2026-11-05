import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { ClaudeEnvError, claudeEnvFile, deleteVar, listVars, setVar } from '../services/claudeEnv.js';
import { GitlabError } from '../services/gitlab.js';
import { dailyState, ensureDailyToken, resetDailyFailure } from '../services/gitlabDaily.js';
import { addMrNote, createMr } from '../services/gitlabWrite.js';

const fail = (reply: FastifyReply, error: unknown) => {
  if (error instanceof ClaudeEnvError || error instanceof GitlabError) return reply.code(error.status).send({ error: error.message });
  throw error;
};

/**
 * Variables de Claude: la interfaz y `dpx` las administran con estas rutas, y GitLab (crear MR / comentar) usa el token diario
 * sin devolverlo nunca. Ninguna ruta devuelve valores: solo nombres y fechas.
 */
export const registerClaudeEnvRoutes = (app: FastifyInstance): void => {
  app.get('/api/claude-env', async () => {
    const state = loadConfig();
    return {
      file: claudeEnvFile(),
      vars: listVars(),
      gitlabDaily: state.configured ? dailyState(state.config) : { enabled: false, mintedAt: null, error: null },
    };
  });

  app.put<{ Params: { name: string } }>('/api/claude-env/:name', async (request, reply) => {
    const body = z.object({ value: z.string() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    try {
      setVar(request.params.name, body.data.value);
      return { ok: true };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete<{ Params: { name: string } }>('/api/claude-env/:name', async (request, reply) => {
    if (!z.object({ confirm: z.literal(true) }).safeParse(request.body).success) return reply.code(400).send({ error: 'Falta la confirmación' });
    try {
      deleteVar(request.params.name);
      return { ok: true };
    } catch (error) {
      return fail(reply, error);
    }
  });

  /** Pide ahora un token diario nuevo (revoca el anterior). */
  app.post('/api/claude-env/gitlab/renew', async (_request, reply) => {
    const state = loadConfig();
    if (!state.configured) return reply.code(409).send({ error: 'El panel no está configurado' });
    if (!state.config.claudeEnv.gitlabDaily) return reply.code(409).send({ error: 'El token diario está apagado en la configuración' });
    resetDailyFailure();
    const result = await ensureDailyToken(state.config, { force: true });
    return result.error ? reply.code(502).send({ error: result.error }) : result;
  });

  app.post('/api/gitlab/mr', async (request, reply) => {
    const body = z
      .object({ repo: z.string(), source: z.string(), target: z.string().optional(), title: z.string(), description: z.string().optional() })
      .safeParse(request.body);
    const state = loadConfig();
    if (!body.success || !state.configured) return reply.code(400).send({ error: 'Datos inválidos' });
    try {
      return reply.code(201).send(await createMr(state.config, body.data));
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/api/gitlab/mr-note', async (request, reply) => {
    const body = z.object({ repo: z.string(), iid: z.number().int(), body: z.string() }).safeParse(request.body);
    const state = loadConfig();
    if (!body.success || !state.configured) return reply.code(400).send({ error: 'Datos inválidos' });
    try {
      return reply.code(201).send(await addMrNote(state.config, body.data));
    } catch (error) {
      return fail(reply, error);
    }
  });
};

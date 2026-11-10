import type { FastifyInstance } from 'fastify';
import { agents } from '../services/agents.js';
import { mergeHookRuns } from '../services/orchestration.js';
import { claudeDirs, orchestration, scanIfStale } from '../services/orchestrationStore.js';

/**
 * Orquestación de Claude Code: sesiones y árbol de agentes con sus métricas, leídos de las transcripciones (ver `services/orchestration.ts`)
 * y completados con lo que vieron los hooks. Solo lectura.
 */
export const registerOrchestrationRoutes = (app: FastifyInstance): void => {
  app.get<{ Querystring: { refresh?: string } }>('/api/orchestration', async (request) => {
    await scanIfStale(request.query.refresh === '1');
    return { generatedAt: new Date().toISOString(), sessions: mergeHookRuns(orchestration.sessions(), agents.list()) };
  });

  /** Pedido, respuesta y pasos de un agente, leídos de su transcripción al abrirlo (con los secretos tapados). */
  app.get<{ Params: { session: string; agent: string } }>('/api/orchestration/sessions/:session/agents/:agent', async (request, reply) => {
    const found = orchestration.content(request.params.session, request.params.agent, claudeDirs().map((item) => item.dir));
    return found ?? reply.code(404).send({ error: 'Agente inexistente' });
  });
};

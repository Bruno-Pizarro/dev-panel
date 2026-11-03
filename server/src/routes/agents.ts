import type { FastifyInstance } from 'fastify';
import { agents } from '../services/agents.js';
import { publish } from '../sse.js';

/**
 * Agentes delegados por Claude Code. Los hooks de Claude mandan su entrada a POST /api/agents/event (con la cabecera
 * X-Dev-Panel, como toda escritura) y el panel la reenvía al navegador por SSE (canal `agents`). Solo se guarda lo mínimo.
 */
export const registerAgentRoutes = (app: FastifyInstance): void => {
  app.get('/api/agents', async () => ({ agents: agents.list() }));

  app.post('/api/agents/event', { bodyLimit: 256 * 1024 }, async (request, reply) => {
    const changed = agents.handleHook(request.body);
    if (changed) publish('agents', agents.list());
    return reply.code(202).send({ ok: true });
  });

  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    if (!agents.dismiss(request.params.id)) return reply.code(404).send({ error: 'Agente inexistente' });
    publish('agents', agents.list());
    return { ok: true };
  });
};

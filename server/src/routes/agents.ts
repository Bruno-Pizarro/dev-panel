import { resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config.js';
import { run } from '../docker.js';
import { agents } from '../services/agents.js';
import { ticketFromBranch } from '../services/gitRepos.js';
import { publish } from '../sse.js';

/** Ticket de la rama en la que está la carpeta de la sesión, si es una carpeta del panel (dentro de la de proyectos). */
const branchTicketOf = async (cwd: unknown): Promise<string | null> => {
  if (typeof cwd !== 'string' || !cwd.startsWith('/')) return null;
  const state = loadConfig();
  if (!state.configured) return null;
  const root = resolve(state.config.paths.projects);
  const folder = resolve(cwd);
  if (folder !== root && !folder.startsWith(`${root}${sep}`)) return null;
  const branch = await run('git', ['-C', folder, 'rev-parse', '--abbrev-ref', 'HEAD'], 3000);
  return branch.ok ? ticketFromBranch(branch.stdout) : null;
};

/**
 * Agentes delegados por Claude Code. Los hooks de Claude mandan su entrada a POST /api/agents/event (con la cabecera
 * X-Dev-Panel, como toda escritura) y el panel la reenvía al navegador por SSE (canal `agents`). Solo se guarda lo mínimo.
 */
export const registerAgentRoutes = (app: FastifyInstance): void => {
  app.get('/api/agents', async () => ({ agents: agents.list() }));

  app.post('/api/agents/event', { bodyLimit: 256 * 1024 }, async (request, reply) => {
    const body = request.body as { hook_event_name?: unknown; cwd?: unknown } | null;
    // La rama solo hace falta cuando se abre un agente (anuncio o arranque).
    const opens = body?.hook_event_name === 'PreToolUse' || body?.hook_event_name === 'SubagentStart';
    const changed = agents.handleHook(request.body, { branchTicket: opens ? await branchTicketOf(body?.cwd) : null });
    if (changed) publish('agents', agents.list());
    return reply.code(202).send({ ok: true });
  });

  /** Borra el historial (lo terminado); lo que sigue trabajando se conserva. */
  app.delete('/api/agents', async () => {
    const removed = agents.clearHistory();
    publish('agents', agents.list());
    return { removed };
  });

  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    if (!agents.dismiss(request.params.id)) return reply.code(404).send({ error: 'Agente inexistente' });
    publish('agents', agents.list());
    return { ok: true };
  });
};

import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config.js';
import { run } from '../docker.js';
import { z } from 'zod';
import { agents, getAgentSettings, setAgentSettings } from '../services/agents.js';
import { readAgentReply } from '../services/agentTranscript.js';
import { loadAccounts } from '../services/claudeAccounts.js';
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
/** Carpetas de configuración de Claude donde se puede leer una transcripción: la de siempre y las de las cuentas agregadas. */
const claudeDirs = (): string[] => [...new Set([process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'), ...loadAccounts().accounts.map((account) => account.configDir)])];

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** El hook de fin no trae el informe: se lee de la transcripción, con unos reintentos por si todavía se está escribiendo. */
const replyFromTranscript = async (path: unknown): Promise<string | null> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const reply = readAgentReply(path, claudeDirs());
    if (reply) return reply;
    await sleep(300);
  }
  return null;
};

export const registerAgentRoutes = (app: FastifyInstance): void => {
  app.get('/api/agents', async () => ({ agents: agents.list() }));

  app.post('/api/agents/event', { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const body = request.body as { hook_event_name?: unknown; cwd?: unknown; last_assistant_message?: unknown; agent_transcript_path?: unknown } | null;
    // La rama solo hace falta cuando se abre un agente (anuncio o arranque).
    const opens = body?.hook_event_name === 'PreToolUse' || body?.hook_event_name === 'SubagentStart';
    const needsReply = body?.hook_event_name === 'SubagentStop' && typeof body.last_assistant_message !== 'string' && getAgentSettings().saveContent;
    const changed = agents.handleHook(request.body, { branchTicket: opens ? await branchTicketOf(body?.cwd) : null, response: needsReply ? await replyFromTranscript(body?.agent_transcript_path) : null });
    if (changed) publish('agents', agents.list());
    return reply.code(202).send({ ok: true });
  });

  /** Preferencias: si se guarda lo que se le pide a cada agente y lo que contesta. */
  app.get('/api/agents/settings', async () => getAgentSettings());
  app.put('/api/agents/settings', async (request, reply) => {
    const body = z.object({ saveContent: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    return setAgentSettings(body.data);
  });

  /** Borra el pedido y la respuesta guardados de todos los agentes (el historial queda). */
  app.delete('/api/agents/content', async () => {
    const cleared = agents.clearContent();
    publish('agents', agents.list());
    return { cleared };
  });

  /** Un agente con su pedido y su respuesta (la lista no los trae: pueden ser largos). */
  app.get<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const found = agents.get(request.params.id);
    return found ?? reply.code(404).send({ error: 'Agente inexistente' });
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

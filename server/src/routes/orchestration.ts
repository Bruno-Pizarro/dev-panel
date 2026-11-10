import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { paths } from '../config.js';
import { agents } from '../services/agents.js';
import { loadAccounts } from '../services/claudeAccounts.js';
import { createOrchestration, mergeHookRuns, type ClaudeDir } from '../services/orchestration.js';

const orchestration = createOrchestration({ file: join(paths.data, 'orchestration.json') });

/** Carpetas de configuración de Claude: la de siempre y las de las cuentas agregadas en el panel. */
const claudeDirs = (): ClaudeDir[] => {
  const base = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');
  const accounts = loadAccounts().accounts;
  const list: ClaudeDir[] = [{ dir: base, label: accounts.find((account) => account.configDir === base)?.label ?? 'Claude' }];
  for (const account of accounts) if (!list.some((item) => item.dir === account.configDir)) list.push({ dir: account.configDir, label: account.label });
  return list;
};

/** Se vuelve a leer como mucho cada tanto (una pasada sin cambios cuesta casi nada, pero no hace falta pedirla por cada pantalla). */
const SCAN_EVERY_MS = 15_000;

/**
 * Orquestación de Claude Code: sesiones y árbol de agentes con sus métricas, leídos de las transcripciones (ver `services/orchestration.ts`)
 * y completados con lo que vieron los hooks. Solo lectura.
 */
export const registerOrchestrationRoutes = (app: FastifyInstance): void => {
  app.get<{ Querystring: { refresh?: string } }>('/api/orchestration', async (request) => {
    if (request.query.refresh === '1' || Date.now() - orchestration.lastScanAt() > SCAN_EVERY_MS) await orchestration.scan(claudeDirs());
    return { generatedAt: new Date().toISOString(), sessions: mergeHookRuns(orchestration.sessions(), agents.list()) };
  });

  /** Pedido, respuesta y pasos de un agente, leídos de su transcripción al abrirlo (con los secretos tapados). */
  app.get<{ Params: { session: string; agent: string } }>('/api/orchestration/sessions/:session/agents/:agent', async (request, reply) => {
    const found = orchestration.content(request.params.session, request.params.agent, claudeDirs().map((item) => item.dir));
    return found ?? reply.code(404).send({ error: 'Agente inexistente' });
  });
};

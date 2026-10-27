import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ClaudeError, LoginManager, addAccount, launchSnippets, loadAccounts, readAuthStatus, readUsage, removeAccount, setActive, type AuthStatus,
} from '../services/claudeAccounts.js';
import { join } from 'node:path';
import { paths } from '../config.js';
import { requireConfig } from './helpers.js';

const fail = (reply: FastifyReply, error: unknown) => {
  if (error instanceof ClaudeError) return reply.code(error.status).send({ error: error.message });
  throw error;
};

const STATUS_CACHE_MS = 20_000;
const statusCache = new Map<string, { at: number; status: AuthStatus }>();

export const registerClaudeRoutes = (app: FastifyInstance): void => {
  let login: LoginManager | null = null;

  /** Cuentas con su sesión (consultada a la CLI), el último dato de uso y los comandos de arranque. Nunca toca credenciales. */
  app.get('/api/claude/accounts', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const data = loadAccounts();
    const usage = readUsage(data.accounts);
    const accounts = await Promise.all(
      data.accounts.map(async (account) => {
        const cached = statusCache.get(account.id);
        const status = cached && Date.now() - cached.at < STATUS_CACHE_MS ? cached.status : await readAuthStatus(config, account);
        statusCache.set(account.id, { at: cached && Date.now() - cached.at < STATUS_CACHE_MS ? cached.at : Date.now(), status });
        return { ...account, status, usage: usage[account.id] ?? null, snippets: launchSnippets(account) };
      }),
    );
    // Comando del colector (rutas absolutas: la extensión de VS Code no siempre hereda el PATH de nvm).
    const command = `${process.execPath} ${join(paths.root, 'server', 'scripts', 'claude-statusline.mjs')}`;
    return { activeId: data.activeId, accounts, collector: { command, settings: JSON.stringify({ statusLine: { type: 'command', command } }, null, 2) } };
  });

  /** Barra del navbar: solo la cuenta activa y su último dato de uso (liviano, sin consultar a la CLI). */
  app.get('/api/claude/active-usage', async () => {
    const data = loadAccounts();
    const account = data.accounts.find((item) => item.id === data.activeId) ?? null;
    return { account: account ? { id: account.id, label: account.label, color: account.color } : null, usage: account ? (readUsage([account])[account.id] ?? null) : null };
  });

  app.post('/api/claude/accounts', async (request, reply) => {
    const body = z.object({ label: z.string(), color: z.string(), configDir: z.string().max(500).optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    try {
      return addAccount({ label: body.data.label, color: body.data.color, ...(body.data.configDir ? { configDir: body.data.configDir } : {}) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/claude/accounts/:id', async (request, reply) => {
    try {
      removeAccount(request.params.id);
      statusCache.delete(request.params.id);
      return { ok: true };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/api/claude/active', async (request, reply) => {
    const body = z.object({ id: z.string() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Cuenta inválida' });
    try {
      setActive(body.data.id);
      return { ok: true };
    } catch (error) {
      return fail(reply, error);
    }
  });

  // ---- Login desde el panel: el panel solo muestra el enlace y reenvía el código; las credenciales las escribe la CLI.
  app.get('/api/claude/login', async () => ({ login: login?.state ?? { accountId: null, status: 'idle', url: null, message: null } }));

  app.post('/api/claude/login', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ id: z.string() }).safeParse(request.body);
    const account = body.success ? loadAccounts().accounts.find((item) => item.id === body.data.id) : undefined;
    if (!account) return reply.code(404).send({ error: 'Cuenta inexistente' });
    login ??= new LoginManager(config);
    statusCache.delete(account.id);
    return { login: login.start(account) };
  });

  app.post('/api/claude/login/code', async (request, reply) => {
    const body = z.object({ code: z.string().max(700) }).safeParse(request.body);
    if (!body.success || !login) return reply.code(400).send({ error: 'Falta el código' });
    try {
      login.submitCode(body.data.code);
      return { ok: true };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post('/api/claude/login/cancel', async () => {
    login?.cancel();
    return { ok: true };
  });
};

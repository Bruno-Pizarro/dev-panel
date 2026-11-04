import { join } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { DevPanelConfig } from '../config.js';
import { getManualTests } from '../services/checklists.js';
import { fetchTicketMrs } from '../services/gitlab.js';
import { readRepoStatus } from '../services/gitRepos.js';
import { z } from 'zod';
import { getViewed, setViewed, viewKey } from '../services/changeReview.js';
import { getNote, setNote, MAX_NOTE } from '../services/ticketNotes.js';
import { readFileDiff, readFileSignature, readTicketChanges, viewedProgress, type ChangeScope } from '../services/ticketChanges.js';
import { readServicesHealth, readTestDataReport } from '../services/ticketHealth.js';
import { readMrChanges, readMrFileDiff, readMrSignature } from '../services/mrChanges.js';
import { buildClosing } from '../services/ticketClosing.js';
import { buildShipChecklist, lastRunOf, readI18nCheck, repoWarnings, reposChangedSince, summarizeShip, withoutManagedEnv } from '../services/ticketStatus.js';
import { getTicket, ignoredDirs, type TicketMeta } from '../services/tickets.js';
import { requireConfig } from './helpers.js';

const load = (reply: FastifyReply, dir: string) => {
  const config = requireConfig(reply);
  if (!config) return null;
  const ticket = getTicket(config.paths.extra, dir, ignoredDirs(config));
  if (!ticket) {
    void reply.code(404).send({ error: 'Ticket no encontrado' });
    return null;
  }
  return { config, ticket };
};

const manualProgress = (config: DevPanelConfig, dir: string, meta: TicketMeta | null) => {
  const cases = (meta?.pruebasManuales ?? []).map((entry) => (typeof entry === 'string' ? { caso: entry } : entry));
  const { done, total } = getManualTests(dir, cases, config.session.frontUrl);
  return { done, total };
};

/** Estado "vivo" de un ticket: git, servicios, MRs, datos de prueba y checklist de cierre. Todo es solo lectura. */
export const registerTicketStatusRoutes = (app: FastifyInstance): void => {
  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/git', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    if (!loaded) return reply;
    const { config, ticket } = loaded;
    const repos = withoutManagedEnv(await readRepoStatus(config, undefined, ticket.meta?.repos ?? []), config.envProfiles);
    const lastRun = lastRunOf(ticket.meta);
    return {
      baseBranch: config.git.baseBranch,
      ticketBranch: ticket.meta?.rama ?? null,
      repos: repos.map((repo) => ({ ...repo, warnings: repoWarnings(repo, ticket.meta?.rama) })),
      changedSinceLastRun: reposChangedSince(lastRun?.fecha ?? null, repos),
    };
  });

  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/changes', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    if (!loaded) return reply;
    const repos = await readTicketChanges(loaded.config, loaded.ticket.meta?.repos ?? [], undefined, getViewed(request.params.dir));
    return { baseBranch: loaded.config.git.baseBranch, repos, progress: viewedProgress(repos) };
  });

  app.get<{ Params: { dir: string }; Querystring: { repo?: string; path?: string; scope?: string } }>('/api/tickets/:dir/changes/diff', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    if (!loaded) return reply;
    const { repo, path, scope } = request.query;
    if (!repo || !path || (scope !== 'committed' && scope !== 'working')) return reply.code(400).send({ error: 'Faltan repo, path o scope (committed | working)' });
    // Solo los repos que declara el ticket.
    if (!(loaded.ticket.meta?.repos ?? []).includes(repo)) return reply.code(404).send({ error: 'Ese repo no pertenece al ticket' });
    const outcome = await readFileDiff(loaded.config, repo, path, scope as ChangeScope);
    return outcome.ok ? outcome.value : reply.code(outcome.status).send({ error: outcome.error });
  });

  /** Marca o desmarca un archivo como visto. La huella la calcula el servidor (no se acepta la del navegador). */
  app.put<{ Params: { dir: string } }>('/api/tickets/:dir/changes/viewed', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    if (!loaded) return reply;
    const body = z.object({ repo: z.string().min(1).max(100), path: z.string().min(1).max(500), scope: z.enum(['committed', 'working']), viewed: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const { repo, path, scope, viewed } = body.data;
    if (!(loaded.ticket.meta?.repos ?? []).includes(repo)) return reply.code(404).send({ error: 'Ese repo no pertenece al ticket' });
    const key = viewKey(repo, scope, path);
    if (!viewed) return { viewed: false, marks: Object.keys(setViewed(request.params.dir, key, null)).length };
    const signature = await readFileSignature(loaded.config, repo, path, scope);
    if (!signature.ok) return reply.code(signature.status).send({ error: signature.error });
    setViewed(request.params.dir, key, signature.signature);
    return { viewed: true, signature: signature.signature };
  });

  // Cambios de los MRs en GitLab (revisar lo de otra persona sin tener su rama). Mismas formas que los cambios locales.
  const mrMarks = (dir: string) => `${dir}#mr`;
  app.get<{ Params: { dir: string }; Querystring: { fresh?: string } }>('/api/tickets/:dir/mr-changes', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    return loaded ? readMrChanges(loaded.config, loaded.ticket.meta, getViewed(mrMarks(request.params.dir)), request.query.fresh === '1') : reply;
  });

  app.get<{ Params: { dir: string }; Querystring: { repo?: string; path?: string } }>('/api/tickets/:dir/mr-changes/diff', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    if (!loaded) return reply;
    const { repo, path } = request.query;
    if (!repo || !path) return reply.code(400).send({ error: 'Faltan repo o path' });
    const outcome = await readMrFileDiff(loaded.config, loaded.ticket.meta, repo, path);
    return outcome.ok ? outcome.value : reply.code(outcome.status).send({ error: outcome.error });
  });

  app.put<{ Params: { dir: string } }>('/api/tickets/:dir/mr-changes/viewed', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    if (!loaded) return reply;
    const body = z.object({ repo: z.string().min(1).max(150), path: z.string().min(1).max(500), scope: z.literal('committed'), viewed: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const { repo, path, viewed } = body.data;
    const key = viewKey(repo, 'committed', path);
    if (!viewed) return { viewed: false, marks: Object.keys(setViewed(mrMarks(request.params.dir), key, null)).length };
    const signature = await readMrSignature(loaded.config, loaded.ticket.meta, repo, path);
    if (!signature.ok) return reply.code(signature.status).send({ error: signature.error });
    setViewed(mrMarks(request.params.dir), key, signature.signature);
    return { viewed: true, signature: signature.signature };
  });

  /** Nota libre del ticket (solo local). */
  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/notes', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    return loaded ? getNote(request.params.dir) : reply;
  });

  app.put<{ Params: { dir: string } }>('/api/tickets/:dir/notes', { bodyLimit: 64 * 1024 }, async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    if (!loaded) return reply;
    const body = z.object({ text: z.string().max(MAX_NOTE * 2) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    return setNote(request.params.dir, body.data.text);
  });

  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/services', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    return loaded ? readServicesHealth(loaded.config, loaded.ticket.meta) : reply;
  });

  app.get<{ Params: { dir: string }; Querystring: { fresh?: string } }>('/api/tickets/:dir/gitlab', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    return loaded ? fetchTicketMrs(loaded.config, loaded.ticket.meta, request.query.fresh === '1') : reply;
  });

  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/test-data', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    return loaded ? readTestDataReport(loaded.config, loaded.ticket.meta, loaded.ticket.ticket) : reply;
  });

  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/ship', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    if (!loaded) return reply;
    const { config, ticket } = loaded;
    const repos = withoutManagedEnv(await readRepoStatus(config, undefined, ticket.meta?.repos ?? []), config.envProfiles);
    const items = buildShipChecklist({
      meta: ticket.meta,
      docs: ticket.files.docs,
      repos,
      manual: manualProgress(config, request.params.dir, ticket.meta),
      i18n: readI18nCheck(join(config.paths.extra, request.params.dir), config.paths.projects),
      viewed: viewedProgress(await readTicketChanges(config, ticket.meta?.repos ?? [], undefined, getViewed(request.params.dir))),
    });
    return { items, summary: summarizeShip(items), lastRun: lastRunOf(ticket.meta) };
  });

  /** Checklist de cierre + pedido para Claude. Solo lectura: el panel no escribe nada en Redmine ni en GitLab. */
  app.get<{ Params: { dir: string } }>('/api/tickets/:dir/closing', async (request, reply) => {
    const loaded = load(reply, request.params.dir);
    if (!loaded) return reply;
    const { config, ticket } = loaded;
    const [repos, mrReport, testData] = await Promise.all([
      readRepoStatus(config, undefined, ticket.meta?.repos ?? []).then((all) => withoutManagedEnv(all, config.envProfiles)),
      fetchTicketMrs(config, ticket.meta).catch(() => null),
      readTestDataReport(config, ticket.meta, ticket.ticket).catch(() => null),
    ]);
    const repoIssues = repos.flatMap((repo) => repoWarnings(repo, undefined).filter((warning) => /sin commitear|sin push|no está publicada/.test(warning.text)).map((warning) => `${repo.repo}: ${warning.text}`));
    return buildClosing({ ticket: ticket.ticket, title: ticket.title, mrs: mrReport?.mrs ?? [], mrsAvailable: Boolean(mrReport?.configured), testData, repoIssues, note: getNote(request.params.dir).text });
  });
};

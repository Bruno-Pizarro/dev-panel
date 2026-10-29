import { join } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { DevPanelConfig } from '../config.js';
import { getManualTests } from '../services/checklists.js';
import { fetchTicketMrs } from '../services/gitlab.js';
import { readRepoStatus } from '../services/gitRepos.js';
import { readServicesHealth, readTestDataReport } from '../services/ticketHealth.js';
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
    });
    return { items, summary: summarizeShip(items), lastRun: lastRunOf(ticket.meta) };
  });
};

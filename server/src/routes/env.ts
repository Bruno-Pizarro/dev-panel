import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { paths, type DevPanelConfig } from '../config.js';
import { restartContainer } from '../services/containers.js';
import { EnvProfileError, applyProfile, inspectEnv } from '../services/envProfiles.js';
import { requireConfig } from './helpers.js';

const KEEP_BACKUPS = 10;

const envFile = (config: DevPanelConfig, repo: string): { path: string } | null => {
  const profile = config.envProfiles[repo];
  return profile && config.repos.includes(repo) ? { path: join(config.paths.projects, repo, profile.file) } : null;
};

const backupEnv = (repo: string, source: string): string => {
  const dir = join(paths.data, 'env-backups');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = join(dir, `${repo}-${new Date().toISOString().replace(/[:.]/g, '-')}.env`);
  copyFileSync(source, target);
  chmodSync(target, 0o600);
  readdirSync(dir)
    .filter((name) => name.startsWith(`${repo}-`))
    .sort()
    .reverse()
    .slice(KEEP_BACKUPS)
    .forEach((old) => rmSync(join(dir, old), { force: true }));
  return target;
};

export const registerEnvRoutes = (app: FastifyInstance): void => {
  /** Estado de cada repo configurado: qué perfil tiene hoy (local/remoto/mixto) y sus líneas, enmascaradas. */
  app.get('/api/env', async (_request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const repos = Object.entries(config.envProfiles)
      .filter(([repo]) => config.repos.includes(repo))
      .map(([repo, profile]) => {
        const file = envFile(config, repo)!.path;
        if (!existsSync(file)) return { repo, file: profile.file, container: profile.container, exists: false, state: 'unknown' as const, managed: [], missing: [], conflicts: [] };
        return { repo, file: profile.file, container: profile.container, exists: true, ...inspectEnv(readFileSync(file, 'utf8'), profile) };
      });
    return { repos };
  });

  app.post<{ Params: { repo: string } }>('/api/env/:repo/apply', async (request, reply) => {
    const config = requireConfig(reply);
    if (!config) return reply;
    const body = z.object({ profile: z.enum(['local', 'remote']), confirm: z.boolean().default(false), dryRun: z.boolean().default(false), restart: z.boolean().default(false) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Perfil inválido' });
    if (!body.data.dryRun && !body.data.confirm) return reply.code(400).send({ error: 'Falta la confirmación' });
    const target = envFile(config, request.params.repo);
    if (!target || !existsSync(target.path)) return reply.code(404).send({ error: 'Repo o .env no encontrado' });

    let result;
    try {
      result = applyProfile(readFileSync(target.path, 'utf8'), config.envProfiles[request.params.repo]!, body.data.profile);
    } catch (error) {
      if (error instanceof EnvProfileError) return reply.code(409).send({ error: error.message });
      throw error;
    }
    if (body.data.dryRun) return { dryRun: true, changes: result.changes, backup: null, restarted: null };
    let backup: string | null = null;
    if (result.changes.length) {
      backup = backupEnv(request.params.repo, target.path);
      const mode = statSync(target.path).mode & 0o777;
      const temp = `${target.path}.devpanel.tmp`;
      writeFileSync(temp, result.content, { mode });
      renameSync(temp, target.path);
    }
    let restarted: boolean | null = null;
    const container = config.envProfiles[request.params.repo]!.container;
    if (body.data.restart && container && result.changes.length) restarted = (await restartContainer(container)).ok;
    return { changes: result.changes, backup: backup ? backup.split('/').pop() : null, restarted };
  });
};

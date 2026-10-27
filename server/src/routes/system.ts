import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { defaultConfig, configSchema, loadConfig, saveConfig, paths } from '../config.js';
import { docker, listComposeServices, listContainerNames } from '../docker.js';

export const registerSystemRoutes = (app: FastifyInstance): void => {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/config', async () => {
    const state = loadConfig();
    return state.configured ? { configured: true, config: state.config } : { configured: false, reason: state.reason };
  });

  app.put('/api/config', async (request, reply) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Configuración inválida', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    saveConfig(parsed.data);
    return { configured: true, config: parsed.data };
  });

  /** Datos para el asistente de primer arranque: herramientas, rutas sugeridas y qué existe de verdad. */
  app.get('/api/setup/detect', async () => {
    const projectsRoot = dirname(paths.root);
    const suggested = defaultConfig(projectsRoot);
    const [dockerVersion, composeVersion, containers] = await Promise.all([
      docker(['version', '--format', '{{.Server.Version}}']),
      docker(['compose', 'version', '--short']),
      listContainerNames(),
    ]);
    const composeServices = existsSync(suggested.compose.main) ? await listComposeServices(suggested.compose.main) : [];
    const minioComposeServices = existsSync(suggested.compose.minio) ? await listComposeServices(suggested.compose.minio) : [];
    const known = new Set([...composeServices, ...minioComposeServices]);
    const wanted = [
      ...suggested.startup.stage1, ...suggested.startup.stage2, ...suggested.startup.mandatory, ...suggested.startup.optional,
      ...Object.values(suggested.startup.groups).flatMap((group) => group.withStage2),
    ];
    return {
      docker: { ok: dockerVersion.ok, version: dockerVersion.stdout, error: dockerVersion.ok ? null : dockerVersion.stderr },
      compose: { ok: composeVersion.ok, version: composeVersion.stdout, error: composeVersion.ok ? null : composeVersion.stderr },
      paths: Object.fromEntries(
        Object.entries({ projects: suggested.paths.projects, extra: suggested.paths.extra, daily: suggested.paths.daily, composeMain: suggested.compose.main, composeMinio: suggested.compose.minio }).map(([key, value]) => [key, { value, exists: existsSync(value) }]),
      ),
      repos: suggested.repos.map((name) => ({ name, exists: existsSync(`${projectsRoot}/${name}`) })),
      containers,
      missingServices: known.size ? wanted.filter((name) => !known.has(name)) : [],
      suggested,
    };
  });
};

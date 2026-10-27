import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const serviceName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Nombre de servicio inválido');

export const configSchema = z.object({
  paths: z.object({
    projects: z.string().min(1),
    extra: z.string().min(1),
    daily: z.string().min(1),
  }),
  compose: z.object({
    main: z.string().min(1),
    minio: z.string().min(1),
  }),
  mongo: z.object({ container: serviceName }),
  startup: z.object({
    stage1: z.array(serviceName),
    stage2: z.array(serviceName),
    rabbitReady: z.object({
      container: serviceName,
      logMatch: z.string().min(1),
      timeoutSec: z.number().int().min(10).max(900),
    }),
    mandatory: z.array(serviceName),
    optional: z.array(serviceName),
    groups: z.record(serviceName, z.object({ withStage2: z.array(serviceName) })),
    presets: z.array(z.object({ name: z.string().min(1).max(40), services: z.array(serviceName) })),
  }),
  repos: z.array(serviceName),
});

export type DevPanelConfig = z.infer<typeof configSchema>;

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const paths = {
  root: rootDir,
  config: process.env['DEV_PANEL_CONFIG'] ?? join(rootDir, 'config.json'),
  data: process.env['DEV_PANEL_DATA'] ?? join(rootDir, 'data'),
  web: join(rootDir, 'web', 'dist'),
};

/** Valores de fábrica; las rutas se derivan de la carpeta que contiene todos los repos. */
export const defaultConfig = (projectsRoot: string): DevPanelConfig => ({
  paths: {
    projects: projectsRoot,
    extra: join(projectsRoot, '_EXTRA'),
    daily: join(projectsRoot, '_EXTRA', 'daily'),
  },
  compose: {
    main: join(projectsRoot, 'docker-compose.yml'),
    minio: join(projectsRoot, 'file-manager', 'docker.compose.minio.yml'),
  },
  mongo: { container: 'mongo-db' },
  startup: {
    stage1: ['minio', 'mc'], // nombres de servicio en file-manager/docker.compose.minio.yml (contenedores: minio y minio-mc)
    stage2: ['rabbitmq', 'mongo-e-sueldos'],
    rabbitReady: { container: 'rabbitmq', logMatch: 'completed with 3 plugins', timeoutSec: 180 },
    mandatory: ['new-panel', 'security', 'files', 'legajo'],
    optional: [
      'leia', 'firma', 'controlhorario', 'documentos', 'cursos', 'recibos', 'incidencia', 'notificaciones',
      'proyectos', 'liquidacion', 'recruiting', 'salud-laboral', 'help-center', 'reconocimientoapi',
    ],
    groups: { leia: { withStage2: ['leia-qdrant', 'leia-redis'] } },
    presets: [
      { name: 'Solo obligatorios', services: [] },
      { name: 'Leia', services: ['leia'] },
    ],
  },
  repos: ['documentos', 'file-manager', 'firma', 'legajo', 'front', 'security'],
});

export type ConfigState = { configured: true; config: DevPanelConfig } | { configured: false; reason: string };

export const loadConfig = (file: string = paths.config): ConfigState => {
  if (!existsSync(file)) return { configured: false, reason: 'No existe config.json' };
  try {
    const parsed = configSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { configured: false, reason: `config.json inválido (${detail})` };
    }
    return { configured: true, config: parsed.data };
  } catch (error) {
    return { configured: false, reason: `No se pudo leer config.json (${(error as Error).message})` };
  }
};

/** Escritura atómica (archivo temporal + rename) con permisos restringidos. */
export const saveConfig = (config: DevPanelConfig, file: string = paths.config): void => {
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
};

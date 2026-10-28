import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const serviceName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Nombre de servicio inválido');

export const envProfileSchema = z.object({
  file: z.string().regex(/^[A-Za-z0-9._-]+$/).default('.env'),
  /** Contenedor a reiniciar para que tome el cambio (opcional). */
  container: serviceName.nullable().default(null),
  /** Líneas ("CLAVE", "CLAVE=valor" o "CLAVE!=valor") activas en el perfil MinIO local y comentadas en el remoto. */
  minio: z.array(z.string().min(1)),
  /** Líneas activas en el perfil remoto y comentadas en el local. */
  remote: z.array(z.string().min(1)).default([]),
});
export type EnvProfile = z.infer<typeof envProfileSchema>;

/** Bloque de MinIO local tal como aparece (comentado o no) en los .env del equipo. */
const MINIO_LINES = [
  'AWS_ACCESS_KEY_ID=minioadmin', 'AWS_SECRET_ACCESS_KEY=minioadmin', 'AWS_REGION=us-east-1', 'AWS_S3_BUCKET_NAME=esueldos-s3',
  'AWS_ENDPOINT=http://minio:9000', 'AWS_S3_PUBLIC_URL=http://localhost:9000', 'AWS_S3_FORCE_PATH_STYLE=true', 'USE_MINIO=true',
];
/** En `documentos` y `file-manager` el bloque remoto repite las claves con otros valores: "!=" las distingue sin guardar credenciales. */
const REMOTE_LINES = [
  'AWS_ACCESS_KEY_ID!=minioadmin', 'AWS_SECRET_ACCESS_KEY!=minioadmin', 'AWS_S3_BUCKET_NAME!=esueldos-s3',
  'AWS_S3_PUBLIC_URL!=http://localhost:9000', 'AWS_S3_FORCE_PATH_STYLE!=true', 'USE_MINIO=false',
];
const DEFAULT_ENV_PROFILES: Record<string, EnvProfile> = {
  // AWS_REGION vale lo mismo en ambos bloques: se deja fuera porque no cambia nada y aparece dos veces.
  'file-manager': { file: '.env', container: 'files', minio: MINIO_LINES.filter((line) => !line.startsWith('AWS_REGION')), remote: ['AWS_S3_PUBLIC_URL!=http://localhost:9000', 'AWS_S3_FORCE_PATH_STYLE!=true', 'USE_MINIO=false'] },
  firma: { file: '.env', container: 'firma', minio: MINIO_LINES, remote: [] },
  documentos: { file: '.env', container: 'documentos', minio: MINIO_LINES.filter((line) => !line.startsWith('AWS_REGION')), remote: REMOTE_LINES },
};
const DEFAULT_TEST_DATA = [
  { db: 'legajo', collection: 'legajodigitals', field: 'name' },
  { db: 'legajo', collection: 'tipolegajodigitals', field: 'name' },
  { db: 'documentos', collection: 'documentos', field: 'name' },
  { db: 'documentos', collection: 'carpetas', field: 'name' },
];
/** Repos cuyo servicio de compose se llama distinto. Los que no están acá se asumen con el mismo nombre. */
const DEFAULT_REPO_SERVICES = { 'control-horario': 'controlhorario', 'file-manager': 'files', panel: 'new-panel' } as Record<string, string>;
const DEFAULT_BACKUP_TYPES = ['incidencia', 'legajo', 'cursos', 'documentos', 'recibos', 'notificaciones', 'firma', 'control-horario', 'proyecto', 'e-panel', 'node-ts-boilerplate'];

export const configSchema = z.object({
  /** Nombre que se muestra debajo de "Dev Panel" en el menú; vacío = no se muestra nada. */
  userName: z.string().trim().max(60).default(''),
  paths: z.object({
    projects: z.string().min(1),
    extra: z.string().min(1),
    daily: z.string().min(1),
    /** Carpetas de la base de conocimiento que no son tickets (no aparecen en Pruebas, Planificación ni reportes). */
    /** Carpeta con los scripts (backup remoto, etc.). Vacío = `<projects>/zscripts`. */
    scripts: z.string().default(''),
    ignoreDirs: z.array(z.string().regex(/^[\w][\w .-]*$/)).default(['daily']),
  }),
  compose: z.object({
    main: z.string().min(1),
    minio: z.string().min(1),
  }),
  mongo: z.object({
    container: serviceName,
    /** Bases que el panel nunca toca. */
    deniedDbs: z.array(z.string()).default(['admin', 'config', 'local']),
    /** Usuario cuyo hash de contraseña se copia a otros mails (superadmin del entorno local). */
    superadmin: z.object({ email: z.string().min(3), db: z.string().min(1) }).default({ email: 'e-sueldos@gmail.com', db: 'node-ts-boilerplate' }),
  }),
  remoteBackup: z
    .object({
      /** Nombre del script (dentro de `paths.scripts`) con el que se hace el backup remoto. También acepta una ruta absoluta. */
      script: z.string().default('backup_improved4.sh'),
      types: z.array(z.string().regex(/^[A-Za-z0-9._-]+$/)).default(DEFAULT_BACKUP_TYPES),
    })
    .default({}),
  /** Qué servicio de compose levanta cada repo (para el botón "Levantar servicios" de los tickets). */
  repoServices: z.record(z.string(), serviceName).default(DEFAULT_REPO_SERVICES),
  /** Sesiones de prueba: el panel firma tokens con el JWT_SECRET de `security` para entrar como un usuario del entorno local. */
  session: z
    .object({
      enabled: z.boolean().default(true),
      /** Vacío = `<projects>/security/.env`. */
      securityEnv: z.string().default(''),
      jwtKey: z.string().default('JWT_SECRET'),
      db: z.string().default('node-ts-boilerplate'),
      frontUrl: z.string().url().default('http://localhost:4200'),
      accessTtlSec: z.number().int().min(60).max(86_400).default(3600),
      refreshTtlSec: z.number().int().min(60).max(7 * 86_400).default(86_400),
    })
    .default({}),
  /** Redmine (solo lectura): la API key se lee de la skill redmine-drive o de REDMINE_API_KEY; nunca se guarda acá. */
  redmine: z
    .object({
      enabled: z.boolean().default(true),
      /** Vacío = `~/.claude/skills/redmine-drive/config.json`. */
      configFile: z.string().default(''),
      /** Vacío = el `redmine_url` de ese archivo. */
      baseUrl: z.string().default(''),
      /** Estados que cuentan como "entregado": los SP de un ticket suman en la semana en que llegó por primera vez a alguno. */
      doneStatuses: z.array(z.string()).default(['Revisión', 'Testeado', 'Testing Consultoría', 'Testing Aprobado Consultoría', 'Terminado', 'Entregado']),
    })
    .default({}),
  /** Cuentas de Claude: carpetas de configuración (CLAUDE_CONFIG_DIR). El panel nunca lee sus credenciales. */
  claude: z
    .object({
      binary: z.string().regex(/^[A-Za-z0-9._/-]+$/).default('claude'),
      /**
       * Consulta el uso en vivo al servicio de Anthropic con el token de la cuenta (endpoint NO documentado; uso personal).
       * El token se lee solo en memoria; no se guarda, no se loguea ni llega al navegador. Apagalo si no lo querés.
       */
      liveUsage: z.boolean().default(true),
    })
    .default({}),
  /** Jornada de trabajo: el checklist diario cambia de color según cuánto pasó desde cada horario; "" = sin horario (no colorea). */
  workday: z
    .object({
      entry: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal('')).default(''),
      exit: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal('')).default(''),
      /** Enlace de marcación (solo http/https): se muestra como botón debajo del checklist. */
      punchUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value), 'Solo http o https').or(z.literal('')).default(''),
    })
    .default({}),
  /** Pasos que se tildan en cada tanda de pruebas, y tareas que se repiten todos los días. */
  checklists: z
    .object({
      test: z.array(z.string().min(1).max(60)).default(['Actualizar el ticket en Redmine', 'Subir los comentarios']),
      daily: z.array(z.string().min(1).max(60)).default(['Marcar entrada', 'Marcar salida', 'Cargar horas']),
    })
    .default({}),
  git: z.object({ baseBranch: z.string().regex(/^[A-Za-z0-9._/-]+$/).default('desarrollo') }).default({}),
  checks: z
    .object({
      /** Variable compartida entre servicios que debe existir y coincidir (se compara el hash, nunca se muestra). */
      sharedSecret: z.object({ key: z.string().default('INTERNAL_SERVICE_SECRET'), repos: z.array(z.string()).default(['panel', 'legajo', 'cursos', 'file-manager']) }).default({}),
      /** Carpeta (relativa a `projects`) con rootCA.pem y rootCA.key del servicio de firma. */
      firmaCaDir: z.string().default('firma/src/modules/certificados/CA'),
    })
    .default({}),
  /** Dónde buscar datos de prueba marcados con el prefijo "[<ticket>]" en el nombre. */
  testData: z.array(z.object({ db: z.string(), collection: z.string(), field: z.string() })).default(DEFAULT_TEST_DATA),
  /** Perfiles de .env: qué líneas se comentan/descomentan al pasar de MinIO local a remoto. */
  envProfiles: z.record(serviceName, envProfileSchema).default(DEFAULT_ENV_PROFILES),
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
    scripts: join(projectsRoot, 'zscripts'),
    ignoreDirs: ['daily'],
  },
  compose: {
    main: join(projectsRoot, 'docker-compose.yml'),
    minio: join(projectsRoot, 'file-manager', 'docker.compose.minio.yml'),
  },
  mongo: { container: 'mongo-db', deniedDbs: ['admin', 'config', 'local'], superadmin: { email: 'e-sueldos@gmail.com', db: 'node-ts-boilerplate' } },
  remoteBackup: { script: 'backup_improved4.sh', types: DEFAULT_BACKUP_TYPES },
  session: { enabled: true, securityEnv: '', jwtKey: 'JWT_SECRET', db: 'node-ts-boilerplate', frontUrl: 'http://localhost:4200', accessTtlSec: 3600, refreshTtlSec: 86_400 },
  redmine: { enabled: true, configFile: '', baseUrl: '', doneStatuses: ['Revisión', 'Testeado', 'Testing Consultoría', 'Testing Aprobado Consultoría', 'Terminado', 'Entregado'] },
  claude: { binary: 'claude', liveUsage: true },
  workday: { entry: '', exit: '', punchUrl: '' },
  userName: '',
  repoServices: DEFAULT_REPO_SERVICES,
  checklists: { test: ['Actualizar el ticket en Redmine', 'Subir los comentarios'], daily: ['Marcar entrada', 'Marcar salida', 'Cargar horas'] },
  git: { baseBranch: 'desarrollo' },
  checks: { sharedSecret: { key: 'INTERNAL_SERVICE_SECRET', repos: ['panel', 'legajo', 'cursos', 'file-manager'] }, firmaCaDir: 'firma/src/modules/certificados/CA' },
  testData: DEFAULT_TEST_DATA,
  envProfiles: DEFAULT_ENV_PROFILES,
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

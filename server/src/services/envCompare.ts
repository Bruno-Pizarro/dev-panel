import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';

/**
 * Compara el `.env` de cada repo con su `.env.example`: qué variables faltan (están en el ejemplo y no en el `.env`) y cuáles sobran.
 * Si el repo no tiene ejemplo pero declara sus variables con Joi en `src/config/config.ts` (los servicios Node del equipo), se compara
 * contra ese esquema: las que son obligatorias y no están rompen el arranque; las que tienen valor por defecto solo se avisan (el
 * servicio anda con el valor por defecto, que puede no ser el de este entorno).
 * Solo se leen y devuelven NOMBRES de variables: los valores no salen nunca de este módulo.
 */
export interface EnvComparison {
  repo: string;
  /** Hay `.env` y con qué comparar (un `.env.example` o el esquema Joi de `src/config/config.ts`). */
  comparable: boolean;
  /** De dónde salen las variables esperadas. */
  source: 'example' | 'schema' | null;
  exampleFile: string | null;
  /** Variables del ejemplo que el `.env` no tiene (ni activas ni comentadas). */
  missing: string[];
  /** Variables que el `.env` tiene y el ejemplo no menciona. */
  extra: string[];
  /** Variables del ejemplo que están en el `.env` pero comentadas (no se aplican). */
  commented: string[];
  /** Solo con esquema: variables opcionales que el `.env` no define (el servicio usa su valor por defecto). */
  usesDefault: string[];
}

const EXAMPLES = ['.env.example', '.env.sample', '.env.template'];
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Nombres de las variables de un archivo .env: las activas y, por separado, las que figuran comentadas (`# NOMBRE=valor`). */
export const parseEnvNames = (content: string): { active: Set<string>; commented: Set<string> } => {
  const active = new Set<string>();
  const commented = new Set<string>();
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const commentedMatch = /^#+\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (line.startsWith('#')) {
      // Un "# NOMBRE=valor" es una variable comentada; un comentario común ("# Redis") no.
      if (commentedMatch && NAME.test(commentedMatch[1]!)) commented.add(commentedMatch[1]!);
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match) active.add(match[1]!);
  }
  return { active, commented };
};

export const compareEnv = (envContent: string, exampleContent: string): Pick<EnvComparison, 'missing' | 'extra' | 'commented'> => {
  const env = parseEnvNames(envContent);
  const example = parseEnvNames(exampleContent);
  // Del ejemplo se toman las activas y las comentadas: una variable que el ejemplo ofrece comentada es opcional.
  const wanted = [...example.active].sort();
  const optional = new Set(example.commented);
  const present = new Set([...env.active, ...env.commented]);
  return {
    missing: wanted.filter((name) => !present.has(name)),
    commented: wanted.filter((name) => env.commented.has(name) && !env.active.has(name)),
    extra: [...env.active].filter((name) => !example.active.has(name) && !optional.has(name)).sort(),
  };
};

export interface SchemaVariable {
  name: string;
  /** Obligatoria: sin valor por defecto y marcada `.required()`. */
  required: boolean;
}

/** Las variables que declara el esquema Joi de un `config.ts` (`NOMBRE: Joi.…`), con si son obligatorias o tienen valor por defecto. */
export const parseJoiSchema = (content: string): SchemaVariable[] => {
  const variables: SchemaVariable[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*([A-Z][A-Z0-9_]+):\s*Joi\./.exec(lines[index]!);
    if (!match) continue;
    // La declaración sigue hasta la línea que la cierra con coma (puede ocupar varias líneas).
    let statement = lines[index]!;
    let next = index;
    while (!/,\s*$/.test(statement.trimEnd()) && next + 1 < lines.length && !/^\s*[A-Z][A-Z0-9_]+:\s*Joi\./.test(lines[next + 1]!)) {
      next += 1;
      statement += lines[next];
    }
    variables.push({ name: match[1]!, required: /\.required\(\)/.test(statement) && !/\.default\(/.test(statement) });
  }
  return variables;
};

/** Variables que pone el entorno de ejecución (npm scripts, docker compose), no el `.env`: no se piden ahí. */
export const RUNTIME_VARIABLES = new Set(['NODE_ENV']);

export const compareWithSchema = (envContent: string, schemaAll: SchemaVariable[]): Pick<EnvComparison, 'missing' | 'usesDefault' | 'commented' | 'extra'> => {
  const schema = schemaAll.filter((variable) => !RUNTIME_VARIABLES.has(variable.name));
  const env = parseEnvNames(envContent);
  const declared = new Set(schema.map((variable) => variable.name));
  const defined = new Set([...env.active]);
  return {
    missing: schema.filter((variable) => variable.required && !defined.has(variable.name)).map((variable) => variable.name).sort(),
    usesDefault: schema.filter((variable) => !variable.required && !defined.has(variable.name) && !env.commented.has(variable.name)).map((variable) => variable.name).sort(),
    commented: schema.filter((variable) => env.commented.has(variable.name) && !defined.has(variable.name)).map((variable) => variable.name).sort(),
    extra: [...env.active].filter((name) => !declared.has(name) && !RUNTIME_VARIABLES.has(name)).sort(),
  };
};

const SCHEMA_FILES = ['src/config/config.ts'];

export const compareRepoEnv = (config: DevPanelConfig, repo: string): EnvComparison => {
  const dir = join(config.paths.projects, repo);
  const envPath = join(dir, config.envProfiles[repo]?.file ?? '.env');
  const exampleFile = EXAMPLES.find((name) => existsSync(join(dir, name))) ?? null;
  const schemaFile = SCHEMA_FILES.find((name) => existsSync(join(dir, name)));
  const none = (source: EnvComparison['source']): EnvComparison => ({ repo, comparable: false, source, exampleFile, missing: [], extra: [], commented: [], usesDefault: [] });
  if (!existsSync(envPath)) return none(null);
  try {
    if (exampleFile) return { repo, comparable: true, source: 'example', exampleFile, usesDefault: [], ...compareEnv(readFileSync(envPath, 'utf8'), readFileSync(join(dir, exampleFile), 'utf8')) };
    if (schemaFile) {
      const schema = parseJoiSchema(readFileSync(join(dir, schemaFile), 'utf8'));
      if (schema.length > 0) return { repo, comparable: true, source: 'schema', exampleFile: schemaFile, ...compareWithSchema(readFileSync(envPath, 'utf8'), schema) };
    }
    return none(null);
  } catch {
    return none(null);
  }
};

export const compareAllEnvs = (config: DevPanelConfig): EnvComparison[] => config.repos.map((repo) => compareRepoEnv(config, repo));

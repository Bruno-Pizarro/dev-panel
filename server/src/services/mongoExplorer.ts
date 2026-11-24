import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { MongoClient, MongoError, assertDb, assertName } from './mongo.js';

/**
 * Explorador de solo lectura del Mongo local. Las consultas van por `mongoexport`: el filtro, el orden y los campos viajan como JSON
 * (argumentos literales de `execFile`, sin shell), nunca como código que corra en la shell de mongo. Nada de acá escribe en la base.
 */
export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 25;
export const MAX_SKIP = 100_000;
export const MAX_FILTER_CHARS = 5_000;
export const SCHEMA_SAMPLE = 200;
const MASK = '••••••';
const TIMEOUT_MS = 30_000;

/** Operadores que ejecutarían JavaScript en el servidor de mongo: se rechazan en cualquier parte del filtro. */
const FORBIDDEN_OPERATORS = new Set(['$where', '$function', '$accumulator']);
const FIELD_PATH = /^[A-Za-z0-9_.$-]{1,100}$/;
/** Nombres de campo cuyo valor no se muestra: credenciales, tokens y secretos. */
const SECRET_KEY = /(passw(or)?d|^pwd$|token|secret|api[-_]?key|private[-_]?key|authorization|^hash$|^salt$|^refresh)/i;

export const isSecretKey = (key: string): boolean => SECRET_KEY.test(key);

/** Tapa el valor de los campos secretos, a cualquier profundidad. No modifica el original. */
export const maskSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, isSecretKey(key) && inner !== null && inner !== undefined ? MASK : maskSecrets(inner)]));
  }
  return value;
};

const findForbidden = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbidden(item);
      if (found) return found;
    }
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_OPERATORS.has(key)) return key;
      const found = findForbidden(inner);
      if (found) return found;
    }
  }
  return null;
};

/** El filtro: un objeto JSON (JSON extendido estricto, ej. {"_id":{"$oid":"…"}}) sin operadores que ejecuten código. */
export const parseFilter = (text: string | undefined): Record<string, unknown> | null => {
  const raw = (text ?? '').trim();
  if (!raw) return null;
  if (raw.length > MAX_FILTER_CHARS) throw new MongoError('El filtro es demasiado largo');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MongoError('El filtro no es un JSON válido. Usá comillas dobles, por ejemplo {"nroLegajo": 1106733}');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new MongoError('El filtro tiene que ser un objeto, por ejemplo {"campo": "valor"}');
  const forbidden = findForbidden(parsed);
  if (forbidden) throw new MongoError(`El operador ${forbidden} no está permitido: ejecuta código en la base`);
  return Object.keys(parsed as object).length === 0 ? null : (parsed as Record<string, unknown>);
};

export const parseSort = (text: string | undefined): Record<string, 1 | -1> | null => {
  const raw = (text ?? '').trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MongoError('El orden no es un JSON válido, por ejemplo {"createdAt": -1}');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new MongoError('El orden tiene que ser un objeto, por ejemplo {"createdAt": -1}');
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return null;
  if (entries.length > 5) throw new MongoError('Como máximo 5 campos de orden');
  for (const [key, direction] of entries) {
    if (!FIELD_PATH.test(key)) throw new MongoError(`Campo de orden inválido: ${key}`);
    if (direction !== 1 && direction !== -1) throw new MongoError('El orden de cada campo es 1 (ascendente) o -1 (descendente)');
  }
  return parsed as Record<string, 1 | -1>;
};

export const parseFields = (text: string | undefined): string[] => {
  const fields = (text ?? '').split(',').map((field) => field.trim()).filter(Boolean);
  if (fields.length > 50) throw new MongoError('Como máximo 50 campos');
  for (const field of fields) if (!FIELD_PATH.test(field)) throw new MongoError(`Campo inválido: ${field}`);
  return fields;
};

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export interface DocumentsQuery {
  db: string;
  collection: string;
  filter?: string | undefined;
  sort?: string | undefined;
  fields?: string | undefined;
  limit?: number | string | undefined;
  skip?: number | string | undefined;
}

export interface DocumentsPage {
  documents: unknown[];
  limit: number;
  skip: number;
  /** Hay más resultados después de esta página (no se calcula el total del filtro: sería recorrer todo). */
  hasMore: boolean;
  /** Total de documentos de la colección, sin filtro. */
  total: number;
  /** Los campos secretos vienen tapados. */
  masked: true;
}

export class MongoExplorer {
  private readonly mongo: MongoClient;

  constructor(private readonly config: DevPanelConfig, private readonly runner: Runner = run) {
    this.mongo = new MongoClient(config, runner);
  }

  private target(db: unknown, collection: unknown): { db: string; collection: string } {
    return { db: assertDb(this.config, db), collection: assertName(collection, 'Colección') };
  }

  private async exportLines(db: string, collection: string, extra: string[]): Promise<unknown[]> {
    const args = ['exec', this.config.mongo.container, 'mongoexport', '--quiet', '--db', db, '--collection', collection, '--jsonFormat', 'canonical', ...extra];
    const result = await this.runner('docker', args, TIMEOUT_MS);
    if (!result.ok) throw new MongoError(result.stderr || 'No se pudo consultar la colección', 500);
    return result.stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          throw new MongoError('La respuesta de mongo no es un JSON válido', 500);
        }
      });
  }

  async documents(query: DocumentsQuery): Promise<DocumentsPage> {
    const { db, collection } = this.target(query.db, query.collection);
    const filter = parseFilter(query.filter);
    const sort = parseSort(query.sort);
    const fields = parseFields(query.fields);
    const limit = clampInt(query.limit, 1, MAX_LIMIT, DEFAULT_LIMIT);
    const skip = clampInt(query.skip, 0, MAX_SKIP, 0);
    const extra = ['--limit', String(limit + 1), '--skip', String(skip)];
    if (filter) extra.push('--query', JSON.stringify(filter));
    if (sort) extra.push('--sort', JSON.stringify(sort));
    if (fields.length > 0) extra.push('--fields', fields.join(','));
    const lines = await this.exportLines(db, collection, extra);
    const total = await this.mongo.count(db, collection);
    return { documents: lines.slice(0, limit).map(maskSecrets), limit, skip, hasMore: lines.length > limit, total, masked: true };
  }

  async indexes(db: unknown, collection: unknown): Promise<{ indexes: unknown[]; stats: { count: number; size: number; storageSize: number; avgObjSize: number } }> {
    const target = this.target(db, collection);
    const name = JSON.stringify(target.collection);
    const out = await this.mongo.evalJs(target.db, `var c=db.getCollection(${name});var s=c.stats();print(JSON.stringify({indexes:c.getIndexes(),stats:{count:s.count||0,size:s.size||0,storageSize:s.storageSize||0,avgObjSize:s.avgObjSize||0}}))`);
    try {
      return JSON.parse(out) as { indexes: unknown[]; stats: { count: number; size: number; storageSize: number; avgObjSize: number } };
    } catch {
      throw new MongoError('No se pudieron leer los índices', 500);
    }
  }

  async schema(db: unknown, collection: unknown): Promise<SchemaSummary> {
    const target = this.target(db, collection);
    const lines = await this.exportLines(target.db, target.collection, ['--limit', String(SCHEMA_SAMPLE)]);
    return summarizeSchema(lines);
  }
}

// ---------------------------------------------------------------- esquema

export interface SchemaField {
  path: string;
  /** Tipo → cuántos documentos de la muestra lo tienen. */
  types: Record<string, number>;
  /** En cuántos documentos de la muestra aparece. */
  presence: number;
}

export interface SchemaSummary {
  sampled: number;
  fields: SchemaField[];
  truncated: boolean;
}

const MAX_SCHEMA_FIELDS = 300;
const MAX_DEPTH = 4;

/** Tipo de un valor en JSON extendido canónico: {"$oid":…} es ObjectId, {"$date":…} es Date, {"$numberLong":…} es long… */
export const typeOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    if (keys.length === 1) {
      const key = keys[0]!;
      const known: Record<string, string> = { $oid: 'ObjectId', $date: 'Date', $numberLong: 'long', $numberInt: 'int', $numberDouble: 'double', $numberDecimal: 'decimal', $binary: 'binary', $regularExpression: 'regex', $timestamp: 'timestamp' };
      if (known[key]) return known[key]!;
    }
    return 'object';
  }
  return typeof value;
};

export const summarizeSchema = (documents: unknown[]): SchemaSummary => {
  const fields = new Map<string, SchemaField>();
  let truncated = false;
  const note = (path: string, type: string, seen: Set<string>) => {
    let field = fields.get(path);
    if (!field) {
      if (fields.size >= MAX_SCHEMA_FIELDS) {
        truncated = true;
        return;
      }
      field = { path, types: {}, presence: 0 };
      fields.set(path, field);
    }
    field.types[type] = (field.types[type] ?? 0) + 1;
    if (!seen.has(path)) {
      seen.add(path);
      field.presence += 1;
    }
  };
  const walk = (value: unknown, path: string, depth: number, seen: Set<string>) => {
    const type = typeOf(value);
    if (path) note(path, type, seen);
    if (depth >= MAX_DEPTH) return;
    if (type === 'object') for (const [key, inner] of Object.entries(value as Record<string, unknown>)) walk(inner, path ? `${path}.${key}` : key, depth + 1, seen);
    else if (type === 'array') for (const inner of value as unknown[]) walk(inner, `${path}[]`, depth + 1, seen);
  };
  for (const document of documents) walk(document, '', 0, new Set<string>());
  const sorted = [...fields.values()].sort((a, b) => b.presence - a.presence || a.path.localeCompare(b.path));
  return { sampled: documents.length, fields: sorted, truncated };
};

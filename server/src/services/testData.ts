import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { paths } from '../config.js';
import { run, type Runner } from '../docker.js';
import { MongoClient, MongoError, assertDb, assertName } from './mongo.js';

export const assertTicket = (ticket: unknown): string => {
  if (typeof ticket !== 'string' || !/^\d{3,6}$/.test(ticket)) throw new MongoError('Número de ticket inválido');
  return ticket;
};

export interface TestDataRow {
  db: string;
  collection: string;
  field: string;
  count: number;
}

const prefix = (ticket: string) => `^\\[${ticket}\\]`;
const jsFilter = (field: string, ticket: string) => `{${JSON.stringify(field)}:new RegExp(${JSON.stringify(prefix(ticket))})}`;

/** Cuántos documentos marcados con "[ticket]" hay en cada colección configurada. */
export const listTestData = async (config: DevPanelConfig, ticket: string, runner: Runner = run): Promise<TestDataRow[]> => {
  assertTicket(ticket);
  const client = new MongoClient(config, runner);
  const rows: TestDataRow[] = [];
  for (const entry of config.testData) {
    const db = assertDb(config, entry.db);
    const collection = assertName(entry.collection, 'Colección');
    const count = Number(await client.evalJs(db, `print(db.getCollection(${JSON.stringify(collection)}).count(${jsFilter(entry.field, ticket)}))`));
    rows.push({ db, collection, field: entry.field, count });
  }
  return rows;
};

/**
 * Limpieza: primero exporta lo que va a borrar (mongoexport, un archivo por colección), después borra y verifica que no
 * quede nada. No incluye archivos subidos (uploads de firma, S3).
 */
export const cleanTestData = async (config: DevPanelConfig, ticket: string, log: (line: string) => void, runner: Runner = run): Promise<void> => {
  assertTicket(ticket);
  const client = new MongoClient(config, runner);
  const rows = (await listTestData(config, ticket, runner)).filter((row) => row.count > 0);
  if (!rows.length) {
    log(`No hay datos marcados con [${ticket}].`);
    return;
  }
  const dir = join(paths.data, 'testdata-backups', `${ticket}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(dir, { recursive: true });
  for (const row of rows) {
    const query = JSON.stringify({ [row.field]: { $regex: prefix(ticket) } });
    const exported = await runner('docker', ['exec', config.mongo.container, 'mongoexport', '--db', row.db, '--collection', row.collection, '--query', query, '--quiet'], 60_000);
    if (!exported.ok) throw new MongoError(`No se pudo exportar ${row.db}.${row.collection}: ${exported.stderr}`, 500);
    const lines = exported.stdout.split('\n').filter(Boolean).length;
    if (lines !== row.count) throw new MongoError(`El respaldo de ${row.db}.${row.collection} tiene ${lines} documentos y se esperaban ${row.count}: no se borra nada`, 500);
    writeFileSync(join(dir, `${row.db}.${row.collection}.jsonl`), `${exported.stdout}\n`);
    log(`✓ Respaldo ${row.db}.${row.collection}: ${lines} documentos`);
  }
  for (const row of rows) {
    const deleted = await client.evalJs(row.db, `print(db.getCollection(${JSON.stringify(row.collection)}).deleteMany(${jsFilter(row.field, ticket)}).deletedCount)`);
    const left = Number(await client.evalJs(row.db, `print(db.getCollection(${JSON.stringify(row.collection)}).count(${jsFilter(row.field, ticket)}))`));
    if (left !== 0) throw new MongoError(`Quedaron ${left} documentos en ${row.db}.${row.collection}`, 500);
    log(`✓ ${row.db}.${row.collection}: ${deleted} borrados, 0 restantes`);
  }
  log(`Listo. Respaldo de lo borrado en ${dir}. Los archivos subidos (PDF en uploads/S3) no se tocan.`);
};

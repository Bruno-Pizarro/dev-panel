import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { paths } from '../config.js';
import { run, type Runner } from '../docker.js';

export const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
export const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export class MongoError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const assertName = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !SAFE_NAME.test(value)) throw new MongoError(`${label} inválido`);
  return value;
};

export const assertDb = (config: DevPanelConfig, db: unknown): string => {
  const name = assertName(db, 'Base');
  if (config.mongo.deniedDbs.includes(name)) throw new MongoError(`La base ${name} no se puede tocar`, 403);
  return name;
};

export interface Collection {
  name: string;
  count: number;
}

/** Acceso al Mongo local por `docker exec`: solo el contenedor configurado, nunca un host remoto. */
export class MongoClient {
  constructor(private readonly config: DevPanelConfig, private readonly runner: Runner = run) {}

  private async evalJs(db: string, js: string): Promise<string> {
    const result = await this.runner('docker', ['exec', this.config.mongo.container, 'mongo', '--quiet', db, '--eval', js], 60_000);
    if (!result.ok) throw new MongoError(result.stderr || 'Error ejecutando mongo', 500);
    return result.stdout.trim();
  }

  async listDatabases(): Promise<string[]> {
    const out = await this.evalJs('admin', 'print(JSON.stringify(db.getMongo().getDBNames()))');
    return (JSON.parse(out) as string[]).filter((name) => !this.config.mongo.deniedDbs.includes(name)).sort();
  }

  async listCollections(): Promise<Record<string, Collection[]>> {
    const result: Record<string, Collection[]> = {};
    for (const db of await this.listDatabases()) {
      const out = await this.evalJs(db, 'var r=[];db.getCollectionNames().forEach(function(c){r.push({name:c,count:db.getCollection(c).count({})})});print(JSON.stringify(r))');
      result[db] = (JSON.parse(out) as Collection[]).sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }

  async count(db: string, collection: string): Promise<number> {
    return Number(await this.evalJs(db, `print(db.getCollection(${JSON.stringify(collection)}).count({}))`));
  }

  // ---- Contraseña: copia el hash del superadmin local a un mail, en todas las bases donde existe ----
  private async superadminHash(): Promise<string> {
    const { email, db } = this.config.mongo.superadmin;
    const hash = await this.evalJs(db, `var u=db.users.findOne({email:${JSON.stringify(email)}},{password:1,_id:0});print(u&&u.password?u.password:"")`);
    if (!BCRYPT.test(hash)) throw new MongoError(`No se encontró un hash válido del superadmin (${email}) en ${db}`, 500);
    return hash;
  }

  async passwordPreview(email: string): Promise<Array<{ db: string; usersInDb: number; matches: number }>> {
    if (!EMAIL.test(email)) throw new MongoError('Mail inválido');
    const rows: Array<{ db: string; usersInDb: number; matches: number }> = [];
    for (const db of await this.listDatabases()) {
      const total = Number(await this.evalJs(db, 'print(db.getCollectionNames().indexOf("users")>=0?db.users.count({}):-1)'));
      if (total < 0) continue;
      rows.push({ db, usersInDb: total, matches: Number(await this.evalJs(db, `print(db.users.count({email:${JSON.stringify(email)}}))`)) });
    }
    return rows;
  }

  async resetPassword(email: string, log: (line: string) => void): Promise<void> {
    const hash = await this.superadminHash();
    const preview = await this.passwordPreview(email);
    const targets = preview.filter((row) => row.matches > 0);
    if (!targets.length) throw new MongoError(`No hay ningún usuario con el mail ${email} en ninguna base (${preview.length} revisadas)`, 404);
    log(`Usuario ${email} encontrado en ${targets.length} de ${preview.length} bases con colección users.`);
    for (const target of targets) {
      const out = await this.evalJs(target.db, `var r=db.users.updateMany({email:${JSON.stringify(email)}},{$set:{password:${JSON.stringify(hash)}}});print("encontrados="+r.matchedCount+" modificados="+r.modifiedCount)`);
      log(`✓ ${target.db}: ${out}`);
    }
    const skipped = preview.filter((row) => row.matches === 0).map((row) => row.db);
    if (skipped.length) log(`Sin ese mail (no se tocan): ${skipped.join(', ')}`);
    log(`Listo: ${email} ahora tiene la contraseña del superadmin local (${this.config.mongo.superadmin.email}).`);
  }
}

// ---- Snapshots (mongodump/mongorestore por colección, con verificación de conteo) ----
export interface SnapshotItem {
  db: string;
  collection: string;
  count: number;
  file: string;
  size: number;
}
export interface Snapshot {
  id: string;
  label: string;
  createdAt: string;
  items: SnapshotItem[];
}

const snapshotsDir = () => join(paths.data, 'snapshots');
const snapshotDir = (id: string) => join(snapshotsDir(), assertName(id, 'Snapshot'));

export const listSnapshots = (): Snapshot[] => {
  if (!existsSync(snapshotsDir())) return [];
  return readdirSync(snapshotsDir())
    .flatMap((id) => {
      try {
        return [{ id, ...(JSON.parse(readFileSync(join(snapshotsDir(), id, 'manifest.json'), 'utf8')) as Omit<Snapshot, 'id'>) }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const deleteSnapshot = (id: string): void => rmSync(snapshotDir(id), { recursive: true, force: true });

const pipeDump = (container: string, db: string, collection: string, file: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', container, 'mongodump', '--archive', '--gzip', '--quiet', '--db', db, '--collection', collection]);
    let err = '';
    child.stderr.on('data', (chunk) => (err += String(chunk)));
    child.stdout.pipe(createWriteStream(file));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `mongodump salió con código ${code}`))));
  });

const pipeRestore = (container: string, db: string, collection: string, file: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'mongorestore', '--archive', '--gzip', '--drop', '--quiet', '--nsInclude', `${db}.${collection}`]);
    let err = '';
    child.stderr.on('data', (chunk) => (err += String(chunk)));
    createReadStream(file).pipe(child.stdin);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `mongorestore salió con código ${code}`))));
  });

export const createSnapshot = async (config: DevPanelConfig, items: Array<{ db: string; collection: string }>, label: string, log: (line: string) => void): Promise<void> => {
  const client = new MongoClient(config);
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = snapshotDir(id);
  mkdirSync(dir, { recursive: true });
  const done: SnapshotItem[] = [];
  for (const item of items) {
    const db = assertDb(config, item.db);
    const collection = assertName(item.collection, 'Colección');
    const file = `${db}.${collection}.archive.gz`;
    log(`Respaldando ${db}.${collection}…`);
    const count = await client.count(db, collection);
    await pipeDump(config.mongo.container, db, collection, join(dir, file));
    const size = statSync(join(dir, file)).size;
    done.push({ db, collection, count, file, size });
    log(`✓ ${db}.${collection}: ${count} documentos, ${(size / 1024).toFixed(1)} KB`);
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ label, createdAt: new Date().toISOString(), items: done }, null, 2));
  log(`Snapshot guardado: ${id}`);
};

export const restoreSnapshot = async (config: DevPanelConfig, id: string, only: Array<{ db: string; collection: string }> | undefined, log: (line: string) => void): Promise<void> => {
  const client = new MongoClient(config);
  const dir = snapshotDir(id);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Omit<Snapshot, 'id'>;
  const items = manifest.items.filter((item) => !only || only.some((wanted) => wanted.db === item.db && wanted.collection === item.collection));
  if (!items.length) throw new MongoError('Nada para restaurar');
  for (const item of items) {
    assertDb(config, item.db);
    assertName(item.collection, 'Colección');
    log(`Restaurando ${item.db}.${item.collection} (reemplaza lo que hay ahora)…`);
    await pipeRestore(config.mongo.container, item.db, item.collection, join(dir, item.file));
    const now = await client.count(item.db, item.collection);
    if (now !== item.count) throw new MongoError(`El conteo no coincide en ${item.db}.${item.collection}: hay ${now}, el snapshot tenía ${item.count}`, 500);
    log(`✓ ${item.db}.${item.collection}: ${now} documentos (coincide con el snapshot)`);
  }
  log('Restauración completa.');
};

// ---- Backup remoto: envuelve el script existente ----
export const runRemoteBackup = (config: DevPanelConfig, options: { types: string[]; restore: boolean; dryRun: boolean }, log: (line: string) => void): Promise<void> =>
  new Promise((resolve, reject) => {
    const script = config.remoteBackup.script || join(config.paths.projects, 'zscripts', 'backup_improved4.sh');
    if (!existsSync(script)) return reject(new Error(`No existe el script: ${script}`));
    const types = options.types.filter((type) => config.remoteBackup.types.includes(type) || type === 'all');
    if (!types.length) return reject(new Error('Elegí al menos un tipo de backup'));
    const args = [script, '--type', types.join(',')];
    if (options.restore) args.push('--restore', '--container', config.mongo.container);
    if (options.dryRun) args.push('--dry-run');
    log(`$ bash ${script.split('/').pop()} ${args.slice(1).join(' ')}`);
    const child = spawn('bash', args, { cwd: join(script, '..') });
    const onData = (chunk: Buffer) => String(chunk).split('\n').filter(Boolean).forEach(log);
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`El script terminó con código ${code}`))));
  });

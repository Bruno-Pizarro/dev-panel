import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import type { CommandResult } from '../docker.js';
import { MongoError } from './mongo.js';
import { MongoExplorer, isSecretKey, maskSecrets, parseFields, parseFilter, parseSort, summarizeSchema, typeOf } from './mongoExplorer.js';

const config = defaultConfig('/tmp/proyectos');
const ok = (stdout: string): CommandResult => ({ ok: true, stdout, stderr: '' });

/** Un docker simulado: mongoexport devuelve `lines`, y el conteo/índices de la shell devuelven `shell`. */
const fakeDocker = (lines: unknown[], shell = '3') => {
  const calls: string[][] = [];
  const runner = async (_file: string, args: string[]): Promise<CommandResult> => {
    calls.push(args);
    return args.includes('mongoexport') ? ok(lines.map((line) => JSON.stringify(line)).join('\n')) : ok(shell);
  };
  return { runner, calls };
};

describe('parseFilter', () => {
  it('acepta un objeto JSON y devuelve null si está vacío', () => {
    expect(parseFilter('{"nroLegajo": 1106733}')).toEqual({ nroLegajo: 1106733 });
    expect(parseFilter('')).toBeNull();
    expect(parseFilter('   ')).toBeNull();
    expect(parseFilter('{}')).toBeNull();
  });
  it('rechaza lo que no es un objeto JSON, con un mensaje que explica cómo escribirlo', () => {
    expect(() => parseFilter('{nroLegajo: 1}')).toThrow(/JSON válido/);
    expect(() => parseFilter('[1,2]')).toThrow(/objeto/);
    expect(() => parseFilter('"texto"')).toThrow(/objeto/);
  });
  it('rechaza operadores que ejecutan JavaScript, en cualquier profundidad', () => {
    expect(() => parseFilter('{"$where":"sleep(10000)"}')).toThrow(/\$where/);
    expect(() => parseFilter('{"a":{"$and":[{"$where":"1"}]}}')).toThrow(/\$where/);
    expect(() => parseFilter('{"$expr":{"$function":{"body":"x","args":[],"lang":"js"}}}')).toThrow(/\$function/);
  });
  it('permite operadores normales', () => {
    expect(parseFilter('{"edad":{"$gt":18},"nombre":{"$regex":"^Ju"}}')).toEqual({ edad: { $gt: 18 }, nombre: { $regex: '^Ju' } });
  });
  it('rechaza un filtro enorme', () => {
    expect(() => parseFilter(`{"a":"${'x'.repeat(6000)}"}`)).toThrow(/largo/);
  });
});

describe('parseSort y parseFields', () => {
  it('orden válido y orden mal escrito', () => {
    expect(parseSort('{"createdAt":-1}')).toEqual({ createdAt: -1 });
    expect(parseSort('')).toBeNull();
    expect(() => parseSort('{"a":2}')).toThrow(/1 \(ascendente\)/);
    expect(() => parseSort('{"a b":1}')).toThrow(/inválido/);
    expect(() => parseSort('{"a":1,"b":1,"c":1,"d":1,"e":1,"f":1}')).toThrow(/5 campos/);
  });
  it('campos separados por coma', () => {
    expect(parseFields('nombre, edad ,')).toEqual(['nombre', 'edad']);
    expect(parseFields(undefined)).toEqual([]);
    expect(() => parseFields('a;b')).toThrow(/inválido/);
  });
});

describe('maskSecrets', () => {
  it('tapa contraseñas, tokens y secretos a cualquier profundidad, sin tocar el original', () => {
    const original = { email: 'a@b.com', password: '$2a$10$abc', datos: { accessToken: 'x', lista: [{ apiKey: 'k', ok: 1 }] }, passwordResetToken: null };
    const masked = maskSecrets(original) as typeof original;
    expect(masked.email).toBe('a@b.com');
    expect(masked.password).toBe('••••••');
    expect((masked.datos as { accessToken: string }).accessToken).toBe('••••••');
    expect((masked.datos as { lista: Array<{ apiKey: string; ok: number }> }).lista[0]).toEqual({ apiKey: '••••••', ok: 1 });
    expect(masked.passwordResetToken).toBeNull();
    expect(original.password).toBe('$2a$10$abc');
  });
  it('no tapa campos que solo se parecen', () => {
    expect(isSecretKey('hashtag')).toBe(false);
    expect(isSecretKey('tokenizer')).toBe(true);
    expect(isSecretKey('nroLegajo')).toBe(false);
    expect(isSecretKey('hash')).toBe(true);
  });
});

describe('MongoExplorer.documents', () => {
  it('arma mongoexport con filtro, orden, campos y página, y pide uno más para saber si hay otra página', async () => {
    const { runner, calls } = fakeDocker([{ a: 1 }, { a: 2 }, { a: 3 }], '40');
    const page = await new MongoExplorer(config, runner).documents({ db: 'legajo', collection: 'legajos', filter: '{"a":{"$gt":0}}', sort: '{"a":1}', fields: 'a,b', limit: 2, skip: 4 });
    expect(page.documents).toEqual([{ a: 1 }, { a: 2 }]);
    expect(page.hasMore).toBe(true);
    expect(page.total).toBe(40);
    expect(page).toMatchObject({ limit: 2, skip: 4, masked: true });
    const args = calls.find((call) => call.includes('mongoexport'))!;
    expect(args).toEqual(expect.arrayContaining(['--db', 'legajo', '--collection', 'legajos', '--limit', '3', '--skip', '4', '--query', '{"a":{"$gt":0}}', '--sort', '{"a":1}', '--fields', 'a,b', '--jsonFormat', 'canonical']));
  });
  it('sin más resultados, hasMore es falso', async () => {
    const { runner } = fakeDocker([{ a: 1 }]);
    expect((await new MongoExplorer(config, runner).documents({ db: 'legajo', collection: 'legajos', limit: 5 })).hasMore).toBe(false);
  });
  it('los valores secretos salen tapados', async () => {
    const { runner } = fakeDocker([{ email: 'x@y.com', password: '$2a$10$hash' }]);
    const page = await new MongoExplorer(config, runner).documents({ db: 'node-ts-boilerplate', collection: 'users' });
    expect(page.documents).toEqual([{ email: 'x@y.com', password: '••••••' }]);
  });
  it('acota el límite y el salto', async () => {
    const { runner, calls } = fakeDocker([]);
    await new MongoExplorer(config, runner).documents({ db: 'legajo', collection: 'legajos', limit: 99999, skip: 99999999 });
    const args = calls.find((call) => call.includes('mongoexport'))!;
    expect(args[args.indexOf('--limit') + 1]).toBe('201');
    expect(args[args.indexOf('--skip') + 1]).toBe('100000');
  });
  it('no deja consultar las bases prohibidas ni nombres raros, y no llega a ejecutar nada', async () => {
    const { runner, calls } = fakeDocker([]);
    const explorer = new MongoExplorer(config, runner);
    await expect(explorer.documents({ db: 'admin', collection: 'users' })).rejects.toThrow(MongoError);
    await expect(explorer.documents({ db: 'legajo', collection: 'a;drop' })).rejects.toThrow(/inválid/);
    await expect(explorer.documents({ db: 'legajo', collection: 'legajos', filter: '{"$where":"1"}' })).rejects.toThrow(/no está permitido/);
    expect(calls).toHaveLength(0);
  });
  it('si mongoexport falla, el error llega con su mensaje', async () => {
    const runner = async (): Promise<CommandResult> => ({ ok: false, stdout: '', stderr: 'bad query' });
    await expect(new MongoExplorer(config, runner).documents({ db: 'legajo', collection: 'legajos' })).rejects.toThrow('bad query');
  });
});

describe('MongoExplorer.databases y collections', () => {
  it('las bases se piden sin recorrer sus colecciones y sin las prohibidas', async () => {
    const { runner, calls } = fakeDocker([], JSON.stringify(['admin', 'legajo', 'liquidacion']));
    expect(await new MongoExplorer(config, runner).databases()).toEqual(['legajo', 'liquidacion']);
    expect(calls).toHaveLength(1);
  });
  it('las colecciones se piden de UNA base, ordenadas y sin las del sistema', async () => {
    const { runner, calls } = fakeDocker([], JSON.stringify([{ name: 'z', count: 1 }, { name: 'system.indexes', count: 0 }, { name: 'a', count: 7 }]));
    expect(await new MongoExplorer(config, runner).collections('legajo')).toEqual([{ name: 'a', count: 7 }, { name: 'z', count: 1 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('legajo');
  });
  it('no deja pedir las colecciones de una base prohibida ni de un nombre raro', async () => {
    const { runner, calls } = fakeDocker([]);
    await expect(new MongoExplorer(config, runner).collections('admin')).rejects.toThrow(MongoError);
    await expect(new MongoExplorer(config, runner).collections('a;b')).rejects.toThrow(/inválid/);
    expect(calls).toHaveLength(0);
  });
});

describe('MongoExplorer.indexes', () => {
  it('devuelve los índices y las estadísticas', async () => {
    const shell = JSON.stringify({ indexes: [{ name: '_id_', key: { _id: 1 } }], stats: { count: 5, size: 100, storageSize: 4096, avgObjSize: 20 } });
    const { runner, calls } = fakeDocker([], shell);
    const res = await new MongoExplorer(config, runner).indexes('legajo', 'legajos');
    expect(res.indexes).toHaveLength(1);
    expect(res.stats.count).toBe(5);
    expect(calls[0]!.join(' ')).toContain('db.getCollection("legajos")');
  });
  it('un nombre de colección con comillas no llega a la shell', async () => {
    const { runner, calls } = fakeDocker([]);
    await expect(new MongoExplorer(config, runner).indexes('legajo', 'x");db.dropDatabase();("')).rejects.toThrow(/inválid/);
    expect(calls).toHaveLength(0);
  });
});

describe('esquema', () => {
  it('reconoce los tipos del JSON extendido', () => {
    expect(typeOf({ $oid: 'abc' })).toBe('ObjectId');
    expect(typeOf({ $date: '2026-01-01' })).toBe('Date');
    expect(typeOf({ $numberLong: '5' })).toBe('long');
    expect(typeOf({ a: 1 })).toBe('object');
    expect(typeOf([1])).toBe('array');
    expect(typeOf(null)).toBe('null');
  });
  it('resume campos, tipos y presencia, también en objetos y arrays anidados', () => {
    const summary = summarizeSchema([
      { _id: { $oid: '1' }, nombre: 'a', datos: { edad: 3 }, tags: ['x', 'y'] },
      { _id: { $oid: '2' }, nombre: null, datos: { edad: { $numberInt: '4' } } },
    ]);
    const field = (path: string) => summary.fields.find((item) => item.path === path)!;
    expect(summary.sampled).toBe(2);
    expect(field('nombre')).toMatchObject({ presence: 2, types: { string: 1, null: 1 } });
    expect(field('datos.edad').types).toEqual({ number: 1, int: 1 });
    expect(field('tags')).toMatchObject({ presence: 1, types: { array: 1 } });
    expect(field('tags[]')).toMatchObject({ presence: 1, types: { string: 2 } });
    expect(summary.fields[0]!.presence).toBe(2);
  });
  it('acota la cantidad de campos', () => {
    const doc = Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`c${index}`, 1]));
    const summary = summarizeSchema([doc]);
    expect(summary.fields).toHaveLength(300);
    expect(summary.truncated).toBe(true);
  });
});

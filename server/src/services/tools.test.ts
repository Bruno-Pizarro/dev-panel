import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig, paths } from '../config.js';
import type { CommandResult, Runner } from '../docker.js';
import { compareSharedSecret } from './checks.js';
import { parseAheadBehind, parsePorcelain } from './gitRepos.js';
import { MongoClient } from './mongo.js';
import { SessionService, escapeRegex, readEnvValue, signJwt } from './session.js';
import { assertTicket, cleanTestData, listTestData } from './testData.js';

const config = defaultConfig('/work');
const ok = (stdout = ''): CommandResult => ({ ok: true, stdout, stderr: '' });

describe('signJwt', () => {
  it('produce un HS256 válido con el payload indicado', () => {
    const token = signJwt({ sub: 'abc', type: 'access', exp: 99 }, 'secreto');
    const [header, payload, signature] = token.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({ sub: 'abc', type: 'access', exp: 99 });
    expect(signature).toBe(createHmac('sha256', 'secreto').update(`${header}.${payload}`).digest('base64url'));
  });
});

describe('SessionService', () => {
  const secretFile = join(mkdtempSync(join(tmpdir(), 'dp-sec-')), '.env');
  writeFileSync(secretFile, 'PORT=1\nJWT_SECRET="mi-secreto-de-prueba"\n');
  const sessionConfig = { ...config, session: { ...config.session, securityEnv: secretFile } };
  const USER = '643d53cfd69035dc3eb58b0d';

  const fakeMongo = (answers: string[]) => {
    const scripts: string[] = [];
    const mongo = { evalJs: async (_db: string, js: string) => (scripts.push(js), answers.shift() ?? '') } as unknown as MongoClient;
    return { mongo, scripts };
  };

  it('lee el secreto del .env de security (con o sin comillas)', () => {
    expect(readEnvValue('A=1\nJWT_SECRET="x y"', 'JWT_SECRET')).toBe('x y');
    expect(readEnvValue('A=1', 'JWT_SECRET')).toBeNull();
  });

  it('la búsqueda escapa caracteres de regex y no consulta con menos de 2 letras', async () => {
    const { mongo, scripts } = fakeMongo(['[]']);
    const service = new SessionService(sessionConfig, mongo);
    expect(await service.searchUsers('a')).toEqual([]);
    expect(scripts).toHaveLength(0);
    await service.searchUsers('a.*("; db.dropDatabase()');
    expect(scripts[0]).toContain(JSON.stringify(escapeRegex('a.*("; db.dropDatabase()')));
    expect(scripts[0]).not.toContain('"; db.dropDatabase()"');
  });

  it('crea un refresh token firmado y registrado, y lo puede revocar sin tocar otros tokens', async () => {
    const { mongo, scripts } = fakeMongo([JSON.stringify({ id: USER, email: 'a@b.com', name: 'A', role: null }), 'ok', '1']);
    const service = new SessionService(sessionConfig, mongo);
    const minted = await service.mint(USER, 1_800_000_000);
    const [h, p, sig] = minted.refreshToken.split('.') as [string, string, string];
    expect(sig).toBe(createHmac('sha256', 'mi-secreto-de-prueba').update(`${h}.${p}`).digest('base64url'));
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toMatchObject({ sub: USER, type: 'refresh', exp: 1_800_000_000 + 86_400 });
    expect(scripts[1]).toContain('db.tokens.insertOne');
    expect(JSON.stringify(minted)).not.toContain('mi-secreto-de-prueba');
    expect(existsSync(join(paths.data, 'sessions.json'))).toBe(true);
    expect(service.list()).toHaveLength(1);
    expect(JSON.stringify(service.list())).not.toContain(minted.refreshToken);

    expect(await service.revoke()).toBe(1);
    expect(scripts[2]).toContain(minted.refreshToken);
    expect(service.list()).toHaveLength(0);
  });

  it('rechaza ids que no son ObjectId (inyección) y sesiones deshabilitadas', async () => {
    const { mongo } = fakeMongo([]);
    await expect(new SessionService(sessionConfig, mongo).mint('x"); db.dropDatabase(); ("')).rejects.toThrow(/inválido/);
    const disabled = new SessionService({ ...sessionConfig, session: { ...sessionConfig.session, enabled: false } }, mongo);
    await expect(disabled.mint(USER)).rejects.toThrow(/deshabilitadas/);
  });
});

describe('git', () => {
  it('lee adelanto y atraso respecto de la rama base', () => {
    expect(parseAheadBehind('3\t7')).toEqual({ behind: 3, ahead: 7 });
    expect(parseAheadBehind('fatal: bad revision')).toBeNull();
  });
  it('lee git status --porcelain', () => {
    expect(parsePorcelain(' M src/a.ts\n?? nuevo.md\n')).toEqual([{ status: 'M', path: 'src/a.ts' }, { status: '??', path: 'nuevo.md' }]);
    // la primera línea llega sin su espacio inicial (stdout recortado)
    expect(parsePorcelain('M .env\n M x.ts')).toEqual([{ status: 'M', path: '.env' }, { status: 'M', path: 'x.ts' }]);
  });
});

describe('compareSharedSecret', () => {
  it('ok si coinciden, error si falta o difiere, sin mostrar el valor', () => {
    expect(compareSharedSecret({ panel: 'x', legajo: 'x' }, 'K').status).toBe('ok');
    expect(compareSharedSecret({ panel: 'x', legajo: null }, 'K')).toMatchObject({ status: 'error', detail: 'Falta en: legajo' });
    const mismatch = compareSharedSecret({ panel: 'secreto-1', legajo: 'secreto-2' }, 'K');
    expect(mismatch.status).toBe('error');
    expect(mismatch.detail).not.toMatch(/secreto-[12]/);
  });
});

describe('datos de prueba por ticket', () => {
  it('valida el número de ticket', () => {
    expect(assertTicket('33526')).toBe('33526');
    expect(() => assertTicket('33526; db.dropDatabase()')).toThrow(/inválido/);
  });

  const calls: string[][] = [];
  const makeRunner = (docs: number, exportLines: number): Runner => async (_file, args) => {
    calls.push(args);
    const js = args[args.indexOf('--eval') + 1] ?? '';
    if (args.includes('mongoexport')) return ok(Array.from({ length: exportLines }, (_, i) => `{"_id":${i}}`).join('\n'));
    if (js.includes('.count(')) return ok(calls.filter((c) => (c[args.length > 0 ? 0 : 0] ?? '') === 'exec' && (c.join(' ').includes('deleteMany'))).length ? '0' : String(docs));
    if (js.includes('deleteMany')) return ok(String(docs));
    return ok();
  };

  it('lista cuántos documentos marcados hay por colección', async () => {
    calls.length = 0;
    const rows = await listTestData(config, '33526', makeRunner(2, 2));
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.count === 2)).toBe(true);
  });

  it('exporta antes de borrar y verifica que no queden', async () => {
    calls.length = 0;
    const lines: string[] = [];
    await cleanTestData(config, '33526', (line) => lines.push(line), makeRunner(2, 2));
    const firstExport = calls.findIndex((c) => c.includes('mongoexport'));
    const firstDelete = calls.findIndex((c) => c.join(' ').includes('deleteMany'));
    expect(firstExport).toBeGreaterThan(-1);
    expect(firstDelete).toBeGreaterThan(firstExport);
    expect(lines.join('\n')).toMatch(/0 restantes/);
    const backups = readdirSync(join(paths.data, 'testdata-backups'));
    expect(backups.some((name) => name.startsWith('33526-'))).toBe(true);
    expect(readFileSync(join(paths.data, 'testdata-backups', backups[0]!, 'legajo.legajodigitals.jsonl'), 'utf8')).toContain('"_id"');
  });

  it('si el respaldo no coincide con lo esperado, no borra nada', async () => {
    calls.length = 0;
    await expect(cleanTestData(config, '33526', () => undefined, makeRunner(3, 1))).rejects.toThrow(/no se borra nada/);
    expect(calls.some((c) => c.join(' ').includes('deleteMany'))).toBe(false);
  });
});

describe('scripts desde una carpeta configurable', () => {
  const folder = mkdtempSync(join(tmpdir(), 'dp-scripts-'));
  writeFileSync(join(folder, 'backup_improved4.sh'), '#!/bin/bash\n# uso: --type TIPO');
  writeFileSync(join(folder, 'otro.sh'), '#!/bin/bash\n# uso: --type TIPO');
  writeFileSync(join(folder, 'reset_password.sh'), '#!/bin/bash\necho hola');
  writeFileSync(join(folder, 'notas.txt'), 'x');
  mkdirSync(join(folder, 'compartidos'));
  const config = { ...defaultConfig('/x'), paths: { ...defaultConfig('/x').paths, scripts: folder } };

  it('lista solo archivos .sh de la carpeta, sin subcarpetas ni otros tipos', async () => {
    const { listBackupScripts, listScripts, scriptsDir } = await import('./mongo.js');
    expect(listScripts(config)).toEqual(['backup_improved4.sh', 'otro.sh', 'reset_password.sh']);
    expect(listBackupScripts(config)).toEqual(['backup_improved4.sh', 'otro.sh']);
    expect(scriptsDir(config)).toBe(folder);
    expect(scriptsDir({ ...config, paths: { ...config.paths, scripts: '' } })).toBe('/x/zscripts');
  });

  it('resuelve el script configurado dentro de la carpeta y solo acepta elegir uno de la lista', async () => {
    const { resolveBackupScript } = await import('./mongo.js');
    expect(resolveBackupScript(config)).toBe(join(folder, 'backup_improved4.sh'));
    expect(resolveBackupScript(config, 'otro.sh')).toBe(join(folder, 'otro.sh'));
    expect(() => resolveBackupScript(config, '../etc/passwd.sh')).toThrow(/no está en la carpeta/);
    expect(() => resolveBackupScript(config, 'notas.txt')).toThrow(/no está en la carpeta/);
    expect(() => resolveBackupScript(config, 'reset_password.sh')).toThrow(/no es de backup/);
    expect(() => resolveBackupScript(config, 'no-existe.sh')).toThrow(/no está en la carpeta/);
  });

  it('una configuración vieja con ruta absoluta sigue funcionando', async () => {
    const { resolveBackupScript } = await import('./mongo.js');
    expect(resolveBackupScript({ ...config, remoteBackup: { ...config.remoteBackup, script: '/opt/scripts/mi.sh' } })).toBe('/opt/scripts/mi.sh');
  });
});

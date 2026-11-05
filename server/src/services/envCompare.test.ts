import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig, type DevPanelConfig } from '../config.js';
import { compareAllEnvs, compareEnv, compareWithSchema, parseEnvNames, parseJoiSchema } from './envCompare.js';

describe('parseEnvNames', () => {
  it('separa las variables activas de las comentadas y no confunde un comentario común con una variable', () => {
    const { active, commented } = parseEnvNames(['PORT=8001', 'export REDIS_URL=redis://x', '# Redis', '# GEMINI_API_KEY=abc', '#DEBUG=1', '', 'MAL LINEA', 'A_B_1 = 2'].join('\n'));
    expect([...active].sort()).toEqual(['A_B_1', 'PORT', 'REDIS_URL']);
    expect([...commented].sort()).toEqual(['DEBUG', 'GEMINI_API_KEY']);
  });
});

describe('compareEnv', () => {
  const example = ['PORT=1', 'DOCUMENTOS_URL=http://documentos:3007', 'OPENAI_API_KEY=', '# OPCIONAL=1'].join('\n');
  it('las del ejemplo que el .env no tiene faltan; las que el .env agrega sobran', () => {
    const result = compareEnv(['PORT=8001', 'OPENAI_API_KEY=secreto', 'OTRA=1'].join('\n'), example);
    expect(result.missing).toEqual(['DOCUMENTOS_URL']);
    expect(result.extra).toEqual(['OTRA']);
  });
  it('una variable comentada en el .env no falta, pero se avisa que no se aplica; una opcional del ejemplo no sobra', () => {
    const result = compareEnv(['PORT=1', '# DOCUMENTOS_URL=x', 'OPENAI_API_KEY=k', 'OPCIONAL=2'].join('\n'), example);
    expect(result.missing).toEqual([]);
    expect(result.commented).toEqual(['DOCUMENTOS_URL']);
    expect(result.extra).toEqual([]);
  });
  it('nunca devuelve valores', () => {
    expect(JSON.stringify(compareEnv('PORT=valor-secreto-123', example))).not.toContain('valor-secreto-123');
  });
});

describe('compareAllEnvs con repos reales en disco', () => {
  const projects = mkdtempSync(join(tmpdir(), 'dp-envcmp-'));
  afterAll(() => rmSync(projects, { recursive: true, force: true }));
  const config = { ...defaultConfig(projects), repos: ['legajo', 'sinejemplo', 'sinenv'] } as DevPanelConfig;
  mkdirSync(join(projects, 'legajo'));
  writeFileSync(join(projects, 'legajo', '.env'), 'PORT=1\nSECRETO=no-salir\n');
  writeFileSync(join(projects, 'legajo', '.env.example'), 'PORT=1\nDOCUMENTOS_URL=x\n');
  mkdirSync(join(projects, 'sinejemplo'));
  writeFileSync(join(projects, 'sinejemplo', '.env'), 'A=1\n');
  mkdirSync(join(projects, 'sinenv'));
  writeFileSync(join(projects, 'sinenv', '.env.example'), 'A=1\n');

  it('compara los que tienen .env y ejemplo, y marca como no comparables los demás', () => {
    const [legajo, sinejemplo, sinenv] = compareAllEnvs(config);
    expect(legajo).toMatchObject({ repo: 'legajo', comparable: true, source: 'example', exampleFile: '.env.example', missing: ['DOCUMENTOS_URL'], extra: ['SECRETO'] });
    expect(sinejemplo).toMatchObject({ comparable: false, exampleFile: null });
    expect(sinenv).toMatchObject({ comparable: false, exampleFile: '.env.example' });
    expect(JSON.stringify([legajo, sinejemplo, sinenv])).not.toContain('no-salir');
  });
});

const SCHEMA = [
  'const envVarsSchema = Joi.object()',
  '  .keys({',
  "    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),",
  '    PORT: Joi.number().default(3000),',
  "    MONGODB_URL: Joi.string().required().description('Mongo DB url'),",
  '    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()',
  '      .default(10)',
  "      .description('minutes after which reset password token expires'),",
  "    DOCUMENTOS_URL: Joi.string().default('http://documentos:3007').description('Base url del servicio documentos'),",
  "    API_KEY: Joi.string()\n      .required()\n      .description('clave'),",
  '  })',
].join('\n');

describe('esquema Joi de config.ts (repos sin .env.example)', () => {
  it('lee las variables y distingue las obligatorias de las que tienen valor por defecto, también en varias líneas', () => {
    expect(parseJoiSchema(SCHEMA)).toEqual([
      { name: 'NODE_ENV', required: true },
      { name: 'PORT', required: false },
      { name: 'MONGODB_URL', required: true },
      { name: 'JWT_RESET_PASSWORD_EXPIRATION_MINUTES', required: false },
      { name: 'DOCUMENTOS_URL', required: false },
      { name: 'API_KEY', required: true },
    ]);
  });
  it('una obligatoria que falta es un faltante; una opcional que falta usa su valor por defecto; lo que no declara el esquema sobra', () => {
    const result = compareWithSchema('NODE_ENV=development\nMONGODB_URL=mongodb://x\nRARA=1\n# PORT=9\n', parseJoiSchema(SCHEMA));
    // NODE_ENV es obligatoria en el esquema pero la pone el entorno de ejecución: no se pide en el .env.
    expect(compareWithSchema('MONGODB_URL=x\nAPI_KEY=y\n', parseJoiSchema(SCHEMA)).missing).toEqual([]);
    expect(result.missing).toEqual(['API_KEY']);
    expect(result.usesDefault).toEqual(['DOCUMENTOS_URL', 'JWT_RESET_PASSWORD_EXPIRATION_MINUTES']);
    expect(result.commented).toEqual(['PORT']);
    expect(result.extra).toEqual(['RARA']);
    expect(JSON.stringify(result)).not.toContain('mongodb://x');
  });
  it('un repo sin ejemplo pero con config.ts se compara con el esquema', () => {
    const projects = mkdtempSync(join(tmpdir(), 'dp-envschema-'));
    mkdirSync(join(projects, 'legajo', 'src', 'config'), { recursive: true });
    writeFileSync(join(projects, 'legajo', '.env'), 'NODE_ENV=test\n');
    writeFileSync(join(projects, 'legajo', 'src', 'config', 'config.ts'), SCHEMA);
    const [entry] = compareAllEnvs({ ...defaultConfig(projects), repos: ['legajo'] } as DevPanelConfig);
    expect(entry).toMatchObject({ comparable: true, source: 'schema', exampleFile: 'src/config/config.ts', missing: ['API_KEY', 'MONGODB_URL'], usesDefault: expect.arrayContaining(['DOCUMENTOS_URL']) });
    rmSync(projects, { recursive: true, force: true });
  });
});

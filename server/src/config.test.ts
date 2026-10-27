import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configSchema, defaultConfig, loadConfig, saveConfig } from './config.js';

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'dev-panel-')), 'config.json');

describe('config', () => {
  it('la configuración de fábrica cumple el esquema y deriva las rutas de la carpeta de repos', () => {
    const config = defaultConfig('/work/projects');
    expect(configSchema.safeParse(config).success).toBe(true);
    expect(config.paths.extra).toBe('/work/projects/_EXTRA');
    expect(config.compose.minio).toBe('/work/projects/file-manager/docker.compose.minio.yml');
    expect(config.startup.mandatory).toEqual(['new-panel', 'security', 'files', 'legajo']);
  });

  it('sin archivo queda "no configurado"', () => {
    expect(loadConfig(tempFile())).toMatchObject({ configured: false });
  });

  it('guarda y vuelve a leer la configuración, con permisos 600', () => {
    const file = tempFile();
    const config = defaultConfig('/work/projects');
    saveConfig(config, file);
    expect(loadConfig(file)).toEqual({ configured: true, config });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('un JSON inválido o con esquema roto informa el motivo sin lanzar', () => {
    const file = tempFile();
    writeFileSync(file, '{ no es json');
    expect(loadConfig(file)).toMatchObject({ configured: false });
    writeFileSync(file, JSON.stringify({ paths: {} }));
    const state = loadConfig(file);
    expect(state.configured).toBe(false);
    expect(JSON.stringify(state)).toMatch(/inválido/);
    expect(readFileSync(file, 'utf8')).toContain('paths');
  });

  it('rechaza nombres de servicio con caracteres de shell', () => {
    const config = defaultConfig('/work/projects');
    config.startup.optional = ['firma; rm -rf /'];
    expect(configSchema.safeParse(config).success).toBe(false);
  });
});

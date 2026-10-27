import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { listContainers, readTscStatus } from './containers.js';
import { MongoClient } from './mongo.js';
import { readEnvValue } from './session.js';

export type CheckStatus = 'ok' | 'warn' | 'error';
export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

const check = (id: string, title: string, status: CheckStatus, detail: string): Check => ({ id, title, status, detail });
const hashOf = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 8);

/** Compara una variable compartida entre repos por hash: nunca expone el valor. */
export const compareSharedSecret = (values: Record<string, string | null>, key: string): Check => {
  const present = Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== '');
  const missing = Object.keys(values).filter((repo) => !present.some(([name]) => name === repo));
  const hashes = new Set(present.map(([, value]) => hashOf(value)));
  if (missing.length) return check('shared-secret', `${key} en todos los servicios`, 'error', `Falta en: ${missing.join(', ')}`);
  if (hashes.size > 1) return check('shared-secret', `${key} coincide entre servicios`, 'error', `Los valores no coinciden: ${present.map(([repo, value]) => `${repo}=${hashOf(value)}`).join(', ')}`);
  return check('shared-secret', `${key} coincide entre servicios`, 'ok', `${present.length} servicios con el mismo valor`);
};

const certificateCheck = async (config: DevPanelConfig, runner: Runner): Promise<Check> => {
  const dir = join(config.paths.projects, config.checks.firmaCaDir);
  const pem = join(dir, 'rootCA.pem');
  const key = join(dir, 'rootCA.key');
  const title = 'CA de firma';
  if (!existsSync(pem) || !existsSync(key)) return check('firma-ca', title, 'error', `Faltan rootCA.pem o rootCA.key en ${dir} (sin ellos el build de firma falla)`);
  const end = await runner('openssl', ['x509', '-noout', '-enddate', '-in', pem]);
  if (!end.ok) return check('firma-ca', title, 'error', 'rootCA.pem no es un certificado válido');
  const expired = !(await runner('openssl', ['x509', '-noout', '-checkend', '0', '-in', pem])).ok;
  const soon = !expired && !(await runner('openssl', ['x509', '-noout', '-checkend', String(30 * 86_400), '-in', pem])).ok;
  const date = end.stdout.replace('notAfter=', '');
  if (expired) return check('firma-ca', title, 'error', `Vencido el ${date}: el servicio de firma no arranca`);
  return check('firma-ca', title, soon ? 'warn' : 'ok', soon ? `Vence pronto: ${date}` : `Vigente hasta ${date}`);
};

export const runChecks = async (config: DevPanelConfig, runner: Runner = run): Promise<Check[]> => {
  const checks: Check[] = [];

  const dockerInfo = await runner('docker', ['version', '--format', '{{.Server.Version}}']);
  checks.push(check('docker', 'Docker', dockerInfo.ok ? 'ok' : 'error', dockerInfo.ok ? `Motor ${dockerInfo.stdout}` : 'Docker no responde'));

  try {
    const dbs = await new MongoClient(config, runner).listDatabases();
    checks.push(check('mongo', 'Mongo local', 'ok', `${dbs.length} bases accesibles en ${config.mongo.container}`));
  } catch (error) {
    checks.push(check('mongo', 'Mongo local', 'error', (error as Error).message));
  }

  const containers = dockerInfo.ok ? await listContainers(runner) : [];
  const required = [...config.startup.stage1, ...config.startup.stage2, ...config.startup.mandatory];
  const notRunning = required.filter((service) => !containers.some((container) => container.service === service && container.state === 'running'));
  checks.push(check('required', 'Servicios obligatorios corriendo', notRunning.length ? 'warn' : 'ok', notRunning.length ? `No están corriendo: ${notRunning.join(', ')}` : `${required.length} servicios arriba`));
  const unhealthy = containers.filter((container) => container.status.includes('unhealthy')).map((container) => container.name);
  checks.push(check('unhealthy', 'Contenedores sanos', unhealthy.length ? 'warn' : 'ok', unhealthy.length ? `Con healthcheck en rojo: ${unhealthy.join(', ')}` : 'Ninguno con healthcheck en rojo'));

  const running = containers.filter((container) => container.state === 'running');
  const stuck: string[] = [];
  const withErrors: string[] = [];
  for (const container of running) {
    const tsc = await readTscStatus(container.name, runner);
    if (tsc.state === 'stuck') stuck.push(container.name);
    if (tsc.state === 'errors') withErrors.push(`${container.name} (${tsc.errors})`);
  }
  checks.push(check('tsc', 'Compilación (tsc --watch)', stuck.length || withErrors.length ? (stuck.length ? 'warn' : 'error') : 'ok', stuck.length || withErrors.length ? [stuck.length ? `Trabado (reiniciar): ${stuck.join(', ')}` : '', withErrors.length ? `Con errores: ${withErrors.join(', ')}` : ''].filter(Boolean).join(' · ') : 'Sin errores ni procesos trabados'));

  const { key, repos } = config.checks.sharedSecret;
  const values: Record<string, string | null> = {};
  for (const repo of repos) {
    const file = join(config.paths.projects, repo, '.env');
    values[repo] = existsSync(file) ? readEnvValue(readFileSync(file, 'utf8'), key) : null;
  }
  checks.push(compareSharedSecret(values, key));

  checks.push(await certificateCheck(config, runner));

  const missingPaths = [config.paths.extra, config.compose.main, config.compose.minio].filter((path) => !existsSync(path));
  checks.push(check('paths', 'Rutas configuradas', missingPaths.length ? 'error' : 'ok', missingPaths.length ? `No existen: ${missingPaths.join(', ')}` : 'Todas existen'));
  return checks;
};

import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import type { CommandResult, Runner } from '../docker.js';
import { parseTscStatus } from './containers.js';
import { StartupEngine, stopServices } from './startup.js';

const config = defaultConfig('/work');
const ok = (stdout = ''): CommandResult => ({ ok: true, stdout, stderr: '' });

interface FakeOptions {
  running?: string[];
  /** Cantidad de consultas de logs de RabbitMQ que todavía no muestran el texto de "listo". */
  rabbitNotReadyPolls?: number;
  rabbitNeverReady?: boolean;
  composeFails?: string;
}

const fakeDocker = (options: FakeOptions = {}) => {
  const calls: string[][] = [];
  let notReady = options.rabbitNotReadyPolls ?? 0;
  const runner: Runner = async (_file, args) => {
    calls.push(args);
    const [command] = args;
    if (command === 'ps') return ok((options.running ?? []).join('\n'));
    if (command === 'compose') {
      const detail = args.join(' ');
      if (args.includes('config')) {
        return args.includes(config.compose.minio) ? ok('minio\nmc') : ok([...config.startup.stage2, ...config.startup.mandatory, ...config.startup.optional, 'leia-qdrant', 'leia-redis'].join('\n'));
      }
      if (options.composeFails && detail.includes(options.composeFails)) return { ok: false, stdout: '', stderr: 'boom: no such image' };
      return ok();
    }
    if (command === 'inspect') {
      return args.join(' ').includes('Health') ? ok('true|healthy') : ok('true|2026-10-27T13:53:00.000000000Z');
    }
    if (command === 'logs') {
      if (options.rabbitNeverReady || notReady-- > 0) return ok('2026-10-27 13:53:41 starting plugins');
      return ok('2026-10-27 13:53:42 completed with 3 plugins.');
    }
    return ok();
  };
  return { runner, calls };
};

const makeEngine = (options?: FakeOptions) => {
  const fake = fakeDocker(options);
  let clock = 1_000_000;
  const engine = new StartupEngine({
    getConfig: () => config,
    runner: fake.runner,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  return { engine, ...fake };
};

const ups = (calls: string[][]) => calls.filter((args) => args[0] === 'compose' && args.includes('up'));

describe('validación previa', () => {
  it('si un servicio no existe en el compose (nombre de contenedor en vez de servicio), falla sin levantar nada', async () => {
    const fake = fakeDocker();
    const bad = { ...config, startup: { ...config.startup, stage1: ['minio', 'minio-mc'] } };
    const engine = new StartupEngine({ getConfig: () => bad, runner: fake.runner, sleep: async () => undefined });
    const result = await engine.run([]);
    expect(result.status).toBe('error');
    expect(result.log.at(-1)?.text).toMatch(/no existen.*minio-mc/);
    expect(fake.calls.some((args) => args.includes('up'))).toBe(false);
  });
});

describe('StartupEngine', () => {
  it('levanta en orden: MinIO → RabbitMQ y Mongo → espera → obligatorios y elegidos', async () => {
    const { engine, calls } = makeEngine();
    const result = await engine.run(['firma']);

    expect(result.status).toBe('done');
    const sequence = ups(calls).map((args) => ({ file: args[2], services: args.slice(args.indexOf('--no-deps') + 1) }));
    expect(sequence).toEqual([
      { file: config.compose.minio, services: ['minio', 'mc'] },
      { file: config.compose.main, services: ['rabbitmq', 'mongo-e-sueldos'] },
      { file: config.compose.main, services: ['new-panel', 'security', 'files', 'legajo', 'firma'] },
    ]);
    expect(result.steps.map((step) => step.status)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('usa --no-deps para que Compose no altere el orden por sus depends_on', async () => {
    const { engine, calls } = makeEngine();
    await engine.run([]);
    expect(ups(calls).every((args) => args.includes('--no-deps'))).toBe(true);
  });

  it('con Leia suma qdrant y redis a la etapa 2 (con RabbitMQ y Mongo), no a la 3', async () => {
    const { engine, calls } = makeEngine();
    await engine.run(['leia']);
    const [, stage2, stage3] = ups(calls).map((args) => args.slice(args.indexOf('--no-deps') + 1));
    expect(stage2).toEqual(['rabbitmq', 'mongo-e-sueldos', 'leia-qdrant', 'leia-redis']);
    expect(stage3).toEqual(['new-panel', 'security', 'files', 'legajo', 'leia']);
  });

  it('no pasa a la etapa 3 hasta que RabbitMQ loguea que cargó sus plugins', async () => {
    const { engine, calls } = makeEngine({ rabbitNotReadyPolls: 3 });
    await engine.run([]);
    const logPolls = calls.filter((args) => args[0] === 'logs').length;
    expect(logPolls).toBe(4);
    const lastLog = calls.map((args, index) => ({ args, index })).filter((entry) => entry.args[0] === 'logs').pop()!.index;
    const stage3 = calls.findIndex((args) => args.includes('legajo') && args.includes('up'));
    expect(stage3).toBeGreaterThan(lastLog);
  });

  it('mira solo los logs posteriores al último arranque de RabbitMQ (--since)', async () => {
    const { engine, calls } = makeEngine();
    await engine.run([]);
    const logs = calls.find((args) => args[0] === 'logs')!;
    expect(logs).toEqual(['logs', '--since', '2026-10-27T13:53:00.000000000Z', 'rabbitmq']);
  });

  it('si RabbitMQ nunca queda listo: error por tiempo agotado y no levanta la etapa 3', async () => {
    const { engine, calls } = makeEngine({ rabbitNeverReady: true });
    const result = await engine.run([]);
    expect(result.status).toBe('error');
    expect(result.steps.find((step) => step.id === 'wait')?.status).toBe('error');
    expect(result.steps.find((step) => step.id === 'wait')?.message).toMatch(/Tiempo agotado.*RabbitMQ/);
    expect(result.steps.find((step) => step.id === 'stage3')?.status).toBe('pending');
    expect(calls.some((args) => args.includes('legajo') && args.includes('up'))).toBe(false);
  });

  it('es idempotente: omite los servicios que ya están corriendo', async () => {
    const { engine, calls } = makeEngine({ running: ['minio', 'mc', 'rabbitmq', 'mongo-e-sueldos', 'security'] });
    const result = await engine.run([]);
    expect(result.status).toBe('done');
    const sequence = ups(calls).map((args) => args.slice(args.indexOf('--no-deps') + 1));
    expect(sequence).toEqual([['new-panel', 'files', 'legajo']]);
    expect(result.steps[0]?.message).toBe('Todo estaba levantado.');
  });

  it('un error de compose corta la corrida y marca la etapa', async () => {
    const { engine } = makeEngine({ composeFails: 'rabbitmq' });
    const result = await engine.run([]);
    expect(result.status).toBe('error');
    expect(result.steps[1]?.status).toBe('error');
    expect(result.steps[1]?.message).toMatch(/no such image/);
    expect(result.steps[0]?.status).toBe('done');
  });

  it('reintenta desde una etapa: las anteriores quedan "skipped"', async () => {
    const { engine, calls } = makeEngine();
    const result = await engine.run([], 'stage3');
    expect(result.steps.map((step) => step.status)).toEqual(['skipped', 'skipped', 'skipped', 'done']);
    expect(ups(calls)).toHaveLength(1);
  });

  it('rechaza servicios fuera de la lista de opcionales', async () => {
    const { engine } = makeEngine();
    await expect(engine.run(['firma; rm -rf /'])).rejects.toThrow(/no permitidos/);
    await expect(engine.run(['rabbitmq'])).rejects.toThrow(/no permitidos/);
  });

  it('no permite dos corridas a la vez', async () => {
    const { engine } = makeEngine();
    const first = engine.run([]);
    await expect(engine.run([])).rejects.toThrow(/en curso/);
    await first;
  });
});

describe('stopServices', () => {
  it('"apps" detiene obligatorios y opcionales, sin infraestructura ni MinIO', async () => {
    const { runner, calls } = fakeDocker();
    const stopped = await stopServices(config, 'apps', runner);
    expect(stopped).toContain('legajo');
    expect(stopped).not.toContain('rabbitmq');
    expect(calls).toHaveLength(1);
  });

  it('"all" suma infraestructura y MinIO (con su propio compose)', async () => {
    const { runner, calls } = fakeDocker();
    const stopped = await stopServices(config, 'all', runner);
    expect(stopped).toEqual(expect.arrayContaining(['rabbitmq', 'mongo-e-sueldos', 'leia-qdrant', 'minio', 'mc']));
    expect(calls[1]).toEqual(['compose', '-f', config.compose.minio, 'stop', 'minio', 'mc']);
  });
});

describe('parseTscStatus', () => {
  it('0 errores', () => expect(parseTscStatus('Starting...\nFound 0 errors. Watching for file changes.')).toEqual({ state: 'ok', errors: 0 }));
  it('toma el último resultado', () => expect(parseTscStatus('Found 3 errors.\nFound 1 error.')).toEqual({ state: 'errors', errors: 1 }));
  it('detecta tsc trabado por archivos de otra rama (TS6053 posterior)', () =>
    expect(parseTscStatus('Found 0 errors.\nerror TS6053: File x.ts not found.')).toEqual({ state: 'stuck', errors: null }));
  it('si luego compila bien, ya no está trabado', () =>
    expect(parseTscStatus('error TS6053: File x.ts not found.\nFound 0 errors.')).toEqual({ state: 'ok', errors: 0 }));
  it('sin datos', () => expect(parseTscStatus('hola')).toEqual({ state: 'unknown', errors: null }));
});

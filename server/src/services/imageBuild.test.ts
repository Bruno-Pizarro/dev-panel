import { describe, expect, it } from 'vitest';
import { compareBuild, readBuildStatus, rebuildService } from './imageBuild.js';

const ok = (stdout: string) => ({ ok: true, stdout, stderr: '' });

describe('imagen desactualizada', () => {
  it('marca los archivos posteriores a la construcción', () => {
    expect(compareBuild(1000, [{ name: 'package.json', mtimeMs: 1500 }, { name: 'yarn.lock', mtimeMs: 900 }])).toEqual(['package.json']);
    expect(compareBuild(1000, [])).toEqual([]);
  });

  it('solo mira los servicios que se construyen desde el repo', async () => {
    const runner = (async (_file: string, args: string[]) => {
      if (args.includes('config')) return ok(JSON.stringify({ services: { legajo: { build: { context: '/p/legajo' } }, rabbitmq: {} } }));
      if (args[0] === 'inspect') return ok('/legajo\tsha256:aaa');
      return ok('sha256:aaa\t2026-09-08T13:05:25Z');
    }) as never;
    const times = async () => [{ name: 'package.json', mtimeMs: Date.parse('2026-10-01T00:00:00Z') }];
    const statuses = await readBuildStatus('c.yml', [{ name: 'legajo', service: 'legajo' }, { name: 'rabbitmq', service: 'rabbitmq' }], runner, times);
    expect(statuses).toEqual([{ service: 'legajo', stale: true, files: ['package.json'], imageCreatedAt: '2026-09-08T13:05:25Z' }]);
  });

  it('reconstruye con build y luego up del servicio, sin dependencias', async () => {
    const calls: string[][] = [];
    const runner = (async (_file: string, args: string[]) => (calls.push(args), ok(''))) as never;
    expect((await rebuildService('c.yml', 'legajo', runner)).ok).toBe(true);
    expect(calls).toEqual([['compose', '-f', 'c.yml', 'build', 'legajo'], ['compose', '-f', 'c.yml', 'up', '-d', '--no-deps', 'legajo']]);
  });

  it('si el build falla no recrea el contenedor', async () => {
    const calls: string[][] = [];
    const runner = (async (_file: string, args: string[]) => (calls.push(args), { ok: false, stdout: '', stderr: 'boom' })) as never;
    const result = await rebuildService('c.yml', 'legajo', runner);
    expect(result).toEqual({ ok: false, output: 'boom' });
    expect(calls).toHaveLength(1);
  });
});

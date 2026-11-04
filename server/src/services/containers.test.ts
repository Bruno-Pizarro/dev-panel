import { describe, expect, it } from 'vitest';
import { restartContainer, stopContainer } from './containers.js';

describe('acciones sobre contenedores', () => {
  it('stop y restart llaman a docker con el nombre como argumento aparte', async () => {
    const calls: string[][] = [];
    const runner = (async (_cmd: string, args: string[]) => (calls.push(args), { ok: true, stdout: '', stderr: '' })) as never;
    await stopContainer('legajo', runner);
    await restartContainer('legajo', runner);
    expect(calls).toEqual([['stop', 'legajo'], ['restart', 'legajo']]);
  });
});

import { describe, expect, it } from 'vitest';
import { publishedPorts } from './remoteAccess.js';

const compose = JSON.stringify({ services: { legajo: { ports: [{ published: '3007' }, { published: '9232' }] }, mongo: { ports: [{ published: '27021' }] }, x: {} } });

describe('puertos para el acceso remoto', () => {
  it('suma el front y el panel, deja los del compose y saca los del inspector', async () => {
    const runner = (async () => ({ ok: true, stdout: compose, stderr: '' })) as never;
    expect(await publishedPorts('c.yml', runner)).toEqual([3007, 4200, 5173, 27021]);
  });
  it('sin compose legible quedan el front y el panel', async () => {
    expect(await publishedPorts('c.yml', (async () => ({ ok: false, stdout: '', stderr: '' })) as never)).toEqual([4200, 5173]);
  });
});

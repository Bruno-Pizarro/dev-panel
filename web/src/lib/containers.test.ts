import { describe, expect, it } from 'vitest';
import { explainContainer, exitCode, sortContainers } from './containers';
import type { ContainerInfo } from './types';

const make = (name: string, rank: number, startedAt: string | null, state = 'running'): ContainerInfo => ({ name, service: name, image: '', state, status: '', ports: '', startedAt, rank });

describe('explainContainer', () => {
  it('distingue healthcheck en rojo, caídas y terminaciones normales', () => {
    expect(explainContainer({ state: 'running', status: 'Up 4 days (unhealthy)' }).label).toMatch(/healthcheck en rojo/);
    expect(explainContainer({ state: 'running', status: 'Up 3 hours' }).tone).toBe('success');
    expect(explainContainer({ state: 'exited', status: 'Exited (1) 4 days ago' }).label).toBe('Se cayó (código 1)');
    expect(explainContainer({ state: 'exited', status: 'Exited (0) 4 hours ago' }).tone).toBe('neutral');
    expect(explainContainer({ state: 'exited', status: 'Exited (137) 1 day ago' }).label).toMatch(/137/);
  });

  it('lee el código de salida', () => {
    expect(exitCode('Exited (255) 2 weeks ago')).toBe(255);
    expect(exitCode('Up 3 hours')).toBeNull();
  });
});

describe('sortContainers', () => {
  const list = [make('files', 3, '2026-10-27T10:00:00Z'), make('minio', 0, '2026-10-27T08:00:00Z'), make('legajo', 3, '2026-10-27T12:00:00Z'), make('cursos', 9, null, 'exited')];

  it('por orden de levantado y, a igual lugar, el más reciente primero', () => {
    expect(sortContainers(list, 'order').map((c) => c.name)).toEqual(['minio', 'legajo', 'files', 'cursos']);
  });
  it('por último arranque, más reciente primero; lo que nunca arrancó al final', () => {
    expect(sortContainers(list, 'recent').map((c) => c.name)).toEqual(['legajo', 'files', 'minio', 'cursos']);
  });
  it('por nombre y por estado', () => {
    expect(sortContainers(list, 'name').map((c) => c.name)).toEqual(['cursos', 'files', 'legajo', 'minio']);
    expect(sortContainers(list, 'state')[3]!.name).toBe('cursos');
  });
});

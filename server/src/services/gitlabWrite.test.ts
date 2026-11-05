import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig, type DevPanelConfig } from '../config.js';
import { setVar } from './claudeEnv.js';
import { addMrNote, createMr, type JsonFetcher } from './gitlabWrite.js';

const projects = mkdtempSync(join(tmpdir(), 'dp-mr-'));
mkdirSync(join(projects, 'legajo', '.git'), { recursive: true });
const config = defaultConfig(projects) as unknown as DevPanelConfig;
const file = join(mkdtempSync(join(tmpdir(), 'dp-mr-env-')), 'claude.env');
setVar('GITLAB_RW_TOKEN', 'token-inventado-1', { file, managed: true });

const recorder = (status = 201, body: unknown = { iid: 7, web_url: 'https://gitlab/mr/7', id: 99 }) => {
  const calls: Array<{ url: string; token: string | undefined; body: Record<string, unknown> }> = [];
  const fetcher: JsonFetcher = async (url, init) => (calls.push({ url, token: init.headers['PRIVATE-TOKEN'], body: JSON.parse(init.body) as Record<string, unknown> }), { ok: status < 300, status, json: async () => body });
  return { calls, fetcher };
};

describe('escrituras acotadas en GitLab', () => {
  it('crea un MR hacia la rama base con el token diario', async () => {
    const { calls, fetcher } = recorder();
    const result = await createMr(config, { repo: 'legajo', source: 'feature/1-x', title: ' Mi MR ', description: 'desc' }, { file, fetcher });
    expect(result).toEqual({ iid: 7, url: 'https://gitlab/mr/7' });
    expect(calls[0]).toMatchObject({ url: expect.stringContaining('/projects/e-sueldos-v3%2Flegajo/merge_requests'), token: 'token-inventado-1' });
    expect(calls[0]!.body).toMatchObject({ source_branch: 'feature/1-x', target_branch: 'desarrollo', title: 'Mi MR', remove_source_branch: false, squash: false });
  });

  it('rechaza repos inexistentes, ramas raras, misma rama, título vacío o enorme', async () => {
    const { fetcher, calls } = recorder();
    const bad = (input: Partial<Parameters<typeof createMr>[1]>) => createMr(config, { repo: 'legajo', source: 'feature/1-x', title: 't', ...input }, { file, fetcher });
    await expect(bad({ repo: 'nope' })).rejects.toThrow(/repo/);
    await expect(bad({ repo: '../x' })).rejects.toThrow(/repo/);
    await expect(bad({ source: 'a b;rm' })).rejects.toThrow(/rama/);
    await expect(bad({ source: 'desarrollo' })).rejects.toThrow(/misma/);
    await expect(bad({ title: '  ' })).rejects.toThrow(/título/);
    await expect(bad({ title: 'x'.repeat(256) })).rejects.toThrow(/título/);
    expect(calls).toHaveLength(0);
  });

  it('sin token avisa cómo activarlo, y traduce 401 y 409', async () => {
    const empty = join(mkdtempSync(join(tmpdir(), 'dp-mr-empty-')), 'claude.env');
    await expect(createMr(config, { repo: 'legajo', source: 'feature/1-x', title: 't' }, { file: empty, fetcher: recorder().fetcher })).rejects.toThrow(/Variables de Claude/);
    await expect(createMr(config, { repo: 'legajo', source: 'feature/1-x', title: 't' }, { file, fetcher: recorder(401).fetcher })).rejects.toThrow(/vencido/);
    await expect(createMr(config, { repo: 'legajo', source: 'feature/1-x', title: 't' }, { file, fetcher: recorder(409).fetcher })).rejects.toThrow(/Ya existe/);
  });

  it('comenta en un MR y valida el número y el texto', async () => {
    const { calls, fetcher } = recorder();
    expect(await addMrNote(config, { repo: 'legajo', iid: 7, body: 'hola' }, { file, fetcher })).toEqual({ id: 99 });
    expect(calls[0]!.url).toContain('/merge_requests/7/notes');
    await expect(addMrNote(config, { repo: 'legajo', iid: 0, body: 'x' }, { file, fetcher })).rejects.toThrow(/MR/);
    await expect(addMrNote(config, { repo: 'legajo', iid: 1, body: '  ' }, { file, fetcher })).rejects.toThrow(/comentario/);
  });
});

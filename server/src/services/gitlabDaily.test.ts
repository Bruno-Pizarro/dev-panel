import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, type DevPanelConfig } from '../config.js';
import { readVars, setVar } from './claudeEnv.js';
import { dailyState, ensureDailyToken, resetDailyFailure, RENEW_AFTER_MS } from './gitlabDaily.js';

const on = { ...defaultConfig('/p'), claudeEnv: { gitlabDaily: true } } as unknown as DevPanelConfig;
const off = defaultConfig('/p') as unknown as DevPanelConfig;
const newFile = () => join(mkdtempSync(join(tmpdir(), 'dp-daily-')), 'claude.env');
const noFetch = (async () => ({ ok: true, status: 204 })) as never;

beforeEach(() => resetDailyFailure());

describe('token diario de GitLab para Claude', () => {
  it('apagado no pide nada', async () => {
    const calls: string[][] = [];
    const runner = (async (_c: string, args: string[]) => (calls.push(args), { ok: true, stdout: '', stderr: '' })) as never;
    const state = await ensureDailyToken(off, { file: newFile(), runner });
    expect(state.enabled).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('pide api + read/write_repository por 1 día y lo guarda sin devolverlo', async () => {
    const file = newFile();
    const calls: string[][] = [];
    const runner = (async (_c: string, args: string[]) => (calls.push(args), { ok: true, stdout: 'Token:   glpat-inventado.01.abc', stderr: '' })) as never;
    const state = await ensureDailyToken(on, { file, runner, fetcher: noFetch, now: Date.parse('2026-11-05T09:00:00Z') });
    expect(calls[0]).toEqual(expect.arrayContaining(['personal_access_token', 'dev-panel-claude', 'api,read_repository,write_repository', '1']));
    expect(readVars(file)['GITLAB_RW_TOKEN']).toBe('glpat-inventado.01.abc');
    expect(state).toMatchObject({ enabled: true, mintedAt: '2026-11-05T09:00:00.000Z', error: null });
    expect(JSON.stringify(state)).not.toContain('glpat');
  });

  it('con un token reciente no pide otro, y vencido (o forzado) lo renueva y revoca el anterior', async () => {
    const file = newFile();
    const t0 = Date.parse('2026-11-05T09:00:00Z');
    setVar('GITLAB_RW_TOKEN', 'viejo-inventado-1', { file, managed: true, now: t0 });
    let asked = 0;
    const runner = (async () => (asked++, { ok: true, stdout: 'Token:   nuevo-inventado-2', stderr: '' })) as never;
    const revoked: string[] = [];
    const fetcher = (async (_url: string, init: { method: string; headers: Record<string, string> }) => (revoked.push(`${init.method} ${init.headers['PRIVATE-TOKEN']}`), { ok: true, status: 204 })) as never;
    await ensureDailyToken(on, { file, runner, fetcher, now: t0 + RENEW_AFTER_MS - 1000 });
    expect(asked).toBe(0);
    await ensureDailyToken(on, { file, runner, fetcher, now: t0 + RENEW_AFTER_MS + 1000 });
    expect(asked).toBe(1);
    expect(readVars(file)['GITLAB_RW_TOKEN']).toBe('nuevo-inventado-2');
    expect(revoked).toEqual(['DELETE viejo-inventado-1']);
    await ensureDailyToken(on, { file, runner, fetcher, now: t0 + RENEW_AFTER_MS + 2000, force: true });
    expect(asked).toBe(2);
  });

  it('si SSH falla informa el error, conserva el token anterior y no reintenta enseguida', async () => {
    const file = newFile();
    setVar('GITLAB_RW_TOKEN', 'vigente-inventado-1', { file, managed: true, now: 1 });
    let asked = 0;
    const runner = (async () => (asked++, { ok: false, stdout: '', stderr: 'denied' })) as never;
    const now = Date.parse('2026-11-05T09:00:00Z');
    const state = await ensureDailyToken(on, { file, runner, fetcher: noFetch, now });
    expect(state.error).toMatch(/SSH/);
    expect(readVars(file)['GITLAB_RW_TOKEN']).toBe('vigente-inventado-1');
    await ensureDailyToken(on, { file, runner, fetcher: noFetch, now: now + 60_000 });
    expect(asked).toBe(1);
    expect(dailyState(on, file).error).toMatch(/SSH/);
  });

});

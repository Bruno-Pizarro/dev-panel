import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, paths } from '../config.js';
import { ClaudeError, addAccount, clearLiveUsage, liveToSnapshot, refreshLiveUsage, readCachedUsage, stateFileOf, extractLoginUrl, launchSnippets, loadAccounts, parseAuthStatus, readUsage, removeAccount, setActive, slugify, toSnapshot, validCode } from './claudeAccounts.js';

const reset = () => {
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(join(paths.data, 'claude-accounts.json'), JSON.stringify({ activeId: null, accounts: [] }));
};

describe('cuentas', () => {
  beforeEach(reset);

  it('la cuenta actual (~/.claude) aparece siempre y es la activa por defecto', () => {
    const data = loadAccounts();
    expect(data.activeId).toBe('default');
    expect(data.accounts[0]).toMatchObject({ id: 'default' });
  });

  it('agrega cuentas con id único, carpeta propia y no repite carpetas', () => {
    const work = addAccount({ label: 'Trabajo', color: '99 179 237', configDir: '/tmp/dp-claude-trabajo' });
    const again = addAccount({ label: 'Trabajo', color: '99 179 237', configDir: '/tmp/dp-claude-trabajo-2' });
    expect([work.id, again.id]).toEqual(['trabajo', 'trabajo-2']);
    expect(() => addAccount({ label: 'Otra', color: '1 2 3', configDir: '/tmp/dp-claude-trabajo' })).toThrow(/ya está registrada/);
    expect(loadAccounts().accounts.map((account) => account.id)).toEqual(['default', 'trabajo', 'trabajo-2']);
  });

  it('valida nombre, color y ruta absoluta', () => {
    expect(() => addAccount({ label: '  ', color: '1 2 3' })).toThrow(ClaudeError);
    expect(() => addAccount({ label: 'X', color: 'rojo' })).toThrow(/Color/);
    expect(() => addAccount({ label: 'X', color: '1 2 3', configDir: '/tmp/../tmp/dp-x' })).not.toThrow();
  });

  it('cambia la activa, quita cuentas y no deja quitar la actual', () => {
    const account = addAccount({ label: 'Personal', color: '1 2 3', configDir: '/tmp/dp-claude-personal' });
    setActive(account.id);
    expect(loadAccounts().activeId).toBe('personal');
    removeAccount('personal');
    expect(loadAccounts().activeId).toBe('default');
    expect(() => removeAccount('default')).toThrow(/no se puede quitar/);
    expect(() => setActive('no-existe')).toThrow(/inexistente/);
  });

  it('slugify quita acentos y símbolos', () => {
    expect(slugify('Cuenta Trabajo ÑÁ!')).toBe('cuenta-trabajo-na');
  });
});

describe('estado de sesión', () => {
  it('lee la respuesta de `claude auth status --json` sin inventar datos', () => {
    expect(parseAuthStatus('{"loggedIn":true,"email":"a@b.com","orgName":"Org","subscriptionType":"pro","authMethod":"claude.ai"}')).toEqual({ loggedIn: true, email: 'a@b.com', orgName: 'Org', plan: 'pro', method: 'claude.ai' });
    expect(parseAuthStatus('{"loggedIn":false,"authMethod":"none"}')).toMatchObject({ loggedIn: false, email: null });
    expect(parseAuthStatus('no es json')).toMatchObject({ loggedIn: false });
  });
});

describe('login', () => {
  it('extrae solo enlaces https de Anthropic de la salida de la CLI', () => {
    const output = 'Opening browser to sign in…\nIf the browser didn\'t open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=x\nPaste code here if prompted >';
    expect(extractLoginUrl(output)).toBe('https://claude.com/cai/oauth/authorize?code=true&client_id=x');
    expect(extractLoginUrl('visit https://evil.example.com/login')).toBeNull();
    expect(extractLoginUrl('sin enlaces')).toBeNull();
  });
  it('valida el formato del código antes de enviarlo a la CLI', () => {
    expect(validCode('abcDEF123_-~.#xyz987')).toBe(true);
    expect(validCode('corto')).toBe(false);
    expect(validCode('con espacios y\nsaltos')).toBe(false);
    expect(validCode('a; rm -rf /')).toBe(false);
  });
});

describe('uso (statusLine)', () => {
  const now = Date.parse('2026-10-27T18:00:00Z');
  const raw = (extra: Record<string, unknown> = {}) => ({
    capturedAt: '2026-10-27T17:58:00Z', model: 'Sonnet', costUsd: 1.5, contextUsedPercentage: 12, configDir: '/home/x/.claude',
    rateLimits: { five_hour: { used_percentage: 23.4, resets_at: now / 1000 + 3600 }, seven_day: { used_percentage: 40, resets_at: now / 1000 + 86_400 } }, ...extra,
  });

  it('calcula la antigüedad y conserva las dos ventanas vigentes', () => {
    expect(toSnapshot(raw(), now)).toMatchObject({ ageSeconds: 120, fiveHour: { usedPercentage: 23.4 }, sevenDay: { usedPercentage: 40 }, model: 'Sonnet' });
  });
  it('descarta una ventana cuyo reinicio ya pasó (como hace Claude Code) y tolera datos faltantes', () => {
    const expired = raw({ rateLimits: { five_hour: { used_percentage: 90, resets_at: now / 1000 - 10 }, seven_day: { used_percentage: 40, resets_at: now / 1000 + 100 } } });
    const snapshot = toSnapshot(expired, now)!;
    expect(snapshot.fiveHour).toBeNull();
    expect(snapshot.sevenDay).not.toBeNull();
    expect(toSnapshot(raw({ rateLimits: null }), now)).toMatchObject({ fiveHour: null, sevenDay: null });
    expect(toSnapshot({ capturedAt: 'nunca' }, now)).toBeNull();
  });
  it('empareja el dato con la cuenta por su carpeta de configuración', () => {
    mkdirSync(join(paths.data, 'claude-usage'), { recursive: true });
    writeFileSync(join(paths.data, 'claude-usage', 'default.json'), JSON.stringify(raw({ capturedAt: new Date().toISOString(), configDir: '/home/otro/.claude-trabajo', rateLimits: { five_hour: { used_percentage: 5, resets_at: Date.now() / 1000 + 600 } } })));
    const usage = readUsage([{ id: 'trabajo', label: 'T', color: '1 2 3', configDir: '/home/otro/.claude-trabajo' }, { id: 'personal', label: 'P', color: '1 2 3', configDir: '/home/otro/.claude-personal' }]);
    expect(usage['trabajo']?.fiveHour?.usedPercentage).toBe(5);
    expect(usage['personal']).toBeNull();
  });
});

describe('comandos de arranque', () => {
  it('genera terminal, alias y ajuste de VS Code con la carpeta de la cuenta', () => {
    const snippets = launchSnippets({ id: 'trabajo', label: 'T', color: '1 2 3', configDir: '/home/x/.claude-trabajo' });
    expect(snippets.terminal).toBe('CLAUDE_CONFIG_DIR=/home/x/.claude-trabajo claude');
    expect(snippets.vscodeCode).toContain('code .');
    expect(snippets.vscodeSetting).toContain('/home/x/.claude-trabajo');
    expect(launchSnippets({ id: 'default', label: 'a', color: '1 2 3', configDir: '/home/x/.claude' }).alias).toBeNull();
  });
});

describe('caché de límites de Claude Code (.claude.json)', () => {
  const now = Date.parse('2026-10-27T18:00:00Z');
  const home = mkdtempSync(join(tmpdir(), 'dp-home-'));
  const account = { id: 'default', label: 'Actual', color: '1 2 3', configDir: join(home, '.claude') };
  const write = (content: unknown, file = join(home, '.claude.json')) => writeFileSync(file, JSON.stringify(content));

  it('lee solo el bloque de uso y lo convierte al formato del panel', () => {
    write({
      oauthAccount: { emailAddress: 'secreto@x.com' },
      cachedUsageUtilization: { fetchedAtMs: now - 60_000, accountUuid: 'no-se-devuelve', utilization: { five_hour: { utilization: 54, resets_at: '2026-10-27T21:10:00Z' }, seven_day: { utilization: 94, resets_at: '2026-10-30T20:00:00Z' } } },
    });
    const snapshot = readCachedUsage(account, now, home)!;
    expect(snapshot).toMatchObject({ source: 'cache', ageSeconds: 60, fiveHour: { usedPercentage: 54 }, sevenDay: { usedPercentage: 94 } });
    expect(snapshot.fiveHour!.resetsAt).toBe(Date.parse('2026-10-27T21:10:00Z') / 1000);
    expect(JSON.stringify(snapshot)).not.toMatch(/secreto|no-se-devuelve/);
  });

  it('tolera archivo ausente, dañado o sin el bloque, y descarta ventanas vencidas', () => {
    expect(readCachedUsage({ ...account, id: 'otra', configDir: join(home, 'no-existe') }, now, home)).toBeNull();
    writeFileSync(join(home, '.claude.json'), '{ roto');
    expect(readCachedUsage(account, now, home)).toBeNull();
    write({ otraCosa: 1 });
    expect(readCachedUsage(account, now, home)).toBeNull();
    write({ cachedUsageUtilization: { fetchedAtMs: now, utilization: { five_hour: { utilization: 99, resets_at: '2026-10-27T17:00:00Z' }, seven_day: { utilization: 10, resets_at: '2026-10-30T00:00:00Z' } } } });
    expect(readCachedUsage(account, now, home)).toMatchObject({ fiveHour: null, sevenDay: { usedPercentage: 10 } });
  });

  it('la cuenta actual usa ~/.claude.json y las demás, el .claude.json de su carpeta', () => {
    expect(stateFileOf(account, '/home/x')).toBe('/home/x/.claude.json');
    expect(stateFileOf({ ...account, id: 'trabajo', configDir: '/home/x/.claude-trabajo' }, '/home/x')).toBe('/home/x/.claude-trabajo/.claude.json');
  });
});

describe('uso en vivo', () => {
  const now = Date.parse('2026-10-27T18:00:00Z');
  const home = mkdtempSync(join(tmpdir(), 'dp-live-'));
  mkdirSync(join(home, '.claude'), { recursive: true });
  const SECRET = 'token-secreto-de-prueba';
  const account = { id: 'default', label: 'Actual', color: '1 2 3', configDir: join(home, '.claude') };
  const config = defaultConfig('/x');
  const body = { five_hour: { utilization: 26, resets_at: '2026-10-27T20:00:00Z' }, seven_day: { utilization: 72, resets_at: '2026-11-01T06:00:00Z' }, extra_usage: { is_enabled: false } };
  const credentials = (expiresAt: number) => writeFileSync(join(home, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: SECRET, refreshToken: 'no-se-usa', expiresAt } }));
  const okFetcher = (calls: Array<{ url: string; auth: string | undefined }>) => async (url: string, init: { headers: Record<string, string> }) => (calls.push({ url, auth: init.headers['Authorization'] }), { ok: true, status: 200, json: async () => body });

  it('convierte la respuesta del servicio al formato del panel, sin datos de más', () => {
    const snapshot = liveToSnapshot(body, now)!;
    expect(snapshot).toMatchObject({ source: 'live', ageSeconds: 0, fiveHour: { usedPercentage: 26 }, sevenDay: { usedPercentage: 72 } });
    expect(JSON.stringify(snapshot)).not.toMatch(/extra_usage/);
    expect(liveToSnapshot({ nada: 1 }, now)).toBeNull();
  });

  it('manda el token por cabecera, no lo devuelve ni lo guarda, y consulta como mucho cada 2 minutos', async () => {
    clearLiveUsage();
    credentials(now + 3_600_000);
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    const first = await refreshLiveUsage(config, account, okFetcher(calls), now, home);
    await refreshLiveUsage(config, account, okFetcher(calls), now + 60_000, home);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.auth).toBe(`Bearer ${SECRET}`);
    expect(calls[0]!.url).not.toContain(SECRET);
    expect(JSON.stringify(first)).not.toContain(SECRET);
    await refreshLiveUsage(config, account, okFetcher(calls), now + 130_000, home);
    expect(calls).toHaveLength(2);
  });

  it('con token vencido o sin sesión no llama al servicio y explica por qué; apagado no consulta', async () => {
    clearLiveUsage();
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    credentials(now - 1000);
    expect((await refreshLiveUsage(config, account, okFetcher(calls), now, home)).problem).toMatch(/venció/);
    clearLiveUsage();
    expect((await refreshLiveUsage(config, { ...account, id: 'otra', configDir: join(home, 'no-existe') }, okFetcher(calls), now, home)).problem).toMatch(/Sin sesión/);
    clearLiveUsage();
    credentials(now + 3_600_000);
    const off = { ...config, claude: { ...config.claude, liveUsage: false } };
    expect((await refreshLiveUsage(off, account, okFetcher(calls), now, home)).problem).toMatch(/desactivada/);
    expect(calls).toHaveLength(0);
  });

  it('si el servicio rechaza el token o falla, conserva el último dato y avisa', async () => {
    clearLiveUsage();
    credentials(now + 3_600_000);
    const calls: Array<{ url: string; auth: string | undefined }> = [];
    await refreshLiveUsage(config, account, okFetcher(calls), now, home);
    const failing = async () => ({ ok: false, status: 401, json: async () => ({}) });
    const entry = await refreshLiveUsage(config, account, failing, now + 200_000, home);
    expect(entry.snapshot?.fiveHour?.usedPercentage).toBe(26);
    expect(entry.problem).toMatch(/rechazó el token/);
  });
});

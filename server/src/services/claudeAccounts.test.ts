import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { paths } from '../config.js';
import { ClaudeError, addAccount, extractLoginUrl, launchSnippets, loadAccounts, parseAuthStatus, readUsage, removeAccount, setActive, slugify, toSnapshot, validCode } from './claudeAccounts.js';

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

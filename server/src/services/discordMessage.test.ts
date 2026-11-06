import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DevPanelConfig } from '../config.js';

// Datos y variables de Claude en una carpeta temporal (se fijan ANTES de importar): nunca se toca lo real ni se postea a Discord.
const dataDir = mkdtempSync(join(tmpdir(), 'dp-discord-msg-'));
process.env['DEV_PANEL_DATA'] = dataDir;
process.env['DEV_PANEL_CLAUDE_ENV'] = join(dataDir, 'claude-test.env');
const { resolvePeople, messageContent, previewThreadMessage, sendThreadMessage } = await import('./discordMessage.js');

const PEOPLE = { Mariano: '111111111111111111', Álvaro: '222222222222222222' };
const TOKEN = 'token-inventado-solo-para-tests';
const THREAD = '333333333333333333';

describe('mensaje al hilo: piezas puras', () => {
  it('resuelve nombres sin distinguir mayúsculas ni tildes, sin repetir, y avisa los que no conoce', () => {
    expect(resolvePeople(PEOPLE, ['mariano', 'ALVARO', 'Mariano', 'Zoe'])).toEqual({
      mentioned: [{ name: 'Mariano', id: PEOPLE.Mariano }, { name: 'Álvaro', id: PEOPLE['Álvaro'] }],
      unknown: ['Zoe'],
    });
  });

  it('las menciones van primero y el texto después', () => {
    expect(messageContent('  Ya subí las correcciones  ', [{ id: '1' }, { id: '2' }])).toBe('<@1> <@2> Ya subí las correcciones');
    expect(messageContent('Hola', [])).toBe('Hola');
  });
});

describe('mensaje al hilo: vista previa y envío (bot simulado)', () => {
  const extra = join(dataDir, 'extra');
  let config: DevPanelConfig;
  beforeAll(async () => {
    writeFileSync(join(dataDir, 'claude-test.env'), `DISCORD_BOT_TOKEN=${TOKEN}\n`);
    const { defaultConfig } = await import('../config.js');
    config = defaultConfig('/tmp/x') as DevPanelConfig;
    config.paths.extra = extra;
    config.paths.daily = join(extra, 'daily');
    config.discord = { ...config.discord, botTokenVar: 'DISCORD_BOT_TOKEN', people: PEOPLE };
    mkdirSync(join(extra, '33526-pendientes-firma'), { recursive: true });
    writeFileSync(join(extra, '33526-pendientes-firma', 'ticket.json'), JSON.stringify({ ticket: '33526', titulo: 'Pestañas', url: 'https://r/issues/33526', repos: ['front'], mrs: [] }));
  });
  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  const withThread = { findThread: async () => ({ name: '[Ticket #33526] x', link: `https://discord.com/channels/999999999999999999/${THREAD}`, replies: 0 }) };
  const noThread = { findThread: async () => null };
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
  const bot = (status = 200, body: unknown = { id: '444444444444444444' }) => async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: status < 300, status, json: async () => body };
  };

  it('la vista previa resuelve el hilo existente y las menciones, y no envía nada', async () => {
    calls.length = 0;
    const preview = await previewThreadMessage(config, '33526-pendientes-firma', { text: 'Ya están las correcciones', to: ['mariano'] }, withThread);
    expect(preview).toMatchObject({ ticket: '33526', threadId: THREAD, content: '<@111111111111111111> Ya están las correcciones', problems: [], people: ['Mariano', 'Álvaro'] });
    expect(calls).toEqual([]);
  });

  it('marca como problema: sin hilo, sin texto, nombre desconocido o mensaje demasiado largo', async () => {
    expect((await previewThreadMessage(config, '33526-pendientes-firma', { text: 'x', to: [] }, noThread)).problems).toEqual(['El ticket todavía no tiene hilo en el foro de Discord']);
    expect((await previewThreadMessage(config, '33526-pendientes-firma', { text: '  ', to: [] }, withThread)).problems).toEqual(['Escribí el mensaje']);
    expect((await previewThreadMessage(config, '33526-pendientes-firma', { text: 'x', to: ['Zoe'] }, withThread)).problems[0]).toContain('No tengo el Discord de: Zoe');
    expect((await previewThreadMessage(config, '33526-pendientes-firma', { text: 'x'.repeat(1801), to: [] }, withThread)).problems[0]).toContain('muy largo');
  });

  it('sin la confirmación no envía', async () => {
    calls.length = 0;
    await expect(sendThreadMessage(config, '33526-pendientes-firma', { text: 'Hola', to: [] }, { confirm: false }, { ...withThread, botPost: bot() })).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  it('envía al hilo con el token del bot, solo menciona a quienes nombraste y sin tarjetas de enlaces', async () => {
    calls.length = 0;
    const result = await sendThreadMessage(config, '33526-pendientes-firma', { text: 'Ya subí las correcciones @everyone', to: ['Mariano'] }, { confirm: true }, { ...withThread, botPost: bot() });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', url: `https://discord.com/api/v10/channels/${THREAD}/messages` });
    expect(calls[0]!.headers['Authorization']).toBe(`Bot ${TOKEN}`);
    expect(calls[0]!.body).toMatchObject({ flags: 4, allowed_mentions: { parse: [], users: [PEOPLE.Mariano] } });
    expect(String(calls[0]!.body['content'])).toBe('<@111111111111111111> Ya subí las correcciones @everyone');
    expect(result).toEqual({ messageId: '444444444444444444', link: `https://discord.com/channels/999999999999999999/${THREAD}/444444444444444444` });
  });

  it('sin hilo o con un problema no llama a Discord (409)', async () => {
    calls.length = 0;
    await expect(sendThreadMessage(config, '33526-pendientes-firma', { text: 'Hola', to: [] }, { confirm: true }, { ...noThread, botPost: bot() })).rejects.toMatchObject({ status: 409 });
    await expect(sendThreadMessage(config, '33526-pendientes-firma', { text: 'Hola', to: ['Zoe'] }, { confirm: true }, { ...withThread, botPost: bot() })).rejects.toMatchObject({ status: 409 });
    expect(calls).toEqual([]);
  });

  it('si Discord rechaza el envío, el error dice por qué y nunca incluye el token', async () => {
    const error = await sendThreadMessage(config, '33526-pendientes-firma', { text: 'Hola', to: [] }, { confirm: true }, { ...withThread, botPost: bot(403, { message: 'Missing Permissions', code: 50013 }) }).catch((e: Error) => e);
    expect(error).toMatchObject({ status: 502 });
    expect((error as Error).message).toContain('Missing Permissions (código 50013)');
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('sin el token del bot lo avisa en la vista previa', async () => {
    const sinToken = { ...config, discord: { ...config.discord, botTokenVar: 'OTRA_VARIABLE' } } as DevPanelConfig;
    expect((await previewThreadMessage(sinToken, '33526-pendientes-firma', { text: 'x', to: [] }, withThread)).problems[0]).toContain('Falta el token del bot');
  });
});

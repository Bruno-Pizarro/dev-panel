import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { DevPanelConfig } from '../config.js';

// El token y los datos van a una carpeta temporal (se fija ANTES de importar): nunca se toca el archivo real de variables ni Discord.
const dir = mkdtempSync(join(tmpdir(), 'dp-bot-'));
const envFile = join(dir, 'claude-test.env');
process.env['DEV_PANEL_DATA'] = dir;
process.env['DEV_PANEL_CLAUDE_ENV'] = envFile;
const { listThreads, threadMessages, resetThreadCache, snowflakeDate, ticketOf } = await import('./discordBot.js');
const { defaultConfig } = await import('../config.js');

const CHANNEL = '1546517490127872020';
const GUILD = '999000111222333444';
const APPROVED = '1546906941333438594';
const TOKEN = 'token-inventado-del-bot-1234567890';

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const config = (): DevPanelConfig => {
  const base = defaultConfig('/tmp/x') as DevPanelConfig;
  base.discord = { ...base.discord, channelId: CHANNEL, approvedTag: APPROVED };
  return base;
};

// Ids con fecha conocida: (ms desde 2015-01-01) << 22
const idAt = (iso: string) => String((BigInt(Date.parse(iso)) - 1_420_070_400_000n) << 22n);

const calls: string[] = [];
const authSeen: string[] = [];
const discord = (overrides: Record<string, { status?: number; body: unknown }> = {}) => async (url: string, init: { headers: Record<string, string> }) => {
  calls.push(url.replace('https://discord.com/api/v10', ''));
  authSeen.push(init.headers['Authorization'] ?? '');
  const path = url.replace('https://discord.com/api/v10', '');
  const answer = Object.entries(overrides).filter(([prefix]) => path.startsWith(prefix)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
  const status = answer?.status ?? 200;
  const bodies: Record<string, unknown> = {
    [`/channels/${CHANNEL}`]: { guild_id: GUILD, available_tags: [{ id: APPROVED, name: 'Estado: Testeado' }, { id: '1546517585384972329', name: 'Front' }] },
    [`/guilds/${GUILD}/threads/active`]: { threads: [
      { id: idAt('2026-11-02T10:00:00Z'), name: '[Ticket #33528] Notificaciones', parent_id: CHANNEL, message_count: 3, last_message_id: idAt('2026-11-05T18:00:00Z'), applied_tags: ['1546517585384972329'], thread_metadata: { archived: false } },
      { id: idAt('2026-11-01T10:00:00Z'), name: 'Hilo de otro canal', parent_id: '555000555000555', message_count: 9, thread_metadata: { archived: false } },
    ] },
    [`/channels/${CHANNEL}/threads/archived/public`]: { threads: [
      { id: idAt('2026-10-29T10:00:00Z'), name: '[Ticket #33526] Pendientes de firma', parent_id: CHANNEL, message_count: 6, last_message_id: idAt('2026-11-02T18:39:00Z'), applied_tags: [APPROVED, '1546517585384972329'], thread_metadata: { archived: true } },
      { id: idAt('2026-10-20T10:00:00Z'), name: 'Sin número de ticket', parent_id: CHANNEL, message_count: 1, thread_metadata: { archived: true } },
    ] },
  };
  const key = Object.keys(bodies).filter((prefix) => path.startsWith(prefix)).sort((a, b) => b.length - a.length)[0];
  return { ok: status < 300, status, json: async () => answer?.body ?? (key ? bodies[key] : {}) };
};

beforeEach(() => {
  resetThreadCache();
  calls.length = 0;
  authSeen.length = 0;
  writeFileSync(envFile, `DISCORD_BOT_TOKEN=${TOKEN}\n`);
});

describe('bot de Discord (solo lectura): piezas puras', () => {
  it('saca el número de ticket del título y la fecha de un id de Discord', () => {
    expect(ticketOf('[Ticket #33526] Pestaña Pendientes de firma')).toBe('33526');
    expect(ticketOf('#33527 Firmas por legajo')).toBe('33527');
    expect(ticketOf('Sin número')).toBeNull();
    expect(snowflakeDate(idAt('2026-11-05T18:00:00Z'))).toBe('2026-11-05T18:00:00.000Z');
    expect(snowflakeDate('no-es-un-id')).toBeNull();
    expect(snowflakeDate(null)).toBeNull();
  });
});

describe('bot de Discord: hilos del foro', () => {
  it('lista los hilos del foro (activos y archivados) con ticket, etiquetas por nombre, respuestas, aprobado y enlace; ignora los de otros canales', async () => {
    const result = await listThreads(config(), { fetcher: discord() });
    expect(result).toMatchObject({ configured: true, problem: null });
    expect(result.threads.map((thread) => [thread.ticket, thread.replies, thread.approved, thread.archived])).toEqual([[ '33528', 2, false, false], ['33526', 5, true, true], [null, 0, false, true]]);
    const notifications = result.threads.find((thread) => thread.ticket === '33528')!;
    expect(notifications.tags).toEqual(['Front']);
    expect(notifications.lastActivityAt).toBe('2026-11-05T18:00:00.000Z');
    expect(notifications.link).toBe(`https://discord.com/channels/${GUILD}/${notifications.id}`);
    expect(result.threads.find((thread) => thread.ticket === '33526')!.tags).toEqual(['Estado: Testeado', 'Front']);
    expect(result.threads.some((thread) => thread.name === 'Hilo de otro canal')).toBe(false);
  });

  it('solo lee: todas las llamadas son GET a rutas del canal configurado y usan el token del bot, que no sale en la respuesta', async () => {
    const result = await listThreads(config(), { fetcher: discord() });
    expect(calls).toEqual([`/channels/${CHANNEL}`, `/guilds/${GUILD}/threads/active`, `/channels/${CHANNEL}/threads/archived/public?limit=100`]);
    expect(authSeen.every((value) => value === `Bot ${TOKEN}`)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('guarda 5 minutos y vuelve a consultar con «force» o pasado el tiempo', async () => {
    const t0 = 1_000_000;
    await listThreads(config(), { fetcher: discord(), now: t0 });
    await listThreads(config(), { fetcher: discord(), now: t0 + 60_000 });
    expect(calls).toHaveLength(3);
    await listThreads(config(), { fetcher: discord(), now: t0 + 60_000, force: true });
    expect(calls).toHaveLength(6);
    await listThreads(config(), { fetcher: discord(), now: t0 + 6 * 60_000 });
    expect(calls).toHaveLength(9);
  });

  it('sin token o sin canal no llama a Discord y dice qué falta', async () => {
    writeFileSync(envFile, 'OTRA=1\n');
    expect(await listThreads(config(), { fetcher: discord() })).toMatchObject({ configured: false, threads: [], problem: expect.stringContaining('DISCORD_BOT_TOKEN') });
    writeFileSync(envFile, `DISCORD_BOT_TOKEN=${TOKEN}\n`);
    const noChannel = config();
    noChannel.discord.channelId = '';
    expect(await listThreads(noChannel, { fetcher: discord() })).toMatchObject({ configured: false, problem: expect.stringContaining('canal') });
    expect(calls).toEqual([]);
  });

  it('si Discord falla informa el motivo; con algo guardado sigue mostrando lo último', async () => {
    const down = discord({ [`/channels/${CHANNEL}`]: { status: 403, body: { message: 'Missing Access', code: 50001 } } });
    expect(await listThreads(config(), { fetcher: down })).toMatchObject({ configured: true, threads: [], problem: expect.stringContaining('Missing Access') });
    await listThreads(config(), { fetcher: discord(), force: true });
    const again = await listThreads(config(), { fetcher: down, force: true });
    expect(again.threads).toHaveLength(3);
    expect(again.problem).toContain('lo último que se leyó');
  });
});

describe('bot de Discord: mensajes de un hilo', () => {
  const thread = idAt('2026-11-02T10:00:00Z');
  const withMessages = (messages: unknown[]) => discord({ [`/channels/${thread}/messages`]: { body: messages } });

  it('devuelve los mensajes del más viejo al más nuevo, con secretos tapados, recortados y con reacciones', async () => {
    const result = await threadMessages(config(), thread, {
      fetcher: withMessages([
        { author: { username: 'gentleman', global_name: 'Gentleman Programming' }, timestamp: '2026-11-02T18:39:00Z', content: `Aprobado. Mi token es ghp_${'a'.repeat(36)} pasalo`, reactions: [{ emoji: { name: '👌' }, count: 1 }], attachments: [] },
        { author: { username: 'scrumguy' }, timestamp: '2026-11-02T13:57:00Z', content: 'x'.repeat(3000), attachments: [{}] },
      ]),
      limit: 10,
    });
    expect(result.map((message) => message.author)).toEqual(['scrumguy', 'Gentleman Programming']);
    expect(result[0]!.content.length).toBeLessThan(1600);
    expect(result[0]!.attachments).toBe(1);
    expect(result[1]!.content).not.toContain('ghp_');
    expect(result[1]!.reactions).toEqual(['👌 ×1']);
    expect(calls.at(-1)).toBe(`/channels/${thread}/messages?limit=10`);
  });

  it('solo lee hilos del foro configurado: un id de otro canal o inválido se rechaza sin pedir mensajes', async () => {
    await expect(threadMessages(config(), '123456789012345678', { fetcher: withMessages([]) })).rejects.toMatchObject({ status: 404 });
    await expect(threadMessages(config(), '../channels/1', { fetcher: withMessages([]) })).rejects.toMatchObject({ status: 400 });
    expect(calls.some((path) => path.includes('/messages'))).toBe(false);
  });

  it('topa el límite en 50 mensajes', async () => {
    await threadMessages(config(), thread, { fetcher: withMessages([]), limit: 500 });
    expect(calls.at(-1)).toBe(`/channels/${thread}/messages?limit=50`);
  });
});

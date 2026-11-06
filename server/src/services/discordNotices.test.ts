import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { DevPanelConfig } from '../config.js';
import type { ForumThread, ThreadMessage } from './discordBot.js';

// Datos y variables a una carpeta temporal, fijado ANTES de importar; Discord simulado: nunca se llama a la API real.
const dir = mkdtempSync(join(tmpdir(), 'dp-dnotices-'));
const envFile = join(dir, 'claude-test.env');
process.env['DEV_PANEL_DATA'] = dir;
process.env['DEV_PANEL_CLAUDE_ENV'] = envFile;
const { diffThreads, noticeForThread, getDiscordNotices } = await import('./discordNotices.js');
const { resetThreadCache } = await import('./discordBot.js');
const { defaultConfig } = await import('../config.js');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ME = '111222333444555666';
const thread = (over: Partial<ForumThread> = {}): ForumThread => ({ id: 'T1', name: '[Ticket #33528] Notificaciones', ticket: '33528', tags: [], replies: 1, lastActivityAt: '2026-11-05T10:00:00.000Z', createdAt: '2026-11-04T10:00:00.000Z', archived: false, approved: false, link: 'https://discord.com/channels/1/T1', ...over });
const message = (over: Partial<ThreadMessage> = {}): ThreadMessage => ({ id: 'M', author: 'Gentleman Programming', authorId: '999', mentions: [], at: '2026-11-05T12:00:00.000Z', content: 'revisando', reactions: [], attachments: 0, ...over });
const mine = new Set(['33528']);

describe('avisos de Discord: piezas puras', () => {
  it('diffThreads separa lo que tuvo novedades y lo aprobado (solo de mis tickets), y arma la foto nueva', () => {
    const seen = { T1: { replies: 1, lastActivityAt: '2026-11-05T10:00:00.000Z', approved: false }, T2: { replies: 4, lastActivityAt: '2026-11-01T10:00:00.000Z', approved: false } };
    const result = diffThreads(seen, [thread({ replies: 3, lastActivityAt: '2026-11-05T12:00:00.000Z', approved: true }), thread({ id: 'T2', ticket: '33000', replies: 4, lastActivityAt: '2026-11-01T10:00:00.000Z' }), thread({ id: 'T3', ticket: '40000', replies: 2, createdAt: '2026-11-05T09:00:00.000Z' }), thread({ id: 'T4', ticket: '40001', replies: 0 })], mine);
    expect(result.changed.map((entry) => [entry.thread.id, entry.since])).toEqual([['T1', '2026-11-05T10:00:00.000Z'], ['T3', '2026-11-05T09:00:00.000Z']]);
    expect(result.approved.map((entry) => entry.id)).toEqual(['T1']);
    expect(Object.keys(result.next)).toEqual(['T1', 'T2', 'T3', 'T4']);
    // aprobado de un ticket que no es mío no avisa
    expect(diffThreads({ T2: { replies: 1, lastActivityAt: 'x', approved: false } }, [thread({ id: 'T2', ticket: '33000', approved: true })], mine).approved).toEqual([]);
  });

  it('el aviso de un hilo: escribieron en un ticket mío, o me mencionaron en cualquiera; mis mensajes no cuentan', () => {
    const since = '2026-11-05T10:00:00.000Z';
    expect(noticeForThread(thread(), [message({ content: 'Aprobado, solo un detalle de tests' })], since, ME, mine)).toMatchObject({ id: 'discord-T1', kind: 'discord', level: 'important', title: 'Gentleman Programming escribió en #33528', link: 'https://discord.com/channels/1/T1' });
    // solo mensajes míos o viejos: nada
    expect(noticeForThread(thread(), [message({ authorId: ME })], since, ME, mine)).toBeNull();
    expect(noticeForThread(thread(), [message({ at: '2026-11-05T09:00:00.000Z' })], since, ME, mine)).toBeNull();
    // hilo de un ticket ajeno: solo si me mencionan
    const other = thread({ ticket: '33000', name: '[Ticket #33000] Otro' });
    expect(noticeForThread(other, [message()], since, ME, mine)).toBeNull();
    expect(noticeForThread(other, [message({ mentions: [ME], content: `<@${ME}> mirá esto` })], since, ME, mine)).toMatchObject({ title: 'Gentleman Programming te mencionó en #33000', detail: expect.stringContaining('@alguien mirá esto') });
    expect(noticeForThread(other, [message({ content: `<@!${ME}> hola` })], since, ME, mine)?.title).toContain('te mencionó');
  });

  it('el texto del aviso es plano: sin formato de Discord ni enlaces entre <…>', () => {
    const notice = noticeForThread(thread(), [message({ content: '**Ojo** el MR <https://g/front/-/merge_requests/165#note_5476>' })], '2026-11-05T10:00:00.000Z', ME, mine)!;
    expect(notice.detail).toContain('https://g/front/-/merge_requests/165#note_5476');
    expect(notice.detail).not.toContain('<https');
  });
});

describe('avisos de Discord: foto, novedades y aprobaciones (Discord simulado)', () => {
  const CHANNEL = '1546517490127872020';
  const GUILD = '999000111222333444';
  const APPROVED = '1546906941333438594';
  const idAt = (iso: string) => String((BigInt(Date.parse(iso)) - 1_420_070_400_000n) << 22n);
  const T1 = idAt('2026-11-02T10:00:00Z');
  const T2 = idAt('2026-11-01T10:00:00Z');
  let state: { t1Replies: number; t1Last: string; t1Tags: string[]; messages: unknown[] };
  let calls: string[] = [];
  const fake = async (url: string) => {
    const path = url.replace('https://discord.com/api/v10', '');
    calls.push(path);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (path.startsWith(`/channels/${CHANNEL}/threads/archived`)) return json({ threads: [] });
    if (path.startsWith(`/channels/${CHANNEL}`)) return json({ guild_id: GUILD, available_tags: [] });
    if (path.startsWith(`/guilds/${GUILD}/threads/active`)) {
      return json({ threads: [
        { id: T1, name: '[Ticket #33528] Notificaciones', parent_id: CHANNEL, message_count: state.t1Replies + 1, last_message_id: idAt(state.t1Last), applied_tags: state.t1Tags, thread_metadata: { archived: false } },
        { id: T2, name: '[Ticket #33000] Ajeno', parent_id: CHANNEL, message_count: 2, last_message_id: idAt('2026-11-01T12:00:00Z'), applied_tags: [], thread_metadata: { archived: false } },
      ] });
    }
    if (path.startsWith(`/channels/${T1}/messages`)) return json(state.messages);
    return json({});
  };
  const config = (): DevPanelConfig => {
    const base = defaultConfig('/tmp/x') as DevPanelConfig;
    base.discord = { ...base.discord, channelId: CHANNEL, approvedTag: APPROVED, userId: ME };
    return base;
  };
  const run = (now: number) => getDiscordNotices(config(), { fetcher: fake as never, mine, now });
  const T0 = Date.parse('2026-11-05T12:00:00Z');

  beforeEach(() => {
    resetThreadCache();
    calls = [];
  });

  it('la primera vez solo toma la foto (no avisa de nada viejo); después avisa lo nuevo una sola vez y lo conserva', async () => {
    writeFileSync(envFile, 'DISCORD_BOT_TOKEN=token-inventado-1234567890\n');
    state = { t1Replies: 1, t1Last: '2026-11-04T12:00:00Z', t1Tags: [], messages: [] };
    expect(await run(T0)).toEqual({ notices: [], errors: [] });
    expect(calls.some((path) => path.includes('/messages'))).toBe(false);

    // llega un mensaje nuevo al hilo de mi ticket
    resetThreadCache();
    state = { t1Replies: 2, t1Last: '2026-11-05T13:00:00Z', t1Tags: [], messages: [
      { id: '2', author: { id: '999', username: 'gentleman', global_name: 'Gentleman Programming' }, timestamp: '2026-11-05T13:00:00Z', content: 'Aprobado, falta un detalle', mentions: [], reactions: [], attachments: [] },
      { id: '1', author: { id: ME, username: 'bruno' }, timestamp: '2026-11-04T12:00:00Z', content: 'subí los cambios', mentions: [], reactions: [], attachments: [] },
    ] };
    const second = await run(T0 + 3_600_000);
    expect(second.notices).toHaveLength(1);
    expect(second.notices[0]).toMatchObject({ id: `discord-${T1}`, title: 'Gentleman Programming escribió en #33528', level: 'important' });
    // el hilo ajeno (#33000) no avisa

    // sin cambios no vuelve a consultar mensajes, pero el aviso sigue (36 h)
    resetThreadCache();
    calls = [];
    const third = await run(T0 + 2 * 3_600_000);
    expect(calls.some((path) => path.includes('/messages'))).toBe(false);
    expect(third.notices.map((notice) => notice.id)).toEqual([`discord-${T1}`]);

    // pasadas 36 horas se va
    resetThreadCache();
    expect((await run(T0 + 40 * 3_600_000)).notices).toEqual([]);
  });

  it('avisa cuando le ponen «Estado: Testeado» a un ticket mío', async () => {
    resetThreadCache();
    state = { t1Replies: 2, t1Last: '2026-11-05T13:00:00Z', t1Tags: [APPROVED], messages: [] };
    const result = await run(T0 + 41 * 3_600_000);
    expect(result.notices.map((notice) => notice.id)).toEqual([`discord-approved-${T1}`]);
    expect(result.notices[0]!.title).toBe('#33528 quedó aprobado en Discord');
  });

  it('sin tu id de usuario avisa que falta; sin bot no dice nada; con Discord caído informa el motivo', async () => {
    resetThreadCache();
    const noUser = config();
    noUser.discord.userId = '';
    state = { t1Replies: 2, t1Last: '2026-11-05T13:00:00Z', t1Tags: [APPROVED], messages: [] };
    const result = await getDiscordNotices(noUser, { fetcher: fake as never, mine, now: T0 + 42 * 3_600_000 });
    expect(result.errors.map((error) => error.message).join(' ')).toContain('id de usuario');
    writeFileSync(envFile, 'OTRA=1\n');
    resetThreadCache();
    expect(await run(T0)).toEqual({ notices: [], errors: [] });
    writeFileSync(envFile, 'DISCORD_BOT_TOKEN=token-inventado-1234567890\n');
    resetThreadCache();
    const down = async () => ({ ok: false, status: 500, json: async () => ({ message: 'boom' }) });
    const failed = await getDiscordNotices(config(), { fetcher: down as never, mine, now: T0 + 50 * 3_600_000 });
    expect(failed.errors[0]!.message).toContain('500');
  });
});

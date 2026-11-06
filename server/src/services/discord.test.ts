import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DevPanelConfig } from '../config.js';

// Los datos van a una carpeta temporal (DEV_PANEL_DATA se fija ANTES de importar el servicio): nunca a la carpeta `data/` real.
const dataDir = mkdtempSync(join(tmpdir(), 'dp-discord-'));
process.env['DEV_PANEL_DATA'] = dataDir;
process.env['DEV_PANEL_CLAUDE_ENV'] = join(dataDir, 'claude-test.env');
const { buildDraft, tagsFor, threadMessage, validWebhook, previewThread, publishThread } = await import('./discord.js');

const TAGS = { front: '111111', legajo: '222222', documentos: '333333', 'file-manager': '444444' };

describe('hilo de Discord: piezas puras', () => {
  it('el mensaje sigue el formato del equipo: ticket y un repo: enlace por MR', () => {
    expect(threadMessage('https://r/issues/33526', [{ repo: 'front', iid: 165, url: 'https://g/front/-/merge_requests/165' }, { repo: 'legajo', iid: 65, url: 'https://g/legajo/-/merge_requests/65' }])).toBe(
      '🎫 **Ticket**: https://r/issues/33526\n\n📝 **Merge Requests**\nfront: https://g/front/-/merge_requests/165\nlegajo: https://g/legajo/-/merge_requests/65',
    );
  });

  it('las etiquetas son las de los repos involucrados, sin repetir; un repo sin etiqueta usa «Otro» o queda faltando', () => {
    expect(tagsFor(['front', 'legajo', 'front'], TAGS, '999999')).toEqual({ ids: ['111111', '222222'], missing: [] });
    expect(tagsFor(['front', 'zscripts'], TAGS, '999999')).toEqual({ ids: ['111111', '999999'], missing: [] });
    expect(tagsFor(['front', 'zscripts'], TAGS, '')).toEqual({ ids: ['111111'], missing: ['zscripts'] });
  });

  it('el borrador lleva el número de ticket en el título (cortado a 100) y las etiquetas de los repos del ticket y de sus MRs', () => {
    const config = { discord: { webhookVar: 'X', tags: TAGS, otherTag: '' } };
    const draft = buildDraft({ ticket: '33526', title: 'Pestaña Pendientes de firma en el Perfil', url: 'https://r/issues/33526', repos: ['front', 'legajo'], mrs: [{ repo: 'documentos', iid: 9, url: 'https://g/documentos/-/merge_requests/9' }] }, config);
    expect(draft.name).toBe('[Ticket #33526] Pestaña Pendientes de firma en el Perfil');
    expect(draft.tags).toEqual(['111111', '222222', '333333']);
    expect(buildDraft({ ticket: '1', title: 'x'.repeat(300), url: 'u', repos: ['front'], mrs: [] }, config).name.length).toBeLessThanOrEqual(100);
  });

  it('solo se aceptan webhooks de discord.com', () => {
    expect(validWebhook('https://discord.com/api/webhooks/1568222243467829352/abcdefghijklmnopqrstuvwxyz0123456789')).toBe(true);
    expect(validWebhook('https://evil.example/api/webhooks/1568222243467829352/abcdefghijklmnopqrstuvwxyz0123456789')).toBe(false);
    expect(validWebhook('http://discord.com/api/webhooks/1568222243467829352/abcdefghijklmnopqrstuvwxyz0123456789')).toBe(false);
    expect(validWebhook('https://discord.com/api/webhooks/1568222243467829352/abcdefghijklmnopqrstuvwxyz0123456789?x=1')).toBe(false);
  });
});

describe('hilo de Discord: vista previa y publicación (webhook simulado)', () => {
  const dir = dataDir;
  const extra = join(dir, 'extra');
  const WEBHOOK = 'https://discord.com/api/webhooks/1111111111111/inventadoinventadoinventado1234';
  let config: DevPanelConfig;
  beforeAll(async () => {
    writeFileSync(join(dataDir, 'claude-test.env'), `DISCORD_WEBHOOK_MR=${WEBHOOK}\n`);
    const { defaultConfig } = await import('../config.js');
    config = defaultConfig('/tmp/x') as DevPanelConfig;
    config.paths.extra = extra;
    config.paths.daily = join(extra, 'daily');
    config.userName = 'Bruno';
    config.discord = { webhookVar: 'DISCORD_WEBHOOK_MR', tags: TAGS, otherTag: '' };
    mkdirSync(join(extra, '33526-pendientes-firma'), { recursive: true });
    writeFileSync(join(extra, '33526-pendientes-firma', 'ticket.json'), JSON.stringify({ ticket: '33526', titulo: 'Pestaña Pendientes de firma en el Perfil', url: 'https://r/issues/33526', repos: ['front', 'legajo'], mrs: [{ repo: 'front', iid: 165, url: 'https://g/front/-/merge_requests/165' }] }));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const poster = (status = 200, body: unknown = { id: 'MSG1', channel_id: 'THREAD1', guild_id: 'GUILD1' }) => async (url: string, init: { method: string; body: string }) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    return { ok: status < 300, status, json: async () => body };
  };

  it('la vista previa dice qué se publicaría y nunca devuelve el webhook', () => {
    const preview = previewThread(config, '33526-pendientes-firma');
    expect(preview).toMatchObject({ webhookReady: true, ticket: '33526', action: 'create', problems: [] });
    expect(preview.draft!.name).toBe('[Ticket #33526] Pestaña Pendientes de firma en el Perfil');
    expect(preview.draft!.tags).toEqual(['111111', '222222']);
    expect(JSON.stringify(preview)).not.toContain('inventadoinventado');
  });

  it('sin confirmación no publica nada', async () => {
    calls.length = 0;
    await expect(publishThread(config, '33526-pendientes-firma', { confirm: false }, poster())).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });

  it('crea el hilo con título, mensaje, etiquetas y sin pingear a nadie, y recuerda el id', async () => {
    calls.length = 0;
    const result = await publishThread(config, '33526-pendientes-firma', { confirm: true }, poster());
    expect(result).toEqual({ action: 'created', threadId: 'THREAD1', link: 'https://discord.com/channels/GUILD1/THREAD1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe(`${WEBHOOK}?wait=true`);
    expect(calls[0]!.body).toMatchObject({ thread_name: '[Ticket #33526] Pestaña Pendientes de firma en el Perfil', applied_tags: ['111111', '222222'], username: 'Bruno · Dev Panel', allowed_mentions: { parse: [] } });
    expect(String(calls[0]!.body['content'])).toContain('front: https://g/front/-/merge_requests/165');
    expect(JSON.parse(readFileSync(join(dir, 'discord-threads.json'), 'utf8'))['33526']).toMatchObject({ threadId: 'THREAD1', messageId: 'MSG1' });
    expect(previewThread(config, '33526-pendientes-firma')).toMatchObject({ action: 'update', record: { link: 'https://discord.com/channels/GUILD1/THREAD1' } });
  });

  it('con el hilo ya creado edita el mensaje inicial con los MRs nuevos en vez de crear otro', async () => {
    writeFileSync(join(extra, '33526-pendientes-firma', 'ticket.json'), JSON.stringify({ ticket: '33526', titulo: 'Pestaña Pendientes de firma en el Perfil', url: 'https://r/issues/33526', repos: ['front', 'legajo'], mrs: [{ repo: 'front', iid: 165, url: 'https://g/front/-/merge_requests/165' }, { repo: 'legajo', iid: 65, url: 'https://g/legajo/-/merge_requests/65' }] }));
    calls.length = 0;
    const result = await publishThread(config, '33526-pendientes-firma', { confirm: true }, poster(200, {}));
    expect(result.action).toBe('updated');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe(`${WEBHOOK}/messages/MSG1?thread_id=THREAD1`);
    expect(String(calls[0]!.body['content'])).toContain('legajo: https://g/legajo/-/merge_requests/65');
    expect(calls[0]!.body).not.toHaveProperty('applied_tags');
  });

  it('si el hilo ya no existe en Discord olvida el vínculo y avisa, sin crear otro solo', async () => {
    calls.length = 0;
    await expect(publishThread(config, '33526-pendientes-firma', { confirm: true }, poster(404, {}))).rejects.toMatchObject({ status: 409 });
    expect(calls).toHaveLength(1);
    expect(previewThread(config, '33526-pendientes-firma').action).toBe('create');
  });

  it('no publica si a un repo le falta la etiqueta, si no hay MRs o si no hay webhook', async () => {
    mkdirSync(join(extra, '40000-otro'), { recursive: true });
    writeFileSync(join(extra, '40000-otro', 'ticket.json'), JSON.stringify({ ticket: '40000', titulo: 'Otro', url: 'https://r/issues/40000', repos: ['zscripts'], mrs: [{ repo: 'zscripts', iid: 1, url: 'https://g/z/-/merge_requests/1' }] }));
    calls.length = 0;
    await expect(publishThread(config, '40000-otro', { confirm: true }, poster())).rejects.toThrow(/zscripts/);
    mkdirSync(join(extra, '40001-sin-mrs'), { recursive: true });
    writeFileSync(join(extra, '40001-sin-mrs', 'ticket.json'), JSON.stringify({ ticket: '40001', titulo: 'Sin MRs', url: 'https://r/issues/40001', repos: ['front'] }));
    await expect(publishThread(config, '40001-sin-mrs', { confirm: true }, poster())).rejects.toThrow(/MRs/);
    writeFileSync(join(dataDir, 'claude-test.env'), 'OTRA=1\n');
    expect(previewThread(config, '33526-pendientes-firma')).toMatchObject({ webhookReady: false });
    await expect(publishThread(config, '33526-pendientes-firma', { confirm: true }, poster())).rejects.toThrow(/webhook/i);
    expect(calls).toEqual([]);
  });
});

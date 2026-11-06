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
      '🎫 **Ticket**: <https://r/issues/33526>\n\n📝 **Merge Requests**\nfront: <https://g/front/-/merge_requests/165>\nlegajo: <https://g/legajo/-/merge_requests/65>',
    );
  });

  it('con tu usuario de Discord suma una línea que te menciona; sin usuario, no', () => {
    const mrs = [{ repo: 'front', iid: 1, url: 'https://g/front/-/merge_requests/1' }];
    expect(threadMessage('https://r/issues/1', mrs, '123456789012345678').endsWith('\n\n👤 <@123456789012345678>')).toBe(true);
    expect(threadMessage('https://r/issues/1', mrs)).not.toContain('<@');
  });

  it('las etiquetas son las de los repos involucrados, sin repetir; un repo sin etiqueta usa «Otro» o queda faltando', () => {
    expect(tagsFor(['front', 'legajo', 'front'], TAGS, '999999')).toEqual({ ids: ['111111', '222222'], missing: [] });
    expect(tagsFor(['front', 'zscripts'], TAGS, '999999')).toEqual({ ids: ['111111', '999999'], missing: [] });
    expect(tagsFor(['front', 'zscripts'], TAGS, '')).toEqual({ ids: ['111111'], missing: ['zscripts'] });
  });

  it('el borrador lleva el número de ticket en el título (cortado a 100) y las etiquetas de los repos del ticket y de sus MRs', () => {
    const config = { discord: { webhookVar: 'X', tags: TAGS, otherTag: '', userId: '', botTokenVar: 'DISCORD_BOT_TOKEN', channelId: '', approvedTag: '' } };
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
    config.discord = { webhookVar: 'DISCORD_WEBHOOK_MR', tags: TAGS, otherTag: '', userId: '111222333444555666', botTokenVar: 'DISCORD_BOT_TOKEN', channelId: '', approvedTag: '' };
    mkdirSync(join(extra, '33526-pendientes-firma'), { recursive: true });
    writeFileSync(join(extra, '33526-pendientes-firma', 'ticket.json'), JSON.stringify({ ticket: '33526', titulo: 'Pestaña Pendientes de firma en el Perfil', url: 'https://r/issues/33526', repos: ['front', 'legajo'], mrs: [{ repo: 'front', iid: 165, url: 'https://g/front/-/merge_requests/165' }] }));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const poster = (status = 200, body: unknown = { id: 'MSG1', channel_id: 'THREAD1', guild_id: 'GUILD1' }) => async (url: string, init: { method: string; body?: string }) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : {} });
    return { ok: status < 300, status, json: async () => body };
  };
  /** Discord según el método: la comprobación del hilo (GET), la edición (PATCH) y la creación (POST) pueden responder distinto. */
  const byMethod = (answers: Record<string, number>) => async (url: string, init: { method: string; body?: string }) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : {} });
    const status = answers[init.method] ?? 200;
    return { ok: status < 300, status, json: async () => ({ id: 'MSG2', channel_id: 'THREAD2', guild_id: 'GUILD1' }) };
  };

  it('la vista previa dice qué se publicaría y nunca devuelve el webhook', async () => {
    const preview = await previewThread(config, '33526-pendientes-firma', poster());
    expect(preview).toMatchObject({ webhookReady: true, ticket: '33526', action: 'create', problems: [], hasMrs: true, forgotten: false });
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
    expect(calls[0]!.body).toMatchObject({ thread_name: '[Ticket #33526] Pestaña Pendientes de firma en el Perfil', applied_tags: ['111111', '222222'], username: 'Bruno · Dev Panel', flags: 4, allowed_mentions: { parse: [], users: ['111222333444555666'] } });
    expect(String(calls[0]!.body['content'])).toContain('front: <https://g/front/-/merge_requests/165>');
    expect(String(calls[0]!.body['content'])).toContain('👤 <@111222333444555666>');
    expect(JSON.parse(readFileSync(join(dir, 'discord-threads.json'), 'utf8'))['33526']).toMatchObject({ threadId: 'THREAD1', messageId: 'MSG1' });
    expect(await previewThread(config, '33526-pendientes-firma', poster())).toMatchObject({ action: 'update', record: { link: 'https://discord.com/channels/GUILD1/THREAD1' }, forgotten: false });
  });

  it('con el hilo ya creado edita el mensaje inicial con los MRs nuevos en vez de crear otro', async () => {
    writeFileSync(join(extra, '33526-pendientes-firma', 'ticket.json'), JSON.stringify({ ticket: '33526', titulo: 'Pestaña Pendientes de firma en el Perfil', url: 'https://r/issues/33526', repos: ['front', 'legajo'], mrs: [{ repo: 'front', iid: 165, url: 'https://g/front/-/merge_requests/165' }, { repo: 'legajo', iid: 65, url: 'https://g/legajo/-/merge_requests/65' }] }));
    calls.length = 0;
    const result = await publishThread(config, '33526-pendientes-firma', { confirm: true }, poster(200, {}));
    expect(result.action).toBe('updated');
    // primero comprueba que el hilo exista (GET) y después edita su mensaje inicial (PATCH)
    expect(calls.map((call) => call.method)).toEqual(['GET', 'PATCH']);
    const patch = calls[1]!;
    expect(patch.url).toBe(`${WEBHOOK}/messages/MSG1?thread_id=THREAD1`);
    expect(String(patch.body['content'])).toContain('legajo: <https://g/legajo/-/merge_requests/65>');
    expect(patch.body['allowed_mentions']).toEqual({ parse: [], users: ['111222333444555666'] });
    expect(patch.body).not.toHaveProperty('applied_tags');
  });

  it('la vista previa comprueba en Discord que el hilo siga existiendo: si lo borraron vuelve a «sin crear»', async () => {
    calls.length = 0;
    const gone = await previewThread(config, '33526-pendientes-firma', byMethod({ GET: 404 }));
    expect(calls[0]).toMatchObject({ method: 'GET', url: `${WEBHOOK}/messages/MSG1?thread_id=THREAD1` });
    expect(gone).toMatchObject({ action: 'create', record: null, forgotten: true });
    // y quedó olvidado: la próxima vista previa ya no lo busca
    calls.length = 0;
    expect(await previewThread(config, '33526-pendientes-firma', poster())).toMatchObject({ action: 'create', forgotten: false });
    expect(calls).toEqual([]);
  });

  it('un error de Discord o un corte de red al comprobar NO borra el vínculo', async () => {
    await publishThread(config, '33526-pendientes-firma', { confirm: true }, poster());
    expect(await previewThread(config, '33526-pendientes-firma', byMethod({ GET: 500 }))).toMatchObject({ action: 'update', forgotten: false });
    const offline = async () => {
      throw new Error('sin red');
    };
    expect(await previewThread(config, '33526-pendientes-firma', offline)).toMatchObject({ action: 'update', forgotten: false });
  });

  it('si el hilo se borró entre la comprobación y el cambio, se crea de nuevo en la misma publicación', async () => {
    calls.length = 0;
    const result = await publishThread(config, '33526-pendientes-firma', { confirm: true }, byMethod({ GET: 200, PATCH: 404, POST: 200 }));
    expect(result).toMatchObject({ action: 'created', threadId: 'THREAD2' });
    expect(calls.map((call) => call.method)).toEqual(['GET', 'PATCH', 'POST']);
    expect(JSON.parse(readFileSync(join(dir, 'discord-threads.json'), 'utf8'))['33526']).toMatchObject({ threadId: 'THREAD2', messageId: 'MSG2' });
  });

  it('también cuenta como borrado si Discord contesta «Unknown Channel» o «Unknown Message» con otro estado', async () => {
    await publishThread(config, '33526-pendientes-firma', { confirm: true }, poster());
    const unknown = (code: number, status = 400) => async (url: string, init: { method: string; body?: string }) => {
      calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : {} });
      return init.method === 'POST' ? { ok: true, status: 200, json: async () => ({ id: 'MSG3', channel_id: 'THREAD3', guild_id: 'GUILD1' }) } : { ok: false, status, json: async () => ({ message: 'Unknown Channel', code }) };
    };
    expect(await previewThread(config, '33526-pendientes-firma', unknown(10003))).toMatchObject({ action: 'create', forgotten: true });
    await publishThread(config, '33526-pendientes-firma', { confirm: true }, poster());
    calls.length = 0;
    const result = await publishThread(config, '33526-pendientes-firma', { confirm: true }, unknown(10008));
    expect(result).toMatchObject({ action: 'created', threadId: 'THREAD3' });
  });

  it('un rechazo de Discord que no es «borrado» muestra lo que contestó, sin la URL del webhook', async () => {
    await publishThread(config, '33526-pendientes-firma', { confirm: true }, byMethod({ GET: 200 })).catch(() => undefined);
    const rejecting = async (_url: string, init: { method: string; body?: string }) =>
      init.method === 'PATCH' ? { ok: false, status: 403, json: async () => ({ message: 'Missing Permissions', code: 50013 }) } : { ok: true, status: 200, json: async () => ({ id: 'MSG4', channel_id: 'THREAD4' }) };
    const failure = publishThread(config, '33526-pendientes-firma', { confirm: true }, rejecting);
    await expect(failure).rejects.toThrow(/403.*Missing Permissions/);
    await expect(failure).rejects.not.toThrow(/inventadoinventado/);
  });

  it('si el hilo ya no existe al publicar, se crea uno nuevo sin pasos extra', async () => {
    calls.length = 0;
    const result = await publishThread(config, '33526-pendientes-firma', { confirm: true }, byMethod({ GET: 404, POST: 200 }));
    expect(result.action).toBe('created');
    expect(calls.map((call) => call.method)).toEqual(['GET', 'POST']);
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
    expect(await previewThread(config, '33526-pendientes-firma')).toMatchObject({ webhookReady: false });
    await expect(publishThread(config, '33526-pendientes-firma', { confirm: true }, poster())).rejects.toThrow(/webhook/i);
    expect(calls).toEqual([]);
  });
});

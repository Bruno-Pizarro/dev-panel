import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths, type DevPanelConfig } from '../config.js';
import { readVars } from './claudeEnv.js';
import { getTicket, ignoredDirs } from './tickets.js';

/**
 * Hilo de un ticket en el foro de MRs de Discord (ver docs/DISCORD.md). Se publica SOLO cuando el usuario lo pide (botón del panel o
 * Claude por MCP): el webhook crea el hilo con el formato del equipo y las etiquetas de los repos involucrados, y después edita su
 * propio mensaje inicial cuando el ticket suma MRs. La URL del webhook es un secreto: se lee de las variables de Claude y nunca se
 * devuelve ni se registra.
 */
export class DiscordError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'DiscordError';
  }
}

export interface DiscordMr {
  repo: string | null;
  iid: number | null;
  url: string;
}

export interface ThreadDraft {
  name: string;
  content: string;
  /** Ids de etiquetas del foro. */
  tags: string[];
  /** Repos que no tienen etiqueta configurada: sin ellas no se publica (las etiquetas son obligatorias). */
  missingTags: string[];
}

export interface ThreadRecord {
  threadId: string;
  messageId: string;
  guildId: string | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_TAGS = 5;
const MAX_NAME = 100;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** La URL de un webhook de Discord: solo discord.com, nunca otro host. */
export const validWebhook = (value: string): boolean => /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,200}$/.test(value);

/**
 * El mensaje del hilo en el formato de las directivas: ticket y un `repo: enlace` por MR. Los enlaces van entre `<…>`: Discord los
 * muestra igual (clicables, sin los signos) pero NO arma la tarjeta con el logo de GitLab/Redmine. El permiso «Insertar enlaces» del
 * canal no frena a un webhook (no es un miembro), por eso se pide en el propio mensaje. Con `userId` suma una línea que te menciona.
 */
export const threadMessage = (ticketUrl: string, mrs: DiscordMr[], userId = ''): string => {
  const lines = mrs.map((mr) => `${mr.repo ?? 'repo'}: <${mr.url}>`);
  return ['🎫 **Ticket**: <' + ticketUrl + '>', '', '📝 **Merge Requests**', ...lines, ...(userId ? ['', `👤 <@${userId}>`] : [])].join('\n');
};

/** SUPPRESS_EMBEDS: refuerzo de los `<…>` para que ninguna tarjeta de enlace se arme al crear el hilo. */
const SUPPRESS_EMBEDS = 4;

/** Solo se puede mencionar a quien está configurado, y sin `@everyone` ni roles. */
const mentions = (userId: string) => ({ parse: [] as string[], ...(userId ? { users: [userId] } : {}) });

/** Etiquetas de los repos involucrados (los del ticket más los de sus MRs), sin repetir; los repos sin etiqueta propia usan «Otro». */
export const tagsFor = (repos: string[], tags: Record<string, string>, otherTag: string): { ids: string[]; missing: string[] } => {
  const ids: string[] = [];
  const missing: string[] = [];
  for (const repo of [...new Set(repos)]) {
    const id = tags[repo] ?? (otherTag || null);
    if (!id) missing.push(repo);
    else if (!ids.includes(id)) ids.push(id);
  }
  return { ids, missing };
};

export const buildDraft = (meta: { ticket: string; title: string; url: string; repos: string[]; mrs: DiscordMr[] }, config: Pick<DevPanelConfig, 'discord'>): ThreadDraft => {
  const { ids, missing } = tagsFor([...meta.repos, ...meta.mrs.map((mr) => mr.repo).filter((repo): repo is string => !!repo)], config.discord.tags, config.discord.otherTag);
  return { name: clip(`[Ticket #${meta.ticket}] ${meta.title}`, MAX_NAME), content: threadMessage(meta.url, meta.mrs, config.discord.userId), tags: ids, missingTags: missing };
};

const recordsFile = () => join(paths.data, 'discord-threads.json');
const readRecords = (): Record<string, ThreadRecord> => {
  try {
    return existsSync(recordsFile()) ? (JSON.parse(readFileSync(recordsFile(), 'utf8')) as Record<string, ThreadRecord>) : {};
  } catch {
    return {};
  }
};
const writeRecords = (records: Record<string, ThreadRecord>): void => {
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(`${recordsFile()}.tmp`, JSON.stringify(records, null, 2), { mode: 0o600 });
  renameSync(`${recordsFile()}.tmp`, recordsFile());
};

const webhookOf = (config: DevPanelConfig): string | null => {
  const value = readVars()[config.discord.webhookVar];
  return value && validWebhook(value) ? value : null;
};

export interface DiscordPreview {
  /** ¿Hay un webhook válido cargado en las variables de Claude? (nunca se devuelve su valor). */
  webhookReady: boolean;
  webhookVar: string;
  ticket: string | null;
  draft: ThreadDraft | null;
  record: (ThreadRecord & { link: string | null }) | null;
  /** Por qué no se puede publicar (vacío = se puede). */
  problems: string[];
  /** `create` = hilo nuevo; `update` = actualizar el mensaje inicial del hilo que ya creó el panel. */
  action: 'create' | 'update';
  /** El ticket ya tiene MRs registrados en ticket.json (el hilo se publica con ellos). */
  hasMrs: boolean;
  /** Si el hilo que el panel recordaba ya no existe en Discord (lo borraron), se olvidó y vuelve a quedar «sin crear». */
  forgotten: boolean;
}

type Poster = (url: string, init: { method: string; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const defaultPoster: Poster = (url, init) => fetch(url, { ...init, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000) }) as never;

/**
 * ¿Discord dice que el hilo o su mensaje ya no existen? Un 404, o los códigos de «Unknown Channel» (10003) y «Unknown Message» (10008),
 * que según el caso llegan con otro estado. Se lee el cuerpo con cuidado: nunca debe romper la comprobación.
 */
const isGone = async (response: { status: number; json: () => Promise<unknown> }): Promise<boolean> => {
  if (response.status === 404) return true;
  if (response.status < 400 || response.status >= 500) return false;
  try {
    const body = (await response.json()) as { code?: number };
    return body.code === 10003 || body.code === 10008;
  } catch {
    return false;
  }
};

/** Lo que contestó Discord (su `message` y `code`, nunca la URL del webhook) para que el error diga algo útil. */
const discordReason = async (response: { json: () => Promise<unknown> }): Promise<string> => {
  try {
    const body = (await response.json()) as { message?: string; code?: number };
    return body.message ? `: ${body.message}${body.code ? ` (código ${body.code})` : ''}` : '';
  } catch {
    return '';
  }
};

const threadLink = (record: ThreadRecord) => (record.guildId ? `https://discord.com/channels/${record.guildId}/${record.threadId}` : null);

/**
 * ¿Sigue existiendo el mensaje inicial del hilo que el panel creó? Un 404 = lo borraron (se olvida el vínculo y el ticket vuelve a
 * quedar «sin crear»). Cualquier otra respuesta o un corte de red NO borra nada: ante la duda se conserva lo que se recordaba.
 */
const threadStillExists = async (webhook: string, record: ThreadRecord, post: Poster): Promise<boolean> => {
  try {
    const response = await post(`${webhook}/messages/${record.messageId}?thread_id=${record.threadId}`, { method: 'GET' });
    return !(await isGone(response));
  } catch {
    return true;
  }
};

/** Lo que se publicaría para la carpeta de un ticket, sin publicar nada. Comprueba en Discord que el hilo recordado siga existiendo. */
export const previewThread = async (config: DevPanelConfig, dir: string, post: Poster = defaultPoster): Promise<DiscordPreview> => {
  const detail = getTicket(config.paths.extra, dir, ignoredDirs(config));
  const webhook = webhookOf(config);
  const webhookReady = webhook !== null;
  const base = { webhookReady, webhookVar: config.discord.webhookVar };
  if (!detail) return { ...base, ticket: null, draft: null, record: null, problems: ['No encontré la carpeta del ticket'], action: 'create', hasMrs: false, forgotten: false };
  const meta = detail.meta;
  const ticket = meta?.ticket ?? null;
  const problems: string[] = [];
  if (!webhookReady) problems.push(`Falta el webhook: cargalo en Claude → Variables con el nombre ${config.discord.webhookVar}`);
  if (!ticket || !meta?.url) problems.push('El ticket.json no tiene número de ticket o enlace de Redmine');
  const mrs: DiscordMr[] = (meta?.mrs ?? []).filter((mr) => mr.url).map((mr) => ({ repo: mr.repo ?? null, iid: mr.iid ?? null, url: mr.url! }));
  if (mrs.length === 0) problems.push('El ticket todavía no tiene MRs en ticket.json');
  const draft = ticket && meta?.url ? buildDraft({ ticket, title: meta.titulo ?? detail.title, url: meta.url, repos: meta.repos ?? [], mrs }, config) : null;
  if (draft?.missingTags.length) problems.push(`Sin etiqueta del foro para: ${draft.missingTags.join(', ')} (agregala en discord.tags de la configuración)`);
  if (draft && draft.tags.length > MAX_TAGS) problems.push(`Discord admite hasta ${MAX_TAGS} etiquetas y este ticket tiene ${draft.tags.length}`);
  if (draft && draft.tags.length === 0 && draft.missingTags.length === 0) problems.push('El ticket no tiene repos: las etiquetas de los repos son obligatorias');
  let record = ticket ? readRecords()[ticket] : undefined;
  let forgotten = false;
  if (ticket && record && webhook && !(await threadStillExists(webhook, record, post))) {
    const records = readRecords();
    delete records[ticket];
    writeRecords(records);
    record = undefined;
    forgotten = true;
  }
  return { ...base, ticket, draft, record: record ? { ...record, link: threadLink(record) } : null, problems, action: record ? 'update' : 'create', hasMrs: mrs.length > 0, forgotten };
};

export interface PublishResult {
  action: 'created' | 'updated';
  threadId: string;
  link: string | null;
}

/**
 * Crea el hilo del ticket (o actualiza el mensaje inicial del que ya creó el panel). Exige `confirm: true`: el mensaje sale a un canal
 * del equipo y no se puede deshacer desde acá. No pinga a nadie (`allowed_mentions` vacío).
 */
export const publishThread = async (config: DevPanelConfig, dir: string, options: { confirm: boolean }, post: Poster = defaultPoster): Promise<PublishResult> => {
  if (!options.confirm) throw new DiscordError('Falta la confirmación: publicar en Discord lo tiene que pedir el usuario', 400);
  const preview = await previewThread(config, dir, post);
  const webhook = webhookOf(config);
  if (!webhook || !preview.draft || !preview.ticket) throw new DiscordError(preview.problems[0] ?? 'No se puede publicar', 409);
  if (preview.problems.length) throw new DiscordError(preview.problems.join(' · '), 409);
  const { draft, ticket } = preview;
  const username = clip(`${config.userName || 'Dev'} · Dev Panel`, 80);
  const records = readRecords();
  // La vista previa ya comprobó que el hilo siga existiendo: si lo borraron, el registro se olvidó y se crea uno nuevo.
  const existing = records[ticket];

  if (existing) {
    const response = await post(`${webhook}/messages/${existing.messageId}?thread_id=${existing.threadId}`, { method: 'PATCH', body: JSON.stringify({ content: draft.content, allowed_mentions: mentions(config.discord.userId) }) });
    if (!(await isGone(response))) {
      if (!response.ok) throw new DiscordError(`Discord no aceptó el cambio (${response.status})${await discordReason(response)}`, 502);
      records[ticket] = { ...existing, updatedAt: new Date().toISOString() };
      writeRecords(records);
      return { action: 'updated', threadId: existing.threadId, link: threadLink(existing) };
    }
    // Lo borraron entre la comprobación y el cambio: se olvida el vínculo y se crea el hilo de nuevo
    delete records[ticket];
    writeRecords(records);
  }

  const response = await post(`${webhook}?wait=true`, { method: 'POST', body: JSON.stringify({ thread_name: draft.name, content: draft.content, applied_tags: draft.tags, username, flags: SUPPRESS_EMBEDS, allowed_mentions: mentions(config.discord.userId) }) });
  if (!response.ok) throw new DiscordError(`Discord no aceptó el hilo (${response.status})${await discordReason(response)}`, 502);
  const message = (await response.json()) as { id?: string; channel_id?: string; guild_id?: string };
  if (!message.id || !message.channel_id) throw new DiscordError('Discord no devolvió el id del hilo', 502);
  const now = new Date().toISOString();
  records[ticket] = { threadId: message.channel_id, messageId: message.id, guildId: message.guild_id ?? null, createdAt: now, updatedAt: now };
  writeRecords(records);
  return { action: 'created', threadId: message.channel_id, link: message.guild_id ? `https://discord.com/channels/${message.guild_id}/${message.channel_id}` : null };
};

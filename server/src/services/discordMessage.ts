import type { DevPanelConfig } from '../config.js';
import { DiscordError, previewThread, type ThreadFinder } from './discord.js';
import { botHeaders, botToken } from './discordBot.js';

/**
 * Mensaje en el hilo de Discord de un ticket (ver docs/DISCORD.md). Se envía SOLO cuando el usuario lo pide (botón del panel o Claude
 * por MCP a pedido suyo) y con `confirm: true`. Lo manda el bot (`discord.botTokenVar`, permisos «Enviar mensajes» y «Enviar mensajes
 * en hilos») al hilo que creó el panel o a uno ya existente del foro. Las personas se nombran como en `discord.people` y solo ellas
 * se mencionan: nunca `@everyone`, `@here` ni roles (`allowed_mentions`). El token nunca se devuelve ni se registra.
 */
const API = 'https://discord.com/api/v10';
const SUPPRESS_EMBEDS = 4;
/** Discord admite 2000 caracteres por mensaje; las menciones ocupan lugar. */
export const MAX_MESSAGE = 1800;

export type BotPoster = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const defaultBotPoster: BotPoster = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }) as never;

const plain = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export interface ResolvedPeople {
  mentioned: Array<{ name: string; id: string }>;
  /** Nombres que no están en `discord.people`: se avisan, no se ignoran en silencio. */
  unknown: string[];
}

/** Nombres → ids de Discord, sin distinguir mayúsculas ni tildes («alvaro» = «Álvaro»). Sin repetidos. */
export const resolvePeople = (people: Record<string, string>, names: string[]): ResolvedPeople => {
  const byName = new Map(Object.entries(people).map(([name, id]) => [plain(name), { name, id }]));
  const mentioned: ResolvedPeople['mentioned'] = [];
  const unknown: string[] = [];
  for (const raw of names) {
    const found = byName.get(plain(raw));
    if (!found) unknown.push(raw);
    else if (!mentioned.some((person) => person.id === found.id)) mentioned.push(found);
  }
  return { mentioned, unknown };
};

/** El texto final: las menciones primero (`<@id>`) y el texto del usuario después. */
export const messageContent = (text: string, mentioned: Array<{ id: string }>): string => [mentioned.map((person) => `<@${person.id}>`).join(' '), text.trim()].filter(Boolean).join(' ');

export interface MessagePreview {
  ticket: string | null;
  /** Hilo al que iría el mensaje (null = el ticket todavía no tiene hilo). */
  threadId: string | null;
  link: string | null;
  content: string;
  mentioned: Array<{ name: string; id: string }>;
  /** Todas las personas que se pueden nombrar (de `discord.people`). */
  people: string[];
  /** Por qué no se puede enviar (vacío = se puede). */
  problems: string[];
}

const threadIdOfLink = (link: string | null | undefined): string | null => /\/(\d{5,25})$/.exec(link ?? '')?.[1] ?? null;

export interface MessageInput {
  text: string;
  to: string[];
}

export interface MessageDeps {
  findThread?: ThreadFinder;
  post?: Parameters<typeof previewThread>[2];
}

/** Lo que se enviaría al hilo del ticket, sin enviar nada. */
export const previewThreadMessage = async (config: DevPanelConfig, dir: string, input: MessageInput, deps: MessageDeps = {}): Promise<MessagePreview> => {
  const thread = await previewThread(config, dir, deps.post, deps.findThread);
  const { mentioned, unknown } = resolvePeople(config.discord.people, input.to);
  const text = input.text.trim();
  const content = messageContent(text, mentioned);
  const threadId = thread.record?.threadId ?? threadIdOfLink(thread.existing?.link);
  const problems: string[] = [];
  if (!thread.ticket) problems.push('No encontré el ticket de esa carpeta');
  else if (!threadId) problems.push('El ticket todavía no tiene hilo en el foro de Discord');
  if (!text) problems.push('Escribí el mensaje');
  if (content.length > MAX_MESSAGE) problems.push(`El mensaje es muy largo (${content.length} de ${MAX_MESSAGE} caracteres)`);
  if (unknown.length) problems.push(`No tengo el Discord de: ${unknown.join(', ')} (agregalo en discord.people de la configuración)`);
  if (!botToken(config)) problems.push(`Falta el token del bot: cargalo en Claude → Variables con el nombre ${config.discord.botTokenVar}`);
  const link = thread.record?.link ?? thread.existing?.link ?? null;
  return { ticket: thread.ticket, threadId, link, content, mentioned, people: Object.keys(config.discord.people), problems };
};

export interface SendResult {
  messageId: string;
  link: string | null;
}

/** Envía el mensaje al hilo del ticket. Exige `confirm: true` y que la vista previa no tenga problemas. */
export const sendThreadMessage = async (config: DevPanelConfig, dir: string, input: MessageInput, options: { confirm: boolean }, deps: MessageDeps & { botPost?: BotPoster } = {}): Promise<SendResult> => {
  if (!options.confirm) throw new DiscordError('Falta la confirmación: enviar a Discord lo tiene que pedir el usuario', 400);
  const preview = await previewThreadMessage(config, dir, input, deps);
  const token = botToken(config);
  if (preview.problems.length || !preview.threadId || !token) throw new DiscordError(preview.problems.join(' · ') || 'No se puede enviar', 409);
  const post = deps.botPost ?? defaultBotPoster;
  const response = await post(`${API}/channels/${preview.threadId}/messages`, {
    method: 'POST',
    headers: { ...botHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: preview.content, flags: SUPPRESS_EMBEDS, allowed_mentions: { parse: [], users: preview.mentioned.map((person) => person.id) } }),
  });
  if (!response.ok) {
    let reason = '';
    try {
      const body = (await response.json()) as { message?: string; code?: number };
      reason = body.message ? `: ${body.message}${body.code ? ` (código ${body.code})` : ''}` : '';
    } catch {
      reason = '';
    }
    throw new DiscordError(`Discord no aceptó el mensaje (${response.status})${reason}`, 502);
  }
  const message = (await response.json()) as { id?: string };
  if (!message.id) throw new DiscordError('Discord no devolvió el id del mensaje', 502);
  return { messageId: message.id, link: preview.link ? `${preview.link}/${message.id}` : null };
};

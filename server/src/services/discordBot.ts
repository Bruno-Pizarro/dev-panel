import type { DevPanelConfig } from '../config.js';
import { readVars } from './claudeEnv.js';
import { cleanBlock } from './redact.js';

/**
 * Bot de Discord de SOLO LECTURA para el foro de MRs (ver docs/DISCORD.md). No envía nada: solo lee los hilos del canal configurado
 * (`discord.channelId`) y los cruza con los tickets por el `#número` del título. El token (`discord.botTokenVar`) se lee de las variables
 * de Claude y nunca se devuelve ni se registra. Consulta la API cada tanto (caché de 5 min), no mantiene una conexión abierta.
 * Los mensajes que se entregan pasan por `cleanBlock` (secretos tapados) y se recortan: son conversación del equipo.
 */
export class DiscordBotError extends Error {
  constructor(message: string, readonly status: number = 502) {
    super(message);
    this.name = 'DiscordBotError';
  }
}

const API = 'https://discord.com/api/v10';
const CACHE_MS = 5 * 60_000;
const SNOWFLAKE = /^\d{5,25}$/;
/** El canal y el hilo se usan para armar rutas de la API: solo ids numéricos. */
const validId = (id: string) => SNOWFLAKE.test(id);

export interface ForumThread {
  id: string;
  name: string;
  /** Número de ticket sacado del título (`[Ticket #33526] …`), o null si el título no lo trae. */
  ticket: string | null;
  tags: string[];
  /** Mensajes en el hilo sin contar el inicial. */
  replies: number;
  lastActivityAt: string;
  createdAt: string;
  archived: boolean;
  /** `Estado: Testeado` (ticket aprobado). */
  approved: boolean;
  link: string;
}

export interface ThreadList {
  configured: boolean;
  /** Por qué no hay datos (sin token, sin canal, error de Discord). */
  problem: string | null;
  fetchedAt: string | null;
  threads: ForumThread[];
}

export interface ThreadMessage {
  author: string;
  at: string;
  content: string;
  reactions: string[];
  attachments: number;
}

type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const defaultFetcher: Fetcher = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }) as never;

const DISCORD_EPOCH = 1_420_070_400_000n;
/** La fecha en la que se creó un id de Discord (snowflake). */
export const snowflakeDate = (id: string | null | undefined): string | null => (id && validId(id) ? new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH)).toISOString() : null);

/** `[Ticket #33526] Título` / `#33526 …` → "33526". */
export const ticketOf = (title: string): string | null => /#(\d{4,7})\b/.exec(title)?.[1] ?? null;

const botToken = (config: DevPanelConfig): string | null => {
  const value = readVars()[config.discord.botTokenVar];
  return value && value.trim() ? value.trim() : null;
};

const headers = (token: string) => ({ Authorization: `Bot ${token}`, 'User-Agent': 'DiscordBot (https://github.com/Bruno-Pizarro/dev-panel, 1.0)' });

interface RawThread {
  id: string;
  name: string;
  parent_id?: string;
  message_count?: number;
  last_message_id?: string | null;
  applied_tags?: string[];
  thread_metadata?: { archived?: boolean };
}

let cached: { at: number; key: string; value: ThreadList } | null = null;

/** Los hilos del foro (activos y archivados) con su ticket, etiquetas y actividad. La consulta se guarda 5 minutos. */
export const listThreads = async (config: DevPanelConfig, options: { force?: boolean; fetcher?: Fetcher; now?: number } = {}): Promise<ThreadList> => {
  const channel = config.discord.channelId;
  const fetcher = options.fetcher ?? defaultFetcher;
  const now = options.now ?? Date.now();
  if (!channel || !validId(channel)) return { configured: false, problem: 'Falta el id del canal foro (discord.channelId en la configuración)', fetchedAt: null, threads: [] };
  const token = botToken(config);
  if (!token) return { configured: false, problem: `Falta el token del bot: cargalo en Claude → Variables como ${config.discord.botTokenVar}`, fetchedAt: null, threads: [] };
  const key = `${channel}:${config.discord.approvedTag}`;
  if (!options.force && cached && cached.key === key && now - cached.at < CACHE_MS) return cached.value;

  const get = async (path: string): Promise<unknown> => {
    const response = await fetcher(`${API}${path}`, { headers: headers(token) });
    if (!response.ok) {
      let detail = '';
      try {
        const body = (await response.json()) as { message?: string; code?: number };
        detail = body.message ? `: ${body.message}${body.code ? ` (código ${body.code})` : ''}` : '';
      } catch {
        /* sin cuerpo */
      }
      throw new DiscordBotError(`Discord respondió ${response.status}${detail}`, response.status === 401 || response.status === 403 ? 502 : 502);
    }
    return response.json();
  };

  try {
    const forum = (await get(`/channels/${channel}`)) as { guild_id?: string; available_tags?: Array<{ id: string; name: string }> };
    const guild = forum.guild_id;
    if (!guild) throw new DiscordBotError('El canal no pertenece a un servidor');
    const tagNames = new Map((forum.available_tags ?? []).map((tag) => [tag.id, tag.name]));
    const active = (await get(`/guilds/${guild}/threads/active`)) as { threads?: RawThread[] };
    const archived = (await get(`/channels/${channel}/threads/archived/public?limit=100`)) as { threads?: RawThread[] };
    const raw = [...(active.threads ?? []).filter((thread) => thread.parent_id === channel), ...(archived.threads ?? [])];
    const threads = [...new Map(raw.map((thread) => [thread.id, thread])).values()].map((thread): ForumThread => ({
      id: thread.id,
      name: thread.name,
      ticket: ticketOf(thread.name),
      tags: (thread.applied_tags ?? []).map((id) => tagNames.get(id) ?? id),
      replies: Math.max(0, (thread.message_count ?? 1) - 1),
      lastActivityAt: snowflakeDate(thread.last_message_id) ?? snowflakeDate(thread.id) ?? new Date(now).toISOString(),
      createdAt: snowflakeDate(thread.id) ?? new Date(now).toISOString(),
      archived: thread.thread_metadata?.archived === true,
      approved: !!config.discord.approvedTag && (thread.applied_tags ?? []).includes(config.discord.approvedTag),
      link: `https://discord.com/channels/${guild}/${thread.id}`,
    })).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    const value: ThreadList = { configured: true, problem: null, fetchedAt: new Date(now).toISOString(), threads };
    cached = { at: now, key, value };
    return value;
  } catch (error) {
    // Una falla de Discord no tira abajo la pantalla: se informa y, si había algo guardado, se sigue mostrando eso
    const problem = error instanceof Error ? error.message : String(error);
    if (cached && cached.key === key) return { ...cached.value, problem: `${problem} (se muestra lo último que se leyó)` };
    return { configured: true, problem, fetchedAt: null, threads: [] };
  }
};

const MAX_MESSAGES = 50;
const MAX_TEXT = 1500;

/** Los últimos mensajes de un hilo (del más viejo al más nuevo), con los secretos tapados y recortados. Solo hilos del foro configurado. */
export const threadMessages = async (config: DevPanelConfig, threadId: string, options: { limit?: number; fetcher?: Fetcher } = {}): Promise<ThreadMessage[]> => {
  if (!validId(threadId)) throw new DiscordBotError('Id de hilo inválido', 400);
  const token = botToken(config);
  if (!token || !config.discord.channelId) throw new DiscordBotError('El bot no está configurado', 503);
  // Solo se leen hilos que pertenecen al foro configurado (nunca otro canal)
  const known = (await listThreads(config, { ...(options.fetcher ? { fetcher: options.fetcher } : {}) })).threads.some((thread) => thread.id === threadId);
  if (!known) throw new DiscordBotError('Ese hilo no es del foro de MRs configurado', 404);
  const limit = Math.min(MAX_MESSAGES, Math.max(1, Math.round(options.limit ?? 30)));
  const fetcher = options.fetcher ?? defaultFetcher;
  const response = await fetcher(`${API}/channels/${threadId}/messages?limit=${limit}`, { headers: headers(token) });
  if (!response.ok) throw new DiscordBotError(`Discord respondió ${response.status}`);
  const raw = (await response.json()) as Array<{ author?: { username?: string; global_name?: string | null }; timestamp: string; content?: string; reactions?: Array<{ emoji?: { name?: string | null }; count?: number }>; attachments?: unknown[] }>;
  return raw
    .map((message): ThreadMessage => ({
      author: message.author?.global_name || message.author?.username || '—',
      at: message.timestamp,
      content: cleanBlock(message.content ?? '', MAX_TEXT) ?? '',
      reactions: (message.reactions ?? []).map((reaction) => `${reaction.emoji?.name ?? '?'} ×${reaction.count ?? 1}`),
      attachments: message.attachments?.length ?? 0,
    }))
    .reverse();
};

/** Solo para los tests: olvida lo guardado. */
export const resetThreadCache = (): void => {
  cached = null;
};

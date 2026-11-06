import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths, type DevPanelConfig } from '../config.js';
import { listThreads, threadMessages, type Fetcher, type ForumThread, type ThreadMessage } from './discordBot.js';
import { plainNote, type Notice, type NoticeError } from './homeNotices.js';
import { kindOf, getTicketState } from './ticketState.js';
import { getTicket, ignoredDirs, listTickets } from './tickets.js';

/**
 * Avisos del Inicio que salen del foro de MRs de Discord (leído con el bot de solo lectura): alguien escribió en el hilo de un ticket
 * mío, me mencionaron, o le pusieron «Estado: Testeado» a un ticket mío. A diferencia de los demás avisos NO se revisan una vez por día:
 * se calculan al pedirlos (los hilos se guardan 5 min) comparando con lo último que se vio; cada aviso se conserva 36 h para que no
 * desaparezca antes de que lo leas. La primera vez solo toma la foto de cómo está el foro (no avisa de nada viejo).
 */
const MAX_THREADS_PER_RUN = 8;
const KEEP_MS = 36 * 60 * 60_000;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

interface SeenThread {
  replies: number;
  lastActivityAt: string;
  approved: boolean;
}

interface StoredNotice extends Notice {
  at: string;
}

interface State {
  initializedAt: string | null;
  seen: Record<string, SeenThread>;
  notices: StoredNotice[];
}

const stateFile = () => join(paths.data, 'discord-notices.json');
const readState = (): State => {
  try {
    return existsSync(stateFile()) ? (JSON.parse(readFileSync(stateFile(), 'utf8')) as State) : { initializedAt: null, seen: {}, notices: [] };
  } catch {
    return { initializedAt: null, seen: {}, notices: [] };
  }
};
const writeState = (state: State): void => {
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(`${stateFile()}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${stateFile()}.tmp`, stateFile());
};

/** Los tickets que desarrollo yo (carpetas de `_EXTRA` que no son de revisión): son los hilos de los que quiero enterarme. */
export const ownTickets = (config: DevPanelConfig): Set<string> => {
  const ignore = ignoredDirs(config);
  const own = new Set<string>();
  for (const summary of listTickets(config.paths.extra, ignore)) {
    if (!summary.ticket) continue;
    const detail = getTicket(config.paths.extra, summary.dir, ignore);
    if (detail && kindOf(getTicketState(summary.dir), detail.meta?.tipo) !== 'revision') own.add(summary.ticket);
  }
  return own;
};

/** Qué hilos tuvieron novedades desde la última foto, y cuáles se aprobaron (solo los de mis tickets). Pura. */
export const diffThreads = (seen: Record<string, SeenThread>, threads: ForumThread[], mine: ReadonlySet<string>): { changed: Array<{ thread: ForumThread; since: string }>; approved: ForumThread[]; next: Record<string, SeenThread> } => {
  const changed: Array<{ thread: ForumThread; since: string }> = [];
  const approved: ForumThread[] = [];
  const next: Record<string, SeenThread> = {};
  for (const thread of threads) {
    const before = seen[thread.id];
    next[thread.id] = { replies: thread.replies, lastActivityAt: thread.lastActivityAt, approved: thread.approved };
    if (!before) {
      // Un hilo nuevo con respuestas ya tiene movimiento; uno recién creado y vacío no
      if (thread.replies > 0) changed.push({ thread, since: thread.createdAt });
      continue;
    }
    if (thread.replies > before.replies || thread.lastActivityAt > before.lastActivityAt) changed.push({ thread, since: before.lastActivityAt });
    if (thread.approved && !before.approved && thread.ticket && mine.has(thread.ticket)) approved.push(thread);
  }
  return { changed, approved, next };
};

const readable = (content: string): string => plainNote(content.replace(/<@!?\d+>/g, '@alguien').replace(/<#\d+>/g, '#canal').replace(/<(https?:\/\/[^>\s]+)>/g, '$1'));

/**
 * El aviso de un hilo con novedades, o null si no corresponde: solo importan los hilos de mis tickets o donde me mencionan, y los
 * mensajes míos no cuentan.
 */
export const noticeForThread = (thread: ForumThread, messages: ThreadMessage[], since: string, userId: string, mine: ReadonlySet<string>): Notice | null => {
  const fresh = messages.filter((message) => message.at > since && (!userId || message.authorId !== userId));
  if (!fresh.length) return null;
  const mention = userId ? fresh.find((message) => message.mentions.includes(userId) || message.content.includes(`<@${userId}>`) || message.content.includes(`<@!${userId}>`)) : undefined;
  const isMine = !!thread.ticket && mine.has(thread.ticket);
  if (!mention && !isMine) return null;
  const label = thread.ticket ? `#${thread.ticket}` : clip(thread.name, 50);
  const last = (mention ?? fresh[fresh.length - 1])!;
  const authors = [...new Set(fresh.map((message) => message.author))];
  return {
    id: `discord-${thread.id}`,
    kind: 'discord',
    level: 'important',
    title: mention ? `${mention.author} te mencionó en ${label}` : `${authors.slice(0, 3).join(', ')} escribió en ${label}`,
    detail: `${clip(thread.name, 70)} · «${clip(readable(last.content) || '(sin texto)', 140)}»`,
    link: thread.link,
  };
};

export interface DiscordNotices {
  notices: Notice[];
  errors: NoticeError[];
}

export interface DiscordNoticeDeps {
  fetcher?: Fetcher;
  mine?: ReadonlySet<string>;
  now?: number;
}

let running: Promise<DiscordNotices> | null = null;

/** Los avisos de Discord del Inicio. Si ya hay un cálculo en curso (la pantalla pide varias cosas a la vez) se comparte. */
export const getDiscordNotices = (config: DevPanelConfig, deps: DiscordNoticeDeps = {}): Promise<DiscordNotices> => {
  running ??= compute(config, deps).finally(() => {
    running = null;
  });
  return running;
};

const compute = async (config: DevPanelConfig, deps: DiscordNoticeDeps): Promise<DiscordNotices> => {
  if (!config.discord.channelId) return { notices: [], errors: [] };
  const now = deps.now ?? Date.now();
  const options = { ...(deps.fetcher ? { fetcher: deps.fetcher } : {}), now };
  const list = await listThreads(config, options);
  if (!list.configured) return { notices: [], errors: [] };
  const errors: NoticeError[] = [];
  if (list.problem && list.threads.length === 0) return { notices: [], errors: [{ source: 'Discord', message: list.problem }] };
  const userId = config.discord.userId;
  if (!userId) errors.push({ source: 'Discord', message: 'Cargá tu id de usuario de Discord en Configuración → Discord: sin él no puedo distinguir tus mensajes ni tus menciones.' });

  const state = readState();
  const cutoff = new Date(now - KEEP_MS).toISOString();
  state.notices = state.notices.filter((notice) => notice.at >= cutoff);

  if (!state.initializedAt) {
    // Primera vez: solo la foto de cómo está el foro hoy
    state.initializedAt = new Date(now).toISOString();
    state.seen = diffThreads({}, list.threads, new Set()).next;
    writeState(state);
    return { notices: [], errors };
  }

  const mine = deps.mine ?? ownTickets(config);
  const { changed, approved, next } = diffThreads(state.seen, list.threads, mine);
  const at = new Date(now).toISOString();
  const fresh: StoredNotice[] = [];
  for (const { thread, since } of changed.slice(0, MAX_THREADS_PER_RUN)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const messages = await threadMessages(config, thread.id, { limit: 15, ...(deps.fetcher ? { fetcher: deps.fetcher } : {}) });
      const notice = noticeForThread(thread, messages, since, userId, mine);
      if (notice) fresh.push({ ...notice, at });
    } catch (error) {
      errors.push({ source: 'Discord', message: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const thread of approved) {
    fresh.push({ id: `discord-approved-${thread.id}`, kind: 'discord', level: 'important', title: `#${thread.ticket} quedó aprobado en Discord`, detail: `${clip(thread.name, 90)} · etiqueta «Estado: Testeado»`, link: thread.link, at });
  }
  const ids = new Set(fresh.map((notice) => notice.id));
  state.notices = [...fresh, ...state.notices.filter((notice) => !ids.has(notice.id))];
  // Lo que se procesó (o falló por un error pasajero de Discord) no se vuelve a evaluar; solo se reintenta lo que quedó fuera del tope
  const skipped = new Set(changed.slice(MAX_THREADS_PER_RUN).map(({ thread }) => thread.id));
  state.seen = Object.fromEntries(Object.entries(next).map(([id, value]) => [id, skipped.has(id) && state.seen[id] ? state.seen[id]! : value]));
  writeState(state);
  return { notices: state.notices.map((stored) => ({ id: stored.id, kind: stored.kind, level: stored.level, title: stored.title, detail: stored.detail, link: stored.link })), errors };
};

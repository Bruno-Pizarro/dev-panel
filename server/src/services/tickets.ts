import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { DevPanelConfig } from '../config.js';

/** `ticket.json`: lo escriben las skills al cerrar cada etapa; todo es opcional para tolerar carpetas viejas. */
export const ticketMetaSchema = z
  .object({
    ticket: z.union([z.string(), z.number()]).transform(String).optional(),
    titulo: z.string().optional(),
    url: z.string().optional(),
    estado: z.string().optional(),
    responsable: z.string().optional(),
    rama: z.string().optional(),
    repos: z.array(z.string()).optional(),
    mrs: z.array(z.object({ fecha: z.string().optional(), repo: z.string().optional(), iid: z.number().optional(), url: z.string().optional(), autor: z.string().optional(), estado: z.string().optional() }).passthrough()).optional(),
    codeReview: z.array(z.object({ fecha: z.string().optional(), veredicto: z.string().optional(), resumen: z.string().optional(), hallazgos: z.number().optional() }).passthrough()).optional(),
    pruebas: z.array(z.object({ conclusion: z.string().optional(), fecha: z.string().optional(), resumen: z.string().optional(), resultado: z.string().optional(), archivo: z.string().optional(), capturas: z.array(z.string()).optional() }).passthrough()).optional(),
    plan: z.object({ resumen: z.string().optional(), diagrama: z.string().optional(), referenciaVisual: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();
export type TicketMeta = z.infer<typeof ticketMetaSchema>;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const TEXT_EXT = new Set(['.md', '.mmd']);
const MAX_DEPTH = 4;
const MAX_FILES = 600;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const IGNORED_DIRS = new Set(['node_modules', '.git', 'snapshots']);

export const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

export interface TicketFiles {
  docs: string[];
  diagrams: string[];
  images: string[];
}

export interface TicketSummary {
  dir: string;
  ticket: string | null;
  title: string;
  estado: string | null;
  rama: string | null;
  repos: string[];
  mrs: number;
  lastUpdated: number;
  docs: number;
  images: number;
  hasMeta: boolean;
  lastTest: { fecha: string | null; resultado: string | null } | null;
  review: string | null;
}

export interface TicketDetail extends TicketSummary {
  meta: TicketMeta | null;
  files: TicketFiles;
}

/** "33526-pendientes-firma" → { ticket: "33526", slug: "pendientes firma" }; otras carpetas no tienen número de ticket. */
export const parseDirName = (dir: string): { ticket: string | null; title: string } => {
  const match = /^(\d{4,6})[-_ ]?(.*)$/.exec(dir);
  const raw = (match ? match[2] : dir) || dir;
  const title = raw.replace(/[-_]+/g, ' ').trim();
  return { ticket: match?.[1] ?? null, title: title ? title[0]!.toUpperCase() + title.slice(1) : dir };
};

const walk = (root: string, dir: string, depth: number, files: string[]): void => {
  if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(root, full, depth + 1, files);
    else if (entry.isFile()) files.push(relative(root, full).split(sep).join('/'));
    if (files.length >= MAX_FILES) return;
  }
};

const readMeta = (root: string): TicketMeta | null => {
  const file = join(root, 'ticket.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = ticketMetaSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const classify = (files: string[]): TicketFiles => ({
  docs: files.filter((file) => extname(file).toLowerCase() === '.md').sort(),
  diagrams: files.filter((file) => extname(file).toLowerCase() === '.mmd').sort(),
  images: files.filter((file) => IMAGE_EXT.has(extname(file).toLowerCase())).sort(),
});

const buildDetail = (extraRoot: string, dir: string): TicketDetail => {
  const root = join(extraRoot, dir);
  const all: string[] = [];
  walk(root, root, 0, all);
  const files = classify(all);
  const meta = readMeta(root);
  const parsed = parseDirName(dir);
  const mtimes = all.map((file) => statSync(join(root, file)).mtimeMs);
  const lastUpdated = mtimes.length ? Math.max(...mtimes) : statSync(root).mtimeMs;
  const lastTest = meta?.pruebas?.length ? meta.pruebas[meta.pruebas.length - 1]! : null;
  const review = meta?.codeReview?.length ? (meta.codeReview[meta.codeReview.length - 1]!.veredicto ?? null) : null;
  return {
    dir,
    ticket: meta?.ticket ?? parsed.ticket,
    title: meta?.titulo ?? parsed.title,
    estado: meta?.estado ?? null,
    rama: meta?.rama ?? null,
    repos: meta?.repos ?? [],
    mrs: meta?.mrs?.length ?? 0,
    lastUpdated,
    docs: files.docs.length,
    images: files.images.length,
    hasMeta: meta !== null,
    lastTest: lastTest ? { fecha: lastTest.fecha ?? null, resultado: lastTest.resultado ?? null } : null,
    review,
    meta,
    files,
  };
};

const summarize = ({ meta: _meta, files: _files, ...summary }: TicketDetail): TicketSummary => summary;

/** Carpetas que no son tickets: las configuradas y, si está dentro de la base de conocimiento, la carpeta del Daily. */
export const ignoredDirs = (config: DevPanelConfig): string[] => {
  const daily = resolve(config.paths.daily);
  const insideExtra = resolve(daily, '..') === resolve(config.paths.extra) ? [basename(daily)] : [];
  return [...new Set([...config.paths.ignoreDirs, ...insideExtra])];
};

const ticketDirs = (extraRoot: string, ignore: string[] = []): string[] => {
  if (!existsSync(extraRoot)) return [];
  return readdirSync(extraRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name) && !ignore.includes(entry.name) && /^[\w][\w .-]*$/.test(entry.name))
    .map((entry) => entry.name);
};

export const listTickets = (extraRoot: string, ignore: string[] = []): TicketSummary[] =>
  ticketDirs(extraRoot, ignore)
    .map((dir) => summarize(buildDetail(extraRoot, dir)))
    .sort((a, b) => b.lastUpdated - a.lastUpdated);

export const getTicket = (extraRoot: string, dir: string, ignore: string[] = []): TicketDetail | null =>
  ticketDirs(extraRoot, ignore).includes(dir) ? buildDetail(extraRoot, dir) : null;

export type ResolvedFile = { ok: true; absolute: string; ext: string } | { ok: false; status: 400 | 404; error: string };

/**
 * Resuelve un archivo de una carpeta de ticket. Solo md, mmd, imágenes y ticket.json; la ruta real
 * (tras resolver symlinks) debe seguir dentro de la carpeta del ticket.
 */
export const resolveTicketFile = (extraRoot: string, dir: string, path: string, kind: 'text' | 'image', ignore: string[] = []): ResolvedFile => {
  if (!ticketDirs(extraRoot, ignore).includes(dir)) return { ok: false, status: 404, error: 'Ticket no encontrado' };
  if (!path || path.includes('\0') || path.startsWith('/') || path.split(/[\\/]/).includes('..')) return { ok: false, status: 400, error: 'Ruta inválida' };
  const ext = extname(path).toLowerCase();
  const allowed = kind === 'image' ? IMAGE_EXT.has(ext) : TEXT_EXT.has(ext) || basename(path) === 'ticket.json';
  if (!allowed) return { ok: false, status: 400, error: 'Tipo de archivo no permitido' };
  const root = resolve(extraRoot, dir);
  const candidate = resolve(root, path);
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return { ok: false, status: 404, error: 'Archivo no encontrado' };
  const real = realpathSync(candidate);
  if (!real.startsWith(realpathSync(root) + sep)) return { ok: false, status: 400, error: 'Ruta fuera de la carpeta del ticket' };
  if (kind === 'text' && statSync(real).size > MAX_TEXT_BYTES) return { ok: false, status: 400, error: 'Archivo demasiado grande' };
  return { ok: true, absolute: real, ext };
};

export class TicketDeleteError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const TRASH_DIR = '.papelera';

/**
 * "Elimina" una carpeta de ticket moviéndola a `.papelera/` dentro de la base de conocimiento (se puede recuperar a mano).
 * Exige que se escriba el nombre exacto de la carpeta y que sea una carpeta real de la lista (no un enlace hacia afuera).
 */
export const trashTicket = (extraRoot: string, dir: string, typedName: string, ignore: string[] = [], now = new Date()): { movedTo: string } => {
  if (!ticketDirs(extraRoot, ignore).includes(dir)) throw new TicketDeleteError('Ticket no encontrado', 404);
  if (typedName !== dir) throw new TicketDeleteError('El nombre escrito no coincide con el de la carpeta');
  const source = resolve(extraRoot, dir);
  if (realpathSync(source) !== source || !statSync(source).isDirectory()) throw new TicketDeleteError('La carpeta es un enlace o no es una carpeta: no se mueve');
  const trash = join(extraRoot, TRASH_DIR);
  mkdirSync(trash, { recursive: true });
  const target = join(trash, `${dir}__${now.toISOString().replace(/[:.]/g, '-')}`);
  renameSync(source, target);
  return { movedTo: relative(extraRoot, target) };
};

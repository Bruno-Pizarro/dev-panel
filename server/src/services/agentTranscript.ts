import { existsSync, openSync, closeSync, readSync, realpathSync, statSync } from 'node:fs';
import { sep } from 'node:path';

/**
 * El informe final de un agente, sacado de su transcripción (el hook SubagentStop no lo trae): el último texto del asistente o,
 * si el agente entrega su informe con la herramienta SubagentHandback, el mensaje de esa llamada. Solo lectura, solo archivos
 * .jsonl dentro de `projects/` de una carpeta de configuración de Claude, y solo el final del archivo (puede ser enorme).
 */
const MAX_TAIL_BYTES = 4 * 1024 * 1024;

const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** El último mensaje "de cara afuera" del agente en un texto JSONL; null si no hay. */
export const lastAgentReply = (jsonl: string): string | null => {
  let reply: string | null = null;
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = asRecord(JSON.parse(line));
    } catch {
      continue; // una línea cortada (el archivo se leyó por la mitad)
    }
    if (entry['type'] !== 'assistant') continue;
    const content = asRecord(entry['message'])['content'];
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      const block = asRecord(raw);
      if (block['type'] === 'text' && typeof block['text'] === 'string' && block['text'].trim()) reply = block['text'];
      else if (block['type'] === 'tool_use' && block['name'] === 'SubagentHandback' && typeof asRecord(block['input'])['message'] === 'string') reply = asRecord(block['input'])['message'] as string;
    }
  }
  return reply;
};

/** La ruta de la transcripción es válida solo si, ya resuelta, está en `<carpeta de Claude>/projects/…` y termina en .jsonl. */
export const isAllowedTranscript = (path: unknown, claudeDirs: string[]): path is string => {
  if (typeof path !== 'string' || !path.startsWith('/') || !path.endsWith('.jsonl') || path.includes('\0')) return false;
  try {
    const real = realpathSync(path);
    return claudeDirs.some((dir) => {
      try {
        const root = `${realpathSync(dir)}${sep}projects${sep}`;
        return real.startsWith(root);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
};

/** Lee el final del archivo (hasta 4 MB) como texto; si empieza a la mitad de una línea, la descarta. */
const readTail = (path: string): string => {
  const size = statSync(path).size;
  const start = Math.max(0, size - MAX_TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  const text = buffer.toString('utf8');
  return start > 0 ? text.slice(text.indexOf('\n') + 1) : text;
};

/** El informe final del agente a partir de la ruta de su transcripción, o null si no se puede (ruta no permitida, archivo ausente, sin informe). */
export const readAgentReply = (path: unknown, claudeDirs: string[]): string | null => {
  if (!isAllowedTranscript(path, claudeDirs) || !existsSync(path)) return null;
  try {
    return lastAgentReply(readTail(path));
  } catch {
    return null;
  }
};

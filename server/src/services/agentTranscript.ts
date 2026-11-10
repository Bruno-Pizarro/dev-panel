import { existsSync, openSync, closeSync, readSync, realpathSync, statSync } from 'node:fs';
import { sep } from 'node:path';
import { redactSecrets } from './redact.js';

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

/** Un paso del agente: la herramienta que usó y, en una línea, sobre qué (con los secretos tapados). */
export interface AgentStep {
  tool: string;
  summary: string;
}

export const MAX_STEPS = 80;
const MAX_STEP_TEXT = 160;
/** Campos de la entrada de una herramienta que mejor dicen "sobre qué" trabajó, por orden de preferencia. */
const STEP_FIELDS = ['file_path', 'path', 'command', 'pattern', 'url', 'query', 'description', 'prompt', 'skill'];

const stepSummary = (input: Record<string, unknown>): string => {
  const field = STEP_FIELDS.find((name) => typeof input[name] === 'string' && (input[name] as string).trim());
  // eslint-disable-next-line no-control-regex
  const text = field ? redactSecrets((input[field] as string).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()) : '';
  return text.length > MAX_STEP_TEXT ? `${text.slice(0, MAX_STEP_TEXT)}…` : text;
};

/** Las herramientas que usó el agente, en orden (solo lo que pidió, no lo que devolvieron: pueden ser enormes). */
export const agentSteps = (jsonl: string, max = MAX_STEPS): AgentStep[] => {
  const steps: AgentStep[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim() || steps.length >= max) continue;
    let entry: Record<string, unknown>;
    try {
      entry = asRecord(JSON.parse(line));
    } catch {
      continue;
    }
    if (entry['type'] !== 'assistant') continue;
    const content = asRecord(entry['message'])['content'];
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      const block = asRecord(raw);
      if (block['type'] !== 'tool_use' || typeof block['name'] !== 'string' || block['name'] === 'SubagentHandback' || steps.length >= max) continue;
      steps.push({ tool: block['name'].slice(0, 60), summary: stepSummary(asRecord(block['input'])) });
    }
  }
  return steps;
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

/** Informe final y pasos de un agente, leyendo la transcripción una sola vez. */
export const readAgentTranscript = (path: unknown, claudeDirs: string[]): { reply: string | null; steps: AgentStep[] } => {
  if (!isAllowedTranscript(path, claudeDirs) || !existsSync(path)) return { reply: null, steps: [] };
  try {
    const text = readTail(path);
    return { reply: lastAgentReply(text), steps: agentSteps(text) };
  } catch {
    return { reply: null, steps: [] };
  }
};

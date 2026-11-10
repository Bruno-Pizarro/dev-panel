import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { lastAgentReply, agentSteps, isAllowedTranscript, type AgentStep } from './agentTranscript.js';
import { cleanText, ticketOfText } from './agents.js';
import { cleanBlock } from './redact.js';

/**
 * Orquestación de Claude Code: el árbol de sesiones y agentes, reconstruido de las transcripciones que Claude Code ya guarda en disco
 * (`<carpeta de Claude>/projects/<proyecto>/<sesión>.jsonl` y, de cada agente, `<sesión>/subagents/agent-<id>.jsonl` + `.meta.json`).
 * A diferencia de los hooks, no se pierde nada y funciona hacia atrás (sesiones de antes de instalar los hooks).
 *
 * Solo LEE esas carpetas, de forma incremental (recuerda hasta dónde leyó cada archivo: las sesiones largas pesan cientos de MB) y
 * guarda MÉTRICAS, no contenido: pedido, respuesta y pasos de un agente se leen de su transcripción recién cuando se abre ese agente.
 * Se conservan 15 días (`RETENTION_MS`).
 */
export const RETENTION_MS = 15 * 24 * 60 * 60_000;
/** Un agente sin avisar que terminó y sin actividad desde hace este tiempo se marca interrumpido. */
export const STALE_MS = 10 * 60_000;
export const MAX_SESSIONS = 300;
export const MAX_AGENTS_PER_SESSION = 400;
const MAX_STEPS = 200;
const HEAD_BYTES = 8 * 1024 * 1024;
const TAIL_BYTES = 4 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

export interface OrchTokens {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
}

export type AgentStatus = 'running' | 'done' | 'lost';

export interface OrchAgent {
  agentId: string;
  /** La llamada de la herramienta Agent con la que se lanzó. */
  toolUseId: string | null;
  /** Quién lo lanzó: otro agente, o null si fue la conversación principal. */
  parentAgentId: string | null;
  depth: number;
  type: string;
  description: string;
  model: string | null;
  background: boolean;
  status: AgentStatus;
  startedAt: string | null;
  endedAt: string | null;
  tokens: OrchTokens;
  /** Tokens por día (entrada + salida + creación de caché), para «tokens de hoy». */
  byDay: Record<string, number>;
  toolCount: number;
  toolStats: Record<string, number>;
  /** `hook`: solo lo supo un hook (la transcripción no estaba a la vista). */
  source: 'transcript' | 'hook';
}

export interface OrchSession {
  id: string;
  /** Carpeta de configuración de Claude (la cuenta) en la que está la sesión. */
  account: string;
  title: string | null;
  /** Último tramo de la carpeta de trabajo. */
  project: string | null;
  branch: string | null;
  entrypoint: string | null;
  ticket: string | null;
  firstAt: string | null;
  lastAt: string | null;
  /** Lo que gastó la conversación principal (sin sus agentes). */
  main: { tokens: OrchTokens; byDay: Record<string, number>; toolCount: number };
  agents: OrchAgent[];
}

// ------------------------------------------------------------------ estado guardado
interface Pending {
  id: string;
  usage: UsageNumbers;
  day: string;
}
type UsageNumbers = OrchTokens;
interface Tracker {
  tokens: OrchTokens;
  byDay: Record<string, number>;
  pending: Pending | null;
}
interface Launch {
  owner: string | null;
  type: string;
  description: string;
  model: string | null;
  background: boolean;
}
interface StoredAgent extends OrchAgent {
  /** Interno: transcripción del agente y cómo va su lectura. */
  file: string;
  tracker: Tracker;
  /** `finished` solo lo escriben los agentes en segundo plano: en primer plano es null. */
  meta: { finished: boolean | null; spawnDepth: number | null };
  lastTs: string | null;
  /** La última línea fue una respuesta final del agente (`end_turn`) y nada la siguió. */
  endedClean: boolean;
}
interface StoredSession extends Omit<OrchSession, 'agents'> {
  file: string;
  agents: Record<string, StoredAgent>;
  launches: Record<string, Launch>;
  tracker: Tracker;
  offset: number;
  size: number;
}
interface StoredState {
  version: 1;
  sessions: Record<string, StoredSession>;
  /** Hasta dónde se leyó cada transcripción de agente. */
  offsets: Record<string, number>;
}

const zero = (): OrchTokens => ({ input: 0, output: 0, cacheCreate: 0, cacheRead: 0 });
const newTracker = (): Tracker => ({ tokens: zero(), byDay: {}, pending: null });
const weight = (usage: OrchTokens): number => usage.input + usage.output + usage.cacheCreate;
const dayOf = (timestamp: string): string => timestamp.slice(0, 10);

/** Suma el mensaje pendiente al total. Un mensaje del asistente llega en varias líneas (una por bloque) con el mismo `id`: se cuenta una vez. */
const commit = (tracker: Tracker): void => {
  const pending = tracker.pending;
  if (!pending) return;
  tracker.tokens.input += pending.usage.input;
  tracker.tokens.output += pending.usage.output;
  tracker.tokens.cacheCreate += pending.usage.cacheCreate;
  tracker.tokens.cacheRead += pending.usage.cacheRead;
  tracker.byDay[pending.day] = (tracker.byDay[pending.day] ?? 0) + weight(pending.usage);
  tracker.pending = null;
};
const addUsage = (tracker: Tracker, id: string, usage: UsageNumbers, day: string): void => {
  // El mismo mensaje otra vez: reemplaza al pendiente (el último trae el total del mensaje).
  if (tracker.pending && tracker.pending.id !== id) commit(tracker);
  tracker.pending = { id, usage, day };
};
const totalOf = (tracker: Tracker): { tokens: OrchTokens; byDay: Record<string, number> } => {
  const tokens = { ...tracker.tokens };
  const byDay = { ...tracker.byDay };
  const pending = tracker.pending;
  if (pending) {
    tokens.input += pending.usage.input;
    tokens.output += pending.usage.output;
    tokens.cacheCreate += pending.usage.cacheCreate;
    tokens.cacheRead += pending.usage.cacheRead;
    byDay[pending.day] = (byDay[pending.day] ?? 0) + weight(pending.usage);
  }
  return { tokens, byDay };
};

// ------------------------------------------------------------------ lectura de archivos
const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Lee las líneas COMPLETAS de un archivo a partir de `start` y devuelve hasta dónde llegó (el final de la última línea con salto).
 * Una línea que todavía se está escribiendo se deja para la próxima vez.
 */
const readLines = (path: string, start: number, onLine: (line: string) => void): Promise<number> =>
  new Promise((resolve, reject) => {
    let rest = Buffer.alloc(0);
    let consumed = start;
    const stream = createReadStream(path, { start });
    stream.on('data', (chunk: Buffer | string) => {
      rest = Buffer.concat([rest, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      let from = 0;
      for (let at = rest.indexOf(10, from); at !== -1; at = rest.indexOf(10, from)) {
        if (at > from) onLine(rest.subarray(from, at).toString('utf8'));
        consumed += at + 1 - from;
        from = at + 1;
      }
      rest = rest.subarray(from);
    });
    stream.on('end', () => resolve(consumed));
    stream.on('error', reject);
  });

const usageOf = (message: Record<string, unknown>): UsageNumbers | null => {
  const usage = asRecord(message['usage']);
  if (!Object.keys(usage).length) return null;
  return { input: num(usage['input_tokens']), output: num(usage['output_tokens']), cacheCreate: num(usage['cache_creation_input_tokens']), cacheRead: num(usage['cache_read_input_tokens']) };
};

const TS = /"timestamp":"([^"]+)"/;

/** Qué se saca de una línea de transcripción (de la conversación principal o de un agente). */
interface LineHandler {
  tracker: Tracker;
  /** Cuenta una herramienta usada. */
  tool: (name: string) => void;
  launch: (toolUseId: string, input: Record<string, unknown>) => void;
  model: (model: string) => void;
  /** Datos de contexto de una línea del asistente (carpeta, rama, cómo se abrió). */
  context?: (entry: Record<string, unknown>) => void;
  /** Cierre de un mensaje del asistente: `true` si fue una respuesta final. */
  stop?: (clean: boolean) => void;
}

const handleLine = (line: string, handler: LineHandler): string | null => {
  const timestamp = TS.exec(line)?.[1] ?? null;
  if (!line.includes('"type":"assistant"')) return timestamp;
  let entry: Record<string, unknown>;
  try {
    entry = asRecord(JSON.parse(line));
  } catch {
    return timestamp;
  }
  handler.context?.(entry);
  const message = asRecord(entry['message']);
  handler.stop?.(message['stop_reason'] === 'end_turn');
  const usage = usageOf(message);
  if (usage && typeof message['id'] === 'string') addUsage(handler.tracker, message['id'], usage, dayOf(timestamp ?? new Date().toISOString()));
  if (typeof message['model'] === 'string' && message['model'] !== '<synthetic>') handler.model(message['model']);
  const content = message['content'];
  if (Array.isArray(content)) {
    for (const raw of content) {
      const block = asRecord(raw);
      if (block['type'] !== 'tool_use' || typeof block['name'] !== 'string') continue;
      handler.tool(block['name']);
      if ((block['name'] === 'Agent' || block['name'] === 'Task') && typeof block['id'] === 'string') handler.launch(block['id'], asRecord(block['input']));
    }
  }
  return timestamp;
};

const readJson = (path: string): Record<string, unknown> => {
  try {
    return asRecord(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return {};
  }
};

const MODEL_ALIAS: Record<string, string> = { opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' };
/** `claude-opus-5-5` → `opus`; deja pasar lo que no reconoce. */
export const shortModel = (model: string | null): string | null => {
  if (!model) return null;
  const family = /(opus|sonnet|haiku|fable)/i.exec(model)?.[1]?.toLowerCase();
  return family ? (MODEL_ALIAS[family] ?? family) : model.slice(0, 30);
};

// ------------------------------------------------------------------ el escáner
export interface ClaudeDir {
  dir: string;
  label: string;
}

export const createOrchestration = (options: { file: string; now?: () => number }) => {
  const now = options.now ?? Date.now;
  const load = (): StoredState => {
    try {
      const raw = asRecord(JSON.parse(readFileSync(options.file, 'utf8')));
      if (raw['version'] === 1 && typeof raw['sessions'] === 'object') return { version: 1, sessions: raw['sessions'] as Record<string, StoredSession>, offsets: asRecord(raw['offsets']) as Record<string, number> };
    } catch {
      /* sin archivo o dañado: se empieza de cero */
    }
    return { version: 1, sessions: {}, offsets: {} };
  };
  let state = load();
  let scanning: Promise<void> | null = null;
  let lastScan = 0;

  const save = (): void => {
    try {
      mkdirSync(join(options.file, '..'), { recursive: true });
      writeFileSync(`${options.file}.tmp`, JSON.stringify(state), { mode: 0o600 });
      renameSync(`${options.file}.tmp`, options.file);
    } catch {
      /* sin disco: sigue en memoria */
    }
  };

  const scanSession = async (mainFile: string, sessionId: string, account: string): Promise<void> => {
    const size = statSync(mainFile).size;
    let session: StoredSession | undefined = state.sessions[sessionId];
    // El archivo se achicó (lo reescribieron): se vuelve a leer la sesión entera.
    if (session && size < session.offset) session = undefined;
    if (!session) {
      session = { id: sessionId, account, file: mainFile, title: null, project: null, branch: null, entrypoint: null, ticket: null, firstAt: null, lastAt: null, main: { tokens: zero(), byDay: {}, toolCount: 0 }, agents: {}, launches: {}, tracker: newTracker(), offset: 0, size: 0 };
      state.sessions[sessionId] = session;
    }
    const target = session;
    const handler: LineHandler = {
      tracker: target.tracker,
      tool: () => {
        target.main.toolCount += 1;
      },
      launch: (toolUseId, input) => {
        target.launches[toolUseId] = { owner: null, type: cleanText(input['subagent_type'], 40, 'general-purpose'), description: cleanText(input['description'], 140, 'Agente'), model: typeof input['model'] === 'string' ? input['model'] : null, background: input['run_in_background'] === true };
      },
      model: () => undefined,
      context: (entry) => {
        if (!target.project && typeof entry['cwd'] === 'string' && entry['cwd']) target.project = basename(entry['cwd']);
        if (typeof entry['gitBranch'] === 'string' && entry['gitBranch']) target.branch = entry['gitBranch'];
        if (!target.entrypoint && typeof entry['entrypoint'] === 'string') target.entrypoint = entry['entrypoint'];
      },
    };
    if (size > target.offset) {
      target.offset = await readLines(mainFile, target.offset, (line) => {
        const stamp = handleLine(line, handler);
        if (stamp) {
          if (!target.firstAt || stamp < target.firstAt) target.firstAt = stamp;
          if (!target.lastAt || stamp > target.lastAt) target.lastAt = stamp;
        }
        if (line.includes('"type":"ai-title"')) {
          try {
            const title = asRecord(JSON.parse(line))['aiTitle'];
            if (typeof title === 'string' && title.trim()) target.title = cleanText(title, 120, '');
          } catch {
            /* línea rara */
          }
        }
      });
    }
    target.size = size;
    const sessionDir = mainFile.slice(0, -'.jsonl'.length);
    const custom = readJson(join(sessionDir, 'custom-title.json'))['customTitle'];
    if (typeof custom === 'string' && custom.trim()) target.title = cleanText(custom, 120, '') || target.title;
    // Los agentes de la sesión.
    const subDir = join(sessionDir, 'subagents');
    for (const name of safeList(subDir)) {
      const match = /^agent-([A-Za-z0-9_-]+)\.jsonl$/.exec(name);
      if (match) await scanAgent(target, join(subDir, name), match[1]!);
    }
    resolveTree(target);
  };

  const scanAgent = async (session: StoredSession, file: string, agentId: string): Promise<void> => {
    const meta = readJson(file.replace(/\.jsonl$/, '.meta.json'));
    let agent: StoredAgent | undefined = session.agents[agentId];
    const size = statSync(file).size;
    const offset = state.offsets[file] ?? 0;
    if (agent && size < offset) agent = undefined;
    if (!agent) {
      agent = { agentId, toolUseId: null, parentAgentId: null, depth: 1, type: 'agent', description: 'Agente', model: null, background: false, status: 'running', startedAt: null, endedAt: null, tokens: zero(), byDay: {}, toolCount: 0, toolStats: {}, source: 'transcript', file, tracker: newTracker(), meta: { finished: null, spawnDepth: null }, lastTs: null, endedClean: false };
      session.agents[agentId] = agent;
      state.offsets[file] = 0;
    }
    const target = agent;
    const handler: LineHandler = {
      tracker: target.tracker,
      tool: (name) => {
        target.toolCount += 1;
        target.toolStats[name] = (target.toolStats[name] ?? 0) + 1;
      },
      launch: (toolUseId, input) => {
        session.launches[toolUseId] = { owner: agentId, type: cleanText(input['subagent_type'], 40, 'general-purpose'), description: cleanText(input['description'], 140, 'Agente'), model: typeof input['model'] === 'string' ? input['model'] : null, background: input['run_in_background'] === true };
      },
      model: (model) => {
        if (!target.model || target.model.length < model.length) target.model = model;
      },
      stop: (clean) => {
        target.endedClean = clean;
      },
    };
    if (size > (state.offsets[file] ?? 0)) {
      state.offsets[file] = await readLines(file, state.offsets[file] ?? 0, (line) => {
        // Algo que viene después de una respuesta final (un pedido, un resultado de herramienta) la deja sin cerrar.
        if (line.includes('"type":"user"')) target.endedClean = false;
        const stamp = handleLine(line, handler);
        if (stamp) {
          if (!target.startedAt || stamp < target.startedAt) target.startedAt = stamp;
          if (!target.lastTs || stamp > target.lastTs) target.lastTs = stamp;
        }
      });
    }
    // Lo que dice el meta (cambia cuando el agente termina).
    target.toolUseId = typeof meta['toolUseId'] === 'string' ? meta['toolUseId'] : target.toolUseId;
    if (typeof meta['agentType'] === 'string') target.type = cleanText(meta['agentType'], 40, target.type);
    if (typeof meta['description'] === 'string') target.description = cleanText(meta['description'], 140, target.description);
    if (typeof meta['model'] === 'string' && !target.model) target.model = meta['model'];
    target.background = meta['requestShape'] === 'background' || target.background;
    target.meta = { finished: typeof meta['finished'] === 'boolean' ? meta['finished'] : null, spawnDepth: typeof meta['spawnDepth'] === 'number' ? meta['spawnDepth'] : null };
    target.file = file;
  };

  /** Une cada agente con quien lo lanzó (la conversación o otro agente), calcula su profundidad y su estado. */
  const resolveTree = (session: StoredSession): void => {
    const current = now();
    for (const agent of Object.values(session.agents)) {
      const launch = agent.toolUseId ? session.launches[agent.toolUseId] : undefined;
      agent.parentAgentId = launch?.owner ?? null;
      if (launch) {
        if (agent.description === 'Agente') agent.description = launch.description;
        if (agent.type === 'agent') agent.type = launch.type;
        agent.background = agent.background || launch.background;
        if (!agent.model) agent.model = launch.model;
      }
      const totals = totalOf(agent.tracker);
      agent.tokens = totals.tokens;
      agent.byDay = totals.byDay;
      const last = agent.lastTs ? Date.parse(agent.lastTs) : 0;
      // En segundo plano el meta dice si terminó; en primer plano no lo dice: terminó si su última línea fue una respuesta final.
      const finished = agent.meta.finished === true || (agent.meta.finished === null && agent.endedClean);
      agent.status = finished ? 'done' : current - last < STALE_MS ? 'running' : 'lost';
      agent.endedAt = agent.status === 'running' ? null : agent.lastTs;
    }
    for (const agent of Object.values(session.agents)) {
      let depth = 1;
      for (let parent = agent.parentAgentId, guard = 0; parent && guard < 10; guard += 1) {
        depth += 1;
        parent = session.agents[parent]?.parentAgentId ?? null;
      }
      agent.depth = depth;
    }
    const mainTotals = totalOf(session.tracker);
    session.main.tokens = mainTotals.tokens;
    session.main.byDay = mainTotals.byDay;
    // El ticket de la sesión: el de su carpeta o rama o, si no, el que más aparece en lo que se les pidió a los agentes.
    const counts = new Map<string, number>();
    for (const agent of Object.values(session.agents)) {
      const found = ticketOfText(agent.description);
      if (found) counts.set(found, (counts.get(found) ?? 0) + 1);
    }
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    session.ticket = ticketOfText(session.project ?? '') ?? ticketOfText(session.branch ?? '') ?? common;
  };

  /** Recorre las carpetas de Claude y actualiza lo que cambió. Una sola pasada a la vez. */
  const scan = (dirs: ClaudeDir[]): Promise<void> => {
    if (scanning) return scanning;
    scanning = (async () => {
      const startedAt = now();
      const cutoff = startedAt - RETENTION_MS;
      for (const { dir, label } of dirs) {
        const projects = join(dir, 'projects');
        for (const folder of safeList(projects)) {
          const base = join(projects, folder);
          for (const name of safeList(base)) {
            const match = /^([A-Za-z0-9_-]+)\.jsonl$/.exec(name);
            if (!match) continue;
            const sessionId = match[1]!;
            const file = join(base, name);
            try {
              const stats = statSync(file);
              const agentsChanged = newestInside(join(base, sessionId, 'subagents'));
              if (stats.mtimeMs < cutoff && agentsChanged < cutoff) continue;
              const known = state.sessions[sessionId];
              // Nada cambió desde la última pasada: solo se refrescan los estados (un agente sin actividad pasa de «trabajando» a «interrumpido»).
              if (known && known.size === stats.size && stats.mtimeMs <= lastScan && agentsChanged <= lastScan) resolveTree(known);
              else await scanSession(file, sessionId, label);
            } catch {
              /* una sesión que no se puede leer no frena a las demás */
            }
          }
        }
      }
      prune();
      lastScan = startedAt;
      save();
    })().finally(() => {
      scanning = null;
    });
    return scanning;
  };

  const prune = (): void => {
    const cutoff = now() - RETENTION_MS;
    for (const [id, session] of Object.entries(state.sessions)) {
      if ((session.lastAt ? Date.parse(session.lastAt) : 0) < cutoff) {
        for (const agent of Object.values(session.agents)) delete state.offsets[agent.file];
        delete state.sessions[id];
      }
    }
    const extra = Object.keys(state.sessions).length - MAX_SESSIONS;
    if (extra > 0) {
      Object.values(state.sessions)
        .sort((a, b) => (a.lastAt ?? '').localeCompare(b.lastAt ?? ''))
        .slice(0, extra)
        .forEach((session) => delete state.sessions[session.id]);
    }
  };

  const publicAgent = (agent: StoredAgent): OrchAgent => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { file: _file, tracker: _tracker, meta: _meta, lastTs: _last, ...rest } = agent;
    return rest;
  };

  /** Las sesiones guardadas (más recientes primero), sin lo interno. */
  const sessions = (): OrchSession[] =>
    Object.values(state.sessions)
      .map((session) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { file: _file, launches: _launches, tracker: _tracker, offset: _offset, size: _size, agents, ...rest } = session;
        return { ...rest, agents: Object.values(agents).sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? '') || a.agentId.localeCompare(b.agentId)).slice(0, MAX_AGENTS_PER_SESSION).map(publicAgent) };
      })
      .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));

  /**
   * Pedido, respuesta y pasos de un agente, leídos de su transcripción AHORA (no se guardan). Solo se abre un archivo si, ya resuelto,
   * está dentro de `projects/` de una carpeta de Claude; el cliente nunca manda rutas, solo ids.
   */
  const content = (sessionId: string, agentId: string, claudeDirs: string[]): { request: string | null; response: string | null; steps: AgentStep[]; available: boolean } | null => {
    if (!ID.test(sessionId) || !ID.test(agentId)) return null;
    const agent = state.sessions[sessionId]?.agents[agentId];
    if (!agent) return null;
    if (!isAllowedTranscript(agent.file, claudeDirs) || !existsSync(agent.file)) return { request: null, response: null, steps: [], available: false };
    try {
      const head = readBytes(agent.file, 0, HEAD_BYTES);
      const size = statSync(agent.file).size;
      const tail = size > HEAD_BYTES ? readBytes(agent.file, Math.max(HEAD_BYTES, size - TAIL_BYTES), TAIL_BYTES) : '';
      const completeHead = size > HEAD_BYTES ? head.slice(0, head.lastIndexOf('\n') + 1) : head;
      const first = completeHead.split('\n', 1)[0] ?? '';
      let request: string | null = null;
      try {
        const message = asRecord(asRecord(JSON.parse(first))['message']);
        const text = message['content'];
        request = cleanBlock(typeof text === 'string' ? text : Array.isArray(text) ? text.map((block) => (typeof asRecord(block)['text'] === 'string' ? (asRecord(block)['text'] as string) : '')).join('\n') : null);
      } catch {
        request = null;
      }
      const response = lastAgentReply(size > HEAD_BYTES ? tail.slice(tail.indexOf('\n') + 1) : completeHead);
      return { request, response: response ? cleanBlock(response) : null, steps: agentSteps(completeHead, MAX_STEPS), available: true };
    } catch {
      return { request: null, response: null, steps: [], available: false };
    }
  };

  return { scan, sessions, content, reset: () => ((state = { version: 1, sessions: {}, offsets: {} }), save()), lastScanAt: () => lastScan };
};

const safeList = (path: string): string[] => {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
};

/** La fecha de modificación más reciente de los archivos de una carpeta (0 si no existe). */
const newestInside = (path: string): number => safeList(path).reduce((newest, name) => {
  try {
    return Math.max(newest, statSync(join(path, name)).mtimeMs);
  } catch {
    return newest;
  }
}, 0);

const readBytes = (path: string, start: number, length: number): string => {
  const size = statSync(path).size;
  const count = Math.max(0, Math.min(length, size - start));
  const buffer = Buffer.alloc(count);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, count, start);
  } finally {
    closeSync(fd);
  }
  return buffer.toString('utf8');
};

/** Lo que de un agente sabe el hook (la lista de `agents.ts`). */
export interface HookRunLike {
  id: string;
  sessionId: string;
  agentId: string | null;
  type: string;
  description: string;
  startedAt: string;
  endedAt: string | null;
  status: AgentStatus;
  project: string | null;
  ticket: string | null;
}

/**
 * Suma a las sesiones leídas de las transcripciones los agentes que solo vieron los hooks (por ejemplo, de una cuenta de Claude que el
 * panel no tiene configurada): cuelgan de su sesión o arman una con lo poco que se sabe. Los que ya están en una sesión no se repiten.
 */
export const mergeHookRuns = (sessions: OrchSession[], runs: HookRunLike[]): OrchSession[] => {
  const known = new Set(sessions.flatMap((session) => session.agents.map((agent) => agent.agentId)));
  const out = sessions.map((session) => ({ ...session, agents: [...session.agents] }));
  for (const run of runs) {
    const agentId = run.agentId ?? run.id;
    if (known.has(agentId)) continue;
    known.add(agentId);
    let session = out.find((item) => item.id === run.sessionId);
    if (!session) {
      session = { id: run.sessionId, account: '', title: null, project: run.project, branch: null, entrypoint: null, ticket: run.ticket, firstAt: run.startedAt, lastAt: run.endedAt ?? run.startedAt, main: { tokens: zero(), byDay: {}, toolCount: 0 }, agents: [] };
      out.push(session);
    }
    session.agents.push({ agentId, toolUseId: null, parentAgentId: null, depth: 1, type: run.type, description: run.description, model: null, background: false, status: run.status, startedAt: run.startedAt, endedAt: run.endedAt, tokens: zero(), byDay: {}, toolCount: 0, toolStats: {}, source: 'hook' });
    if (!session.lastAt || (run.endedAt ?? run.startedAt) > session.lastAt) session.lastAt = run.endedAt ?? run.startedAt;
  }
  return out.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
};

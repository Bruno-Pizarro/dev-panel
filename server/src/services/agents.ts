import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { paths } from '../config.js';
import type { AgentStep } from './agentTranscript.js';
import { cleanBlock } from './redact.js';

/**
 * Agentes que Claude Code delega a un subagente, para mostrarlos en el panel mientras trabajan y en el árbol de la vista Agentes.
 * Los hooks de Claude Code (PreToolUse del Agent, SubagentStart y SubagentStop) mandan su entrada tal cual y acá se reduce a lo
 * mínimo que se muestra: tipo, descripción corta, tiempos, nombre de la carpeta y ticket. Además, si el interruptor está activo
 * (`saveContent`), se guardan lo que se le pidió al agente y lo que contestó, con los secretos obvios tapados (`redact.ts`) y
 * recortados. Esos textos no viajan en la lista ni por SSE: se piden de a uno. Historial de 3 días en `data/agents-history.json`.
 */
export interface AgentRun {
  id: string;
  sessionId: string;
  /** Tipo de agente (por ejemplo "Explore" o "general-purpose"). */
  type: string;
  description: string;
  startedAt: string;
  endedAt: string | null;
  /** `lost`: nunca llegó su aviso de fin (la sesión se cortó, por ejemplo) y pasó el tiempo máximo. */
  status: 'running' | 'done' | 'lost';
  /** Id que le da Claude Code al subagente cuando arranca; hasta entonces es null. */
  agentId: string | null;
  /** Nombre de la carpeta de trabajo de la sesión (solo el último tramo de la ruta). */
  project: string | null;
  /** Ticket que se deduce de la descripción o de la rama de la carpeta. */
  ticket: string | null;
  /** Lo que se le pidió al agente y lo que contestó (con los secretos tapados); null si no se guardó. */
  request: string | null;
  response: string | null;
  /** Herramientas que usó el agente, en orden (solo si se guarda el contenido); null si no se guardaron. */
  steps: AgentStep[] | null;
}

/** Lo que se muestra en la lista y viaja por SSE: sin los textos largos, solo si los hay. */
export type AgentSummary = Omit<AgentRun, 'request' | 'response' | 'steps'> & { hasRequest: boolean; hasResponse: boolean; hasSteps: boolean };

/** Cuánto dura el historial, cuánto puede figurar "trabajando" sin avisar que terminó y cuántos agentes se guardan como máximo. */
export const HISTORY_MS = 3 * 24 * 60 * 60_000;
export const RUNNING_MAX_MS = 3 * 60 * 60_000;
export const MAX_RUNS = 200;

const MAX_TYPE = 40;
const MAX_DESCRIPTION = 140;

/** Una línea de texto corta y sin caracteres de control. */
export const cleanText = (value: unknown, max: number, fallback: string): string => {
  // eslint-disable-next-line no-control-regex
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return text ? text.slice(0, max) : fallback;
};

const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Número de ticket (5 o 6 dígitos, sin ser parte de un número más largo) que aparece en un texto. */
export const ticketOfText = (text: string): string | null => /(?<!\d)(\d{5,6})(?!\d)/.exec(text)?.[1] ?? null;

/** Datos de la sesión que el servidor averigua por su cuenta (la rama de la carpeta) y le pasa al procesar un hook. */
export interface HookContext {
  branchTicket?: string | null;
  /** El informe final del agente cuando el hook no lo trae (se saca de su transcripción). */
  response?: string | null;
  /** Los pasos del agente, sacados de su transcripción. */
  steps?: AgentStep[] | null;
}

interface StoreOptions {
  now?: () => number;
  /** Agentes guardados de antes (el historial). */
  initial?: AgentRun[];
  /** Se llama después de cada cambio con la lista completa, para guardarla. */
  onChange?: (runs: AgentRun[]) => void;
  /** Si hay que guardar el pedido y la respuesta de los agentes (por defecto sí). */
  saveContent?: () => boolean;
}

const isRun = (value: unknown): value is AgentRun => {
  const run = asRecord(value);
  return typeof run['id'] === 'string' && typeof run['startedAt'] === 'string' && typeof run['type'] === 'string' && (run['status'] === 'running' || run['status'] === 'done' || run['status'] === 'lost');
};

export const createAgentStore = (options: StoreOptions | (() => number) = {}) => {
  const { now = Date.now, initial = [], onChange, saveContent = () => true } = typeof options === 'function' ? ({ now: options } as StoreOptions) : options;
  const runs = new Map<string, AgentRun>(initial.filter(isRun).map((run) => [run.id, { ...run, project: run.project ?? null, ticket: run.ticket ?? null, request: run.request ?? null, response: run.response ?? null, steps: run.steps ?? null }]));
  let counter = 0;
  const changed = (): void => onChange?.([...runs.values()]);

  /** Pasados 3 días sale del historial; el que sigue "trabajando" pasadas 3 horas sin avisar se marca perdido; y se guardan como mucho 200. */
  const prune = (): void => {
    const current = now();
    for (const [id, run] of runs) {
      if (current - Date.parse(run.endedAt ?? run.startedAt) > HISTORY_MS) runs.delete(id);
      else if (run.status === 'running' && current - Date.parse(run.startedAt) > RUNNING_MAX_MS) run.status = 'lost';
    }
    const extra = runs.size - MAX_RUNS;
    if (extra > 0) [...runs.values()].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)).slice(0, extra).forEach((run) => runs.delete(run.id));
  };

  const sorted = (): AgentRun[] => {
    prune();
    return [...runs.values()].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id));
  };

  const summary = ({ request, response, steps, ...rest }: AgentRun): AgentSummary => ({ ...rest, hasRequest: request !== null, hasResponse: response !== null, hasSteps: steps !== null && steps.length > 0 });
  /** La lista que ve el navegador: sin los textos largos. */
  const list = (): AgentSummary[] => sorted().map(summary);
  /** Un agente completo, con su pedido y su respuesta. */
  const get = (id: string): AgentRun | undefined => {
    prune();
    return runs.get(id);
  };

  const open = (sessionId: string, type: string, description: string, agentId: string | null, project: string | null, ticket: string | null, request: string | null, id?: string): AgentRun => {
    counter += 1;
    const run: AgentRun = { id: id ?? `run-${counter}-${now()}`, sessionId, type, description, startedAt: new Date(now()).toISOString(), endedAt: null, status: 'running', agentId, project, ticket, request, response: null, steps: null };
    runs.set(run.id, run);
    return run;
  };

  /**
   * Procesa la entrada de un hook de Claude Code. Devuelve true si cambió algo que haya que mostrar.
   *  - PreToolUse (herramienta Agent): anuncia el agente con su descripción.
   *  - SubagentStart: el agente arrancó; se lo une al anuncio más viejo de la misma sesión y tipo, o se crea uno sin descripción.
   *  - SubagentStop: el agente terminó.
   */
  const handleHook = (raw: unknown, context: HookContext = {}): boolean => {
    const input = asRecord(raw);
    const cwd = typeof input['cwd'] === 'string' ? input['cwd'] : '';
    const project = cwd ? cleanText(basename(cwd), 60, '') || null : null;
    const event = input['hook_event_name'];
    const sessionId = cleanText(input['session_id'], 80, 'sin-sesion');
    if (event === 'PreToolUse') {
      const tool = input['tool_name'];
      if (tool !== 'Agent' && tool !== 'Task') return false;
      const toolInput = asRecord(input['tool_input']);
      const description = cleanText(toolInput['description'], MAX_DESCRIPTION, 'Tarea delegada');
      open(sessionId, cleanText(toolInput['subagent_type'], MAX_TYPE, 'general-purpose'), description, null, project, ticketOfText(description) ?? context.branchTicket ?? null, saveContent() ? cleanBlock(toolInput['prompt']) : null, cleanText(input['tool_use_id'], 80, '') || undefined);
      changed();
      return true;
    }
    if (event === 'SubagentStart') {
      const agentId = cleanText(input['agent_id'], 80, '');
      if (!agentId) return false;
      const type = cleanText(input['agent_type'], MAX_TYPE, 'general-purpose');
      const announced = sorted().find((run) => run.agentId === null && run.status === 'running' && run.sessionId === sessionId && run.type === type);
      if (announced) {
        announced.agentId = agentId;
        announced.project ??= project;
      } else open(sessionId, type, 'Agente en segundo plano', agentId, project, context.branchTicket ?? null, null);
      changed();
      return true;
    }
    if (event === 'SubagentStop') {
      const agentId = cleanText(input['agent_id'], 80, '');
      const run = agentId ? [...runs.values()].find((candidate) => candidate.agentId === agentId) : undefined;
      if (!run) return false;
      run.status = 'done';
      run.endedAt = new Date(now()).toISOString();
      if (saveContent()) {
        run.response = cleanBlock(input['last_assistant_message'] ?? context.response);
        run.steps = context.steps?.length ? context.steps : null;
      }
      changed();
      return true;
    }
    return false;
  };

  /** Saca un agente de la lista (por si quedó colgado porque nunca llegó su aviso de fin). */
  const dismiss = (id: string): boolean => {
    const removed = runs.delete(id);
    if (removed) changed();
    return removed;
  };

  /** Borra el historial: los agentes terminados o perdidos (los que siguen trabajando se conservan). */
  const clearHistory = (): number => {
    let count = 0;
    for (const [id, run] of runs) {
      if (run.status !== 'running') {
        runs.delete(id);
        count += 1;
      }
    }
    if (count) changed();
    return count;
  };

  /** Borra el pedido y la respuesta guardados de todos los agentes (el resto del historial se conserva). */
  const clearContent = (): number => {
    let count = 0;
    for (const run of runs.values()) {
      if (run.request !== null || run.response !== null || run.steps !== null) {
        run.request = null;
        run.response = null;
        run.steps = null;
        count += 1;
      }
    }
    if (count) changed();
    return count;
  };

  return { list, get, handleHook, dismiss, clearHistory, clearContent };
};

const historyFile = () => join(paths.data, 'agents-history.json');
const settingsFile = () => join(paths.data, 'agents-settings.json');

const loadHistory = (): AgentRun[] => {
  try {
    const parsed: unknown = existsSync(historyFile()) ? JSON.parse(readFileSync(historyFile(), 'utf8')) : [];
    return Array.isArray(parsed) ? (parsed.filter(isRun) as AgentRun[]) : [];
  } catch {
    return [];
  }
};

const writeJson = (file: string, value: unknown): void => {
  try {
    mkdirSync(paths.data, { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  } catch {
    /* sin disco: vale solo hasta reiniciar el panel */
  }
};

/** Preferencias del aviso de agentes (propias del panel, no de la máquina: viven en `data/`). */
export interface AgentSettings {
  /** Guardar lo que se le pidió a cada agente y lo que contestó. Por defecto, sí. */
  saveContent: boolean;
}

export const getAgentSettings = (): AgentSettings => {
  try {
    const parsed = existsSync(settingsFile()) ? (JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<AgentSettings>) : {};
    return { saveContent: parsed.saveContent !== false };
  } catch {
    return { saveContent: true };
  }
};

export const setAgentSettings = (patch: Partial<AgentSettings>): AgentSettings => {
  const next = { ...getAgentSettings(), ...(typeof patch.saveContent === 'boolean' ? { saveContent: patch.saveContent } : {}) };
  writeJson(settingsFile(), next);
  return next;
};

/** La lista única del servidor, con su historial de 3 días en disco. */
export const agents = createAgentStore({ initial: loadHistory(), onChange: (runs) => writeJson(historyFile(), runs), saveContent: () => getAgentSettings().saveContent });

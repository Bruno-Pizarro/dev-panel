/**
 * Agentes que Claude Code delega a un subagente, para mostrarlos en el panel mientras trabajan. Los hooks de Claude Code
 * (PreToolUse del Agent, SubagentStart y SubagentStop) mandan su entrada tal cual y acá se reduce a lo mínimo que se muestra:
 * tipo, descripción corta y tiempos. Nunca se guarda el prompt ni lo que contesta el agente. Todo vive en memoria.
 */
export interface AgentRun {
  id: string;
  sessionId: string;
  /** Tipo de agente (por ejemplo "Explore" o "general-purpose"). */
  type: string;
  description: string;
  startedAt: string;
  endedAt: string | null;
  status: 'running' | 'done';
  /** Id que le da Claude Code al subagente cuando arranca; hasta entonces es null. */
  agentId: string | null;
}

/** Cuánto se queda en la lista un agente que ya terminó, y cuánto uno que nunca avisó que terminó. */
export const DONE_KEEP_MS = 60_000;
export const RUNNING_MAX_MS = 3 * 60 * 60_000;

const MAX_TYPE = 40;
const MAX_DESCRIPTION = 140;

/** Una línea de texto corta y sin caracteres de control. */
export const cleanText = (value: unknown, max: number, fallback: string): string => {
  // eslint-disable-next-line no-control-regex
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return text ? text.slice(0, max) : fallback;
};

const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export const createAgentStore = (now: () => number = Date.now) => {
  const runs = new Map<string, AgentRun>();
  let counter = 0;

  const prune = (): void => {
    const current = now();
    for (const [id, run] of runs) {
      const reference = Date.parse(run.endedAt ?? run.startedAt);
      if (run.status === 'done' ? current - reference > DONE_KEEP_MS : current - reference > RUNNING_MAX_MS) runs.delete(id);
    }
  };

  const list = (): AgentRun[] => {
    prune();
    return [...runs.values()].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id));
  };

  const open = (sessionId: string, type: string, description: string, agentId: string | null, id?: string): AgentRun => {
    counter += 1;
    const run: AgentRun = { id: id ?? `run-${counter}`, sessionId, type, description, startedAt: new Date(now()).toISOString(), endedAt: null, status: 'running', agentId };
    runs.set(run.id, run);
    return run;
  };

  /**
   * Procesa la entrada de un hook de Claude Code. Devuelve true si cambió algo que haya que mostrar.
   *  - PreToolUse (herramienta Agent): anuncia el agente con su descripción.
   *  - SubagentStart: el agente arrancó; se lo une al anuncio más viejo de la misma sesión y tipo, o se crea uno sin descripción.
   *  - SubagentStop: el agente terminó.
   */
  const handleHook = (raw: unknown): boolean => {
    const input = asRecord(raw);
    const event = input['hook_event_name'];
    const sessionId = cleanText(input['session_id'], 80, 'sin-sesion');
    if (event === 'PreToolUse') {
      const tool = input['tool_name'];
      if (tool !== 'Agent' && tool !== 'Task') return false;
      const toolInput = asRecord(input['tool_input']);
      open(sessionId, cleanText(toolInput['subagent_type'], MAX_TYPE, 'general-purpose'), cleanText(toolInput['description'], MAX_DESCRIPTION, 'Tarea delegada'), null, cleanText(input['tool_use_id'], 80, '') || undefined);
      return true;
    }
    if (event === 'SubagentStart') {
      const agentId = cleanText(input['agent_id'], 80, '');
      if (!agentId) return false;
      const type = cleanText(input['agent_type'], MAX_TYPE, 'general-purpose');
      const announced = list().find((run) => run.agentId === null && run.status === 'running' && run.sessionId === sessionId && run.type === type);
      if (announced) announced.agentId = agentId;
      else open(sessionId, type, 'Agente en segundo plano', agentId);
      return true;
    }
    if (event === 'SubagentStop') {
      const agentId = cleanText(input['agent_id'], 80, '');
      const run = agentId ? [...runs.values()].find((candidate) => candidate.agentId === agentId) : undefined;
      if (!run) return false;
      run.status = 'done';
      run.endedAt = new Date(now()).toISOString();
      return true;
    }
    return false;
  };

  /** Saca un agente de la lista (por si quedó colgado porque nunca llegó su aviso de fin). */
  const dismiss = (id: string): boolean => runs.delete(id);

  return { list, handleHook, dismiss };
};

/** La lista única del servidor. */
export const agents = createAgentStore();

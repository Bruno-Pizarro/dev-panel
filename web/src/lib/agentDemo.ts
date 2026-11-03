import type { AgentRun } from './types';

/** Evento con el que Configuración le pide al aviso de agentes que muestre una vista previa (sin tocar el servidor). */
export const AGENT_DEMO_EVENT = 'dev-panel:agent-demo';
/** Cuánto dura la vista previa en pantalla. */
export const AGENT_DEMO_MS = 20_000;

export const showAgentDemo = (): void => {
  window.dispatchEvent(new Event(AGENT_DEMO_EVENT));
};

export const isDemoRun = (run: Pick<AgentRun, 'id'>): boolean => run.id.startsWith('demo-');

/** Agentes de ejemplo: dos trabajando y uno que ya terminó, para ver el carrusel y los tres estados. */
export const demoRuns = (now: number): AgentRun[] => {
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  return [
    { id: 'demo-1', sessionId: 'demo', type: 'Explore', description: 'Buscar dónde se define el visor de diffs de la pestaña Cambios', startedAt: at(47_000), endedAt: null, status: 'running', agentId: null, project: null, ticket: null },
    { id: 'demo-2', sessionId: 'demo', type: 'general-purpose', description: 'Revisar los tests del servidor y resumir los que fallan', startedAt: at(12_000), endedAt: null, status: 'running', agentId: null, project: null, ticket: null },
    { id: 'demo-3', sessionId: 'demo', type: 'Plan', description: 'Armar el plan de la pantalla de atajos de teclado', startedAt: at(95_000), endedAt: at(5_000), status: 'done', agentId: null, project: null, ticket: null },
  ];
};

import { describe, expect, it } from 'vitest';
import { cleanText, createAgentStore, DONE_KEEP_MS, RUNNING_MAX_MS } from './agents.js';

const pre = (over: Record<string, unknown> = {}) => ({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Agent', tool_use_id: 'toolu_1', tool_input: { subagent_type: 'Explore', description: 'Buscar el visor de diffs', prompt: 'SECRETO: no debe guardarse' }, ...over });

describe('agentes delegados', () => {
  it('un agente nuevo se anuncia, arranca y termina', () => {
    let clock = Date.parse('2026-11-03T12:00:00Z');
    const store = createAgentStore(() => clock);
    expect(store.handleHook(pre())).toBe(true);
    expect(store.list()).toMatchObject([{ id: 'toolu_1', type: 'Explore', description: 'Buscar el visor de diffs', status: 'running', agentId: null }]);
    clock += 2000;
    expect(store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a-1', agent_type: 'Explore' })).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]!.agentId).toBe('a-1');
    clock += 5000;
    expect(store.handleHook({ hook_event_name: 'SubagentStop', session_id: 's1', agent_id: 'a-1', agent_type: 'Explore', last_assistant_message: 'texto largo que no se guarda' })).toBe(true);
    expect(store.list()[0]).toMatchObject({ status: 'done', endedAt: '2026-11-03T12:00:07.000Z' });
  });

  it('nunca guarda el prompt ni lo que contesta el agente', () => {
    const store = createAgentStore();
    store.handleHook(pre());
    store.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'x', last_assistant_message: 'TOKEN-123' });
    expect(JSON.stringify(store.list())).not.toMatch(/SECRETO|TOKEN-123/);
  });

  it('dos agentes en paralelo se unen a su anuncio por sesión y tipo, en orden', () => {
    const store = createAgentStore();
    store.handleHook(pre({ tool_use_id: 't1', tool_input: { subagent_type: 'Explore', description: 'Uno' } }));
    store.handleHook(pre({ tool_use_id: 't2', tool_input: { subagent_type: 'general-purpose', description: 'Dos' } }));
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'b', agent_type: 'general-purpose' });
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a', agent_type: 'Explore' });
    expect(store.list().map((run) => [run.description, run.agentId])).toEqual([['Uno', 'a'], ['Dos', 'b']]);
  });

  it('un agente que arranca sin anuncio se muestra igual, sin descripción', () => {
    const store = createAgentStore();
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's9', agent_id: 'z', agent_type: 'Plan' });
    expect(store.list()).toMatchObject([{ type: 'Plan', description: 'Agente en segundo plano', status: 'running' }]);
  });

  it('ignora lo que no es de un agente: otras herramientas, eventos desconocidos y entradas inválidas', () => {
    const store = createAgentStore();
    expect(store.handleHook(pre({ tool_name: 'Bash' }))).toBe(false);
    expect(store.handleHook({ hook_event_name: 'Stop' })).toBe(false);
    expect(store.handleHook('basura')).toBe(false);
    expect(store.handleHook(null)).toBe(false);
    expect(store.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'nadie' })).toBe(false);
    expect(store.handleHook({ hook_event_name: 'SubagentStart' })).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('los terminados salen de la lista al minuto y los que nunca avisaron, a las 3 horas', () => {
    let clock = 0;
    const store = createAgentStore(() => clock);
    store.handleHook(pre({ tool_use_id: 'ok' }));
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a', agent_type: 'Explore' });
    store.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'a' });
    store.handleHook(pre({ tool_use_id: 'colgado' }));
    clock += DONE_KEEP_MS + 1;
    expect(store.list().map((run) => run.id)).toEqual(['colgado']);
    clock += RUNNING_MAX_MS;
    expect(store.list()).toEqual([]);
  });

  it('dismiss saca uno de la lista', () => {
    const store = createAgentStore();
    store.handleHook(pre());
    expect(store.dismiss('toolu_1')).toBe(true);
    expect(store.dismiss('toolu_1')).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('cleanText limpia caracteres de control, colapsa espacios y recorta', () => {
    expect(cleanText('  hola\n\tmundo\u0007  ', 50, 'x')).toBe('hola mundo');
    expect(cleanText('a'.repeat(300), 140, 'x')).toHaveLength(140);
    expect(cleanText(42, 10, 'por defecto')).toBe('por defecto');
    expect(cleanText('   ', 10, 'por defecto')).toBe('por defecto');
  });
});

describe('rutas de agentes', () => {
  it('POST /api/agents/event acepta la entrada de un hook, GET la lista y DELETE la saca', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerAgentRoutes } = await import('../routes/agents.js');
    const { agents } = await import('./agents.js');
    const app = Fastify();
    registerAgentRoutes(app);
    const post = await app.inject({ method: 'POST', url: '/api/agents/event', payload: pre({ tool_use_id: 'ruta-1' }) });
    expect(post.statusCode).toBe(202);
    const list = await app.inject({ method: 'GET', url: '/api/agents' });
    expect(list.json().agents.some((run: { id: string }) => run.id === 'ruta-1')).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: '/api/agents/ruta-1' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: '/api/agents/ruta-1' })).statusCode).toBe(404);
    expect(agents.list().some((run) => run.id === 'ruta-1')).toBe(false);
    // Un cuerpo que no es un hook igual se responde sin error y no agrega nada.
    expect((await app.inject({ method: 'POST', url: '/api/agents/event', payload: { cualquier: 'cosa' } })).statusCode).toBe(202);
    await app.close();
  });
});

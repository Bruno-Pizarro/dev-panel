import { describe, expect, it } from 'vitest';
import { REDACTED } from './redact.js';
import { cleanText, createAgentStore, HISTORY_MS, MAX_RUNS, RUNNING_MAX_MS, ticketOfText, type AgentRun } from './agents.js';

const pre = (over: Record<string, unknown> = {}) => ({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Agent', tool_use_id: 'toolu_1', tool_input: { subagent_type: 'Explore', description: 'Buscar el visor de diffs', prompt: 'Buscá el visor de diffs.\nUsá password=ValorInventado1 si hace falta.' }, ...over });

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

  it('guarda lo que se le pidió y lo que contestó, con los secretos tapados, y la lista no trae los textos', () => {
    const store = createAgentStore();
    store.handleHook(pre());
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a-1', agent_type: 'Explore' });
    store.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'a-1', last_assistant_message: 'Listo.\nEncontré el visor.\nSERVICE_TOKEN=valorinventado' });
    const [item] = store.list();
    expect(item).toMatchObject({ hasRequest: true, hasResponse: true });
    expect(JSON.stringify(store.list())).not.toMatch(/Buscá el visor|Encontré el visor|ValorInventado1|valorinventado/);
    const full = store.get('toolu_1')!;
    expect(full.request).toBe(`Buscá el visor de diffs.\nUsá password=${REDACTED} si hace falta.`);
    expect(full.response).toBe(`Listo.\nEncontré el visor.\nSERVICE_TOKEN=${REDACTED}`);
    expect(JSON.stringify(full)).not.toMatch(/ValorInventado1|valorinventado/);
  });

  it('guarda los pasos del agente; la lista solo avisa que existen y limpiar el contenido los borra', () => {
    const store = createAgentStore();
    store.handleHook(pre());
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a-1', agent_type: 'Explore' });
    store.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'a-1', last_assistant_message: 'ok' }, { steps: [{ tool: 'Read', summary: '/a.ts' }] });
    expect(store.list()[0]).toMatchObject({ hasSteps: true });
    expect(JSON.stringify(store.list())).not.toContain('/a.ts');
    expect(store.get('toolu_1')!.steps).toEqual([{ tool: 'Read', summary: '/a.ts' }]);
    store.clearContent();
    expect(store.list()[0]).toMatchObject({ hasSteps: false });
  });

  it('con el interruptor apagado no guarda ni el pedido ni la respuesta', () => {
    let save = false;
    const store = createAgentStore({ saveContent: () => save });
    store.handleHook(pre());
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a-1', agent_type: 'Explore' });
    store.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'a-1', last_assistant_message: 'texto' });
    expect(store.get('toolu_1')).toMatchObject({ request: null, response: null });
    expect(store.list()[0]).toMatchObject({ hasRequest: false, hasResponse: false });
    save = true;
    store.handleHook(pre({ tool_use_id: 'toolu_2' }));
    expect(store.get('toolu_2')!.request).not.toBeNull();
  });

  it('clearContent borra los textos guardados y deja el resto del historial', () => {
    const store = createAgentStore();
    store.handleHook(pre());
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a-1', agent_type: 'Explore' });
    store.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'a-1', last_assistant_message: 'texto' });
    expect(store.clearContent()).toBe(1);
    expect(store.get('toolu_1')).toMatchObject({ request: null, response: null, status: 'done', description: 'Buscar el visor de diffs' });
    expect(store.clearContent()).toBe(0);
  });

  it('get de un agente que no existe da undefined, y los textos viajan al disco con el resto', () => {
    let saved: AgentRun[] = [];
    const store = createAgentStore({ onChange: (runs) => (saved = runs) });
    expect(store.get('nadie')).toBeUndefined();
    store.handleHook(pre());
    expect(saved[0]!.request).toContain('Buscá el visor');
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

  it('el historial dura 3 días; el que sigue trabajando pasadas 3 horas sin avisar se marca perdido', () => {
    let clock = 0;
    const store = createAgentStore(() => clock);
    store.handleHook(pre({ tool_use_id: 'ok' }));
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a', agent_type: 'Explore' });
    store.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'a' });
    clock += 1000;
    store.handleHook(pre({ tool_use_id: 'colgado' }));
    clock += 60_000 + 1;
    expect(store.list().map((run) => [run.id, run.status])).toEqual([['ok', 'done'], ['colgado', 'running']]);
    clock += RUNNING_MAX_MS;
    expect(store.list().map((run) => [run.id, run.status])).toEqual([['ok', 'done'], ['colgado', 'lost']]);
    clock += HISTORY_MS;
    expect(store.list()).toEqual([]);
  });

  it('se guardan como mucho 200 agentes: salen los más viejos', () => {
    let clock = 0;
    const store = createAgentStore(() => clock);
    for (let i = 0; i < MAX_RUNS + 5; i += 1) {
      clock += 1000;
      store.handleHook(pre({ tool_use_id: `t${i}` }));
    }
    const ids = store.list().map((run) => run.id);
    expect(ids).toHaveLength(MAX_RUNS);
    expect(ids[0]).toBe('t5');
  });

  it('guarda la carpeta (solo el último tramo de la ruta) y el ticket de la descripción o, si no, el de la rama', () => {
    const store = createAgentStore();
    store.handleHook(pre({ cwd: '/root/projects/front', tool_use_id: 'a', tool_input: { subagent_type: 'Explore', description: 'Revisar el ticket 33527 del front' } }), { branchTicket: '11111' });
    store.handleHook(pre({ cwd: '/root/projects/legajo', tool_use_id: 'b', tool_input: { subagent_type: 'Explore', description: 'Buscar el consumidor' } }), { branchTicket: '33527' });
    store.handleHook(pre({ tool_use_id: 'c', tool_input: { subagent_type: 'Explore', description: 'Sin rama' } }));
    expect(store.list().map((run) => [run.project, run.ticket])).toEqual([['front', '33527'], ['legajo', '33527'], [null, null]]);
  });

  it('ticketOfText toma 5 o 6 dígitos sueltos y no años ni números largos', () => {
    expect(ticketOfText('Ticket #33527 listo')).toBe('33527');
    expect(ticketOfText('ver 123456')).toBe('123456');
    expect(ticketOfText('año 2026')).toBeNull();
    expect(ticketOfText('id 1234567')).toBeNull();
    expect(ticketOfText('sin números')).toBeNull();
  });

  it('el historial se guarda en cada cambio y se puede cargar de nuevo (sin perder el vínculo del agente)', () => {
    let saved: AgentRun[] = [];
    const first = createAgentStore({ onChange: (runs) => (saved = runs) });
    first.handleHook(pre({ cwd: '/x/front' }));
    first.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a-1', agent_type: 'Explore' });
    expect(saved).toHaveLength(1);
    const second = createAgentStore({ initial: JSON.parse(JSON.stringify(saved)) as AgentRun[] });
    expect(second.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'a-1' })).toBe(true);
    expect(second.list()[0]).toMatchObject({ status: 'done', project: 'front' });
    // Un archivo viejo sin carpeta ni ticket, o con basura, se carga igual.
    const legacy = createAgentStore({ initial: [{ id: 'v', sessionId: 's', type: 'Explore', description: 'x', startedAt: new Date().toISOString(), endedAt: null, status: 'running', agentId: null } as unknown as AgentRun, 'basura' as unknown as AgentRun] });
    expect(legacy.list()).toMatchObject([{ id: 'v', project: null, ticket: null }]);
  });

  it('clearHistory borra lo terminado y conserva lo que sigue trabajando', () => {
    const store = createAgentStore();
    store.handleHook(pre({ tool_use_id: 'viejo' }));
    store.handleHook({ hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'a', agent_type: 'Explore' });
    store.handleHook({ hook_event_name: 'SubagentStop', agent_id: 'a' });
    store.handleHook(pre({ tool_use_id: 'activo' }));
    expect(store.clearHistory()).toBe(1);
    expect(store.list().map((run) => run.id)).toEqual(['activo']);
    expect(store.clearHistory()).toBe(0);
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

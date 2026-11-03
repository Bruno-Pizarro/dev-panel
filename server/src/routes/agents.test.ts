import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// El historial se guarda en disco: la prueba usa una carpeta de datos temporal.
const dir = mkdtempSync(join(tmpdir(), 'dp-agents-'));
const claudeDir = mkdtempSync(join(tmpdir(), 'dp-agents-claude-'));
beforeAll(() => {
  process.env['DEV_PANEL_DATA'] = dir;
  process.env['CLAUDE_CONFIG_DIR'] = claudeDir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(claudeDir, { recursive: true, force: true });
});

const pre = (over: Record<string, unknown> = {}) => ({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Agent', tool_use_id: 'toolu_1', tool_input: { subagent_type: 'Explore', description: 'Buscar el visor de diffs' }, ...over });

describe('rutas de agentes', () => {
  it('POST /api/agents/event acepta la entrada de un hook, GET la lista, DELETE la saca y DELETE /api/agents borra el historial', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerAgentRoutes } = await import('./agents.js');
    const { agents } = await import('../services/agents.js');
    const app = Fastify();
    registerAgentRoutes(app);
    expect((await app.inject({ method: 'POST', url: '/api/agents/event', payload: pre({ tool_use_id: 'ruta-1' }) })).statusCode).toBe(202);
    const list = await app.inject({ method: 'GET', url: '/api/agents' });
    expect(list.json().agents.some((run: { id: string }) => run.id === 'ruta-1')).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: '/api/agents/ruta-1' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: '/api/agents/ruta-1' })).statusCode).toBe(404);
    expect(agents.list().some((run) => run.id === 'ruta-1')).toBe(false);
    // Un cuerpo que no es un hook igual se responde sin error y no agrega nada.
    expect((await app.inject({ method: 'POST', url: '/api/agents/event', payload: { cualquier: 'cosa' } })).statusCode).toBe(202);
    // Historial: lo terminado se borra, lo que trabaja se conserva.
    await app.inject({ method: 'POST', url: '/api/agents/event', payload: pre({ tool_use_id: 'h-1' }) });
    await app.inject({ method: 'POST', url: '/api/agents/event', payload: { hook_event_name: 'SubagentStart', session_id: 's1', agent_id: 'ag', agent_type: 'Explore' } });
    await app.inject({ method: 'POST', url: '/api/agents/event', payload: { hook_event_name: 'SubagentStop', agent_id: 'ag' } });
    await app.inject({ method: 'POST', url: '/api/agents/event', payload: pre({ tool_use_id: 'h-2' }) });
    expect((await app.inject({ method: 'DELETE', url: '/api/agents' })).json()).toEqual({ removed: 1 });
    expect(agents.list().map((run) => run.id)).toEqual(['h-2']);
    await app.close();
  });

  it('el detalle de un agente trae pedido y respuesta; el interruptor y el borrado de textos funcionan', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerAgentRoutes } = await import('./agents.js');
    const app = Fastify();
    registerAgentRoutes(app);
    await app.inject({ method: 'POST', url: '/api/agents/event', payload: pre({ session_id: 'sdet', tool_use_id: 'det-1', tool_input: { subagent_type: 'Explore', description: 'Con detalle', prompt: 'Hacé X' } }) });
    await app.inject({ method: 'POST', url: '/api/agents/event', payload: { hook_event_name: 'SubagentStart', session_id: 'sdet', agent_id: 'det', agent_type: 'Explore' } });
    await app.inject({ method: 'POST', url: '/api/agents/event', payload: { hook_event_name: 'SubagentStop', agent_id: 'det', last_assistant_message: 'Hecho X' } });
    const list = (await app.inject({ method: 'GET', url: '/api/agents' })).json().agents.find((run: { id: string }) => run.id === 'det-1');
    expect(list).toMatchObject({ hasRequest: true, hasResponse: true });
    expect(list.request).toBeUndefined();
    const detail = await app.inject({ method: 'GET', url: '/api/agents/det-1' });
    expect(detail.json()).toMatchObject({ request: 'Hacé X', response: 'Hecho X' });
    expect((await app.inject({ method: 'GET', url: '/api/agents/nadie' })).statusCode).toBe(404);

    expect((await app.inject({ method: 'GET', url: '/api/agents/settings' })).json()).toEqual({ saveContent: true });
    expect((await app.inject({ method: 'PUT', url: '/api/agents/settings', payload: { saveContent: false } })).json()).toEqual({ saveContent: false });
    expect((await app.inject({ method: 'PUT', url: '/api/agents/settings', payload: { saveContent: 'si' } })).statusCode).toBe(400);
    await app.inject({ method: 'POST', url: '/api/agents/event', payload: pre({ session_id: 'sdet', tool_use_id: 'det-2', tool_input: { subagent_type: 'Explore', description: 'Sin guardar', prompt: 'No guardar' } }) });
    expect((await app.inject({ method: 'GET', url: '/api/agents/det-2' })).json().request).toBeNull();
    await app.inject({ method: 'PUT', url: '/api/agents/settings', payload: { saveContent: true } });

    expect((await app.inject({ method: 'DELETE', url: '/api/agents/content' })).json().cleared).toBeGreaterThanOrEqual(1);
    expect((await app.inject({ method: 'GET', url: '/api/agents/det-1' })).json()).toMatchObject({ request: null, response: null });
    await app.close();
  });

  it('si el hook de fin no trae el informe, lo saca de la transcripción del agente (y no lee rutas fuera de projects/)', async () => {
    const { default: Fastify } = await import('fastify');
    const { registerAgentRoutes } = await import('./agents.js');
    const app = Fastify();
    registerAgentRoutes(app);
    mkdirSync(join(claudeDir, 'projects', 'p', 'subagents'), { recursive: true });
    const transcript = join(claudeDir, 'projects', 'p', 'subagents', 'agent-tr.jsonl');
    writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'SubagentHandback', input: { message: 'Informe desde la transcripción' } }] } })}\n`);
    const fuera = join(dir, 'fuera.jsonl');
    writeFileSync(fuera, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'NO DEBE LEERSE' }] } })}\n`);
    const send = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/agents/event', payload });
    await send(pre({ session_id: 'str', tool_use_id: 'tr-1', tool_input: { subagent_type: 'Explore', description: 'Con transcripción', prompt: 'Pedido' } }));
    await send({ hook_event_name: 'SubagentStart', session_id: 'str', agent_id: 'tr', agent_type: 'Explore' });
    await send({ hook_event_name: 'SubagentStop', session_id: 'str', agent_id: 'tr', agent_transcript_path: transcript });
    expect((await app.inject({ method: 'GET', url: '/api/agents/tr-1' })).json()).toMatchObject({ status: 'done', response: 'Informe desde la transcripción' });

    await send(pre({ session_id: 'str2', tool_use_id: 'tr-2', tool_input: { subagent_type: 'Explore', description: 'Ruta no permitida' } }));
    await send({ hook_event_name: 'SubagentStart', session_id: 'str2', agent_id: 'tr2', agent_type: 'Explore' });
    await send({ hook_event_name: 'SubagentStop', session_id: 'str2', agent_id: 'tr2', agent_transcript_path: fuera });
    const denied = (await app.inject({ method: 'GET', url: '/api/agents/tr-2' })).json();
    expect(denied).toMatchObject({ status: 'done', response: null });
    expect(JSON.stringify(denied)).not.toContain('NO DEBE LEERSE');
    await app.close();
  }, 15_000);
});

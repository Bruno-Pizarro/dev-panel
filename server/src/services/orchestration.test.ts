import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createOrchestration, mergeHookRuns, shortModel, RETENTION_MS, STALE_MS, type OrchSession } from './orchestration.js';

const root = mkdtempSync(join(tmpdir(), 'dp-orch-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const NOW = Date.parse('2026-11-10T15:00:00Z');
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const line = (value: unknown) => `${JSON.stringify(value)}\n`;
const usage = (input: number, output: number, cacheCreate = 0, cacheRead = 0) => ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: cacheCreate, cache_read_input_tokens: cacheRead });
const assistant = (ts: string, id: string, content: unknown[], u = usage(10, 5), extra: Record<string, unknown> = {}) => line({ type: 'assistant', timestamp: ts, cwd: '/work/33528-notificaciones', gitBranch: 'feature/33528-x', entrypoint: 'claude-vscode', message: { id, model: 'claude-opus-5-5', usage: u, content }, ...extra });
const toolUse = (id: string, name: string, input: Record<string, unknown> = {}) => ({ type: 'tool_use', id, name, input });

let claude: string;
let projects: string;
let counter = 0;
const files = () => {
  counter += 1;
  const sessionId = `sess${counter}`;
  const main = join(projects, '-work', `${sessionId}.jsonl`);
  const subs = join(projects, '-work', sessionId, 'subagents');
  mkdirSync(subs, { recursive: true });
  return { sessionId, main, subs };
};
const orchestration = () => createOrchestration({ file: join(root, `state-${counter}.json`), now: () => NOW });
const dirs = () => [{ dir: claude, label: 'cuenta' }];

beforeEach(() => {
  claude = join(root, `claude-${counter + 1}`);
  projects = join(claude, 'projects');
  mkdirSync(projects, { recursive: true });
});

const buildSession = () => {
  const { sessionId, main, subs } = files();
  writeFileSync(main, line({ type: 'user', timestamp: iso(120), cwd: '/work/33528-notificaciones', message: { role: 'user', content: 'hola' } }) + line({ type: 'ai-title', aiTitle: 'Notificaciones de firma', sessionId }) + assistant(iso(100), 'm1', [toolUse('toolu_A', 'Agent', { description: 'Ejecutar plan #33528', subagent_type: 'general-purpose', model: 'opus', run_in_background: true, prompt: 'x' })], usage(100, 50, 1000, 5000)));
  // agente 1 (terminado), con un agente anidado y un mensaje partido en dos bloques (mismo id)
  writeFileSync(join(subs, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Ejecutar plan #33528', toolUseId: 'toolu_A', requestShape: 'background', model: 'opus', spawnDepth: 1, finished: true }));
  writeFileSync(join(subs, 'agent-a1.jsonl'), line({ type: 'user', timestamp: iso(99), message: { role: 'user', content: 'Corré el plan. password=hunter2hunter2' } }) + assistant(iso(98), 'a1m1', [toolUse('t1', 'Bash', { command: 'ls' })], usage(20, 10)) + assistant(iso(98), 'a1m1', [toolUse('t2', 'Read', { file_path: '/x/y.ts' })], usage(20, 10)) + assistant(iso(90), 'a1m2', [toolUse('toolu_B', 'Agent', { description: 'Revisar diff', subagent_type: 'Explore' })], usage(30, 15, 100, 200)) + assistant(iso(60), 'a1m3', [{ type: 'text', text: 'Listo, terminé el plan.' }], usage(5, 40)));
  // agente 2 (lanzado por el agente 1), sin terminar y sin actividad reciente
  writeFileSync(join(subs, 'agent-a2.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Revisar diff', toolUseId: 'toolu_B', spawnDepth: 2, finished: false }));
  writeFileSync(join(subs, 'agent-a2.jsonl'), line({ type: 'user', timestamp: iso(89), message: { role: 'user', content: 'Mirá el diff' } }) + assistant(iso(88), 'a2m1', [toolUse('t3', 'Grep', { pattern: 'x' })], usage(7, 3)));
  // agente 3 (en curso: actividad hace 2 minutos)
  writeFileSync(join(subs, 'agent-a3.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Tarea larga', toolUseId: 'toolu_C', spawnDepth: 1, finished: false }));
  writeFileSync(join(subs, 'agent-a3.jsonl'), assistant(iso(2), 'a3m1', [toolUse('t4', 'Edit', { file_path: '/a' })], usage(1, 1)));
  // agente 4 (primer plano, sin `finished` en el meta): terminó con una respuesta final
  writeFileSync(join(subs, 'agent-a4.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Primer plano ok', toolUseId: 'toolu_D', spawnDepth: 1 }));
  writeFileSync(join(subs, 'agent-a4.jsonl'), line({ type: 'user', timestamp: iso(300), message: { role: 'user', content: 'x' } }) + assistant(iso(299), 'a4m1', [{ type: 'text', text: 'Hecho' }], usage(1, 1), {}).replace('"usage"', '"stop_reason":"end_turn","usage"'));
  // agente 5 (primer plano): su última línea es un resultado de herramienta, nunca contestó: interrumpido
  writeFileSync(join(subs, 'agent-a5.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Primer plano cortado', toolUseId: 'toolu_E', spawnDepth: 1 }));
  writeFileSync(join(subs, 'agent-a5.jsonl'), assistant(iso(400), 'a5m1', [toolUse('t6', 'Bash', { command: 'sleep' })], usage(1, 1)) + line({ type: 'user', timestamp: iso(399), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't6' }] } }));
  return { sessionId, main, subs };
};

describe('escáner de orquestación', () => {
  it('arma la sesión: título, carpeta, rama, ticket y tokens de la conversación', async () => {
    const { sessionId } = buildSession();
    const orch = orchestration();
    await orch.scan(dirs());
    const session = orch.sessions().find((item) => item.id === sessionId)!;
    expect(session).toMatchObject({ title: 'Notificaciones de firma', project: '33528-notificaciones', branch: 'feature/33528-x', entrypoint: 'claude-vscode', ticket: '33528', account: 'cuenta' });
    expect(session.main.tokens).toEqual({ input: 100, output: 50, cacheCreate: 1000, cacheRead: 5000 });
    expect(session.main.toolCount).toBe(1);
    expect(session.firstAt).toBe(iso(120));
  });

  it('reconstruye el árbol: quién lanzó a quién, profundidad, tipo, modelo y si fue en segundo plano', async () => {
    const { sessionId } = buildSession();
    const orch = orchestration();
    await orch.scan(dirs());
    const agents = orch.sessions().find((item) => item.id === sessionId)!.agents;
    const a1 = agents.find((agent) => agent.agentId === 'a1')!;
    const a2 = agents.find((agent) => agent.agentId === 'a2')!;
    expect(a1).toMatchObject({ parentAgentId: null, depth: 1, type: 'general-purpose', description: 'Ejecutar plan #33528', background: true, source: 'transcript' });
    expect(a2).toMatchObject({ parentAgentId: 'a1', depth: 2, type: 'Explore' });
    expect(a1.model).toBe('claude-opus-5-5');
  });

  it('cuenta tokens y herramientas una vez por mensaje (un mensaje en varias líneas no se suma doble)', async () => {
    const { sessionId } = buildSession();
    const orch = orchestration();
    await orch.scan(dirs());
    const a1 = orch.sessions().find((item) => item.id === sessionId)!.agents.find((agent) => agent.agentId === 'a1')!;
    // a1m1 (20/10, dos líneas) + a1m2 (30/15, 100 de caché, 200 leídos) + a1m3 (5/40)
    expect(a1.tokens).toEqual({ input: 55, output: 65, cacheCreate: 100, cacheRead: 200 });
    expect(a1.toolStats).toEqual({ Bash: 1, Read: 1, Agent: 1 });
    expect(a1.toolCount).toBe(3);
    expect(Object.values(a1.byDay).reduce((sum, value) => sum + value, 0)).toBe(55 + 65 + 100);
  });

  it('estado: terminado según el meta, interrumpido si no hay actividad hace rato, trabajando si hay', async () => {
    const { sessionId } = buildSession();
    const orch = orchestration();
    await orch.scan(dirs());
    const by = (id: string) => orch.sessions().find((item) => item.id === sessionId)!.agents.find((agent) => agent.agentId === id)!;
    expect(by('a1')).toMatchObject({ status: 'done', endedAt: iso(60) });
    expect(by('a2')).toMatchObject({ status: 'lost' });
    expect(by('a3')).toMatchObject({ status: 'running', endedAt: null });
    // sin `finished` (primer plano): terminó si su última línea fue una respuesta final; si quedó en un resultado de herramienta, se cortó
    expect(by('a4')).toMatchObject({ status: 'done' });
    expect(by('a5')).toMatchObject({ status: 'lost' });
    expect(STALE_MS).toBe(10 * 60_000);
  });

  it('es incremental: lo agregado después se suma sin releer, y una línea a medio escribir espera', async () => {
    const { sessionId, subs } = buildSession();
    const orch = orchestration();
    await orch.scan(dirs());
    appendFileSync(join(subs, 'agent-a3.jsonl'), assistant(iso(1), 'a3m2', [toolUse('t5', 'Bash', { command: 'pwd' })], usage(2, 2)));
    appendFileSync(join(subs, 'agent-a3.jsonl'), '{"type":"assistant","timestamp":"2026-11-10T14:59:30Z","message":{"id":"a3m3","usage":{"input_tokens":9');
    await orch.scan(dirs());
    const a3 = orch.sessions().find((item) => item.id === sessionId)!.agents.find((agent) => agent.agentId === 'a3')!;
    expect(a3.tokens).toMatchObject({ input: 3, output: 3 });
    expect(a3.toolCount).toBe(2);
    // se completa la línea y se cuenta
    appendFileSync(join(subs, 'agent-a3.jsonl'), ',"output_tokens":4},"content":[]}}\n');
    await orch.scan(dirs());
    expect(orch.sessions().find((item) => item.id === sessionId)!.agents.find((agent) => agent.agentId === 'a3')!.tokens).toMatchObject({ input: 12, output: 7 });
  });

  it('guarda y recupera el estado (no vuelve a leer lo ya leído)', async () => {
    const { sessionId } = buildSession();
    const first = orchestration();
    await first.scan(dirs());
    const reloaded = createOrchestration({ file: join(root, `state-${counter}.json`), now: () => NOW });
    expect(reloaded.sessions().find((item) => item.id === sessionId)?.agents).toHaveLength(5);
  });

  it('las sesiones de más de 15 días no entran', async () => {
    const { main } = files();
    writeFileSync(main, assistant(new Date(NOW - RETENTION_MS - 86_400_000).toISOString(), 'old', [], usage(1, 1)));
    const { utimesSync } = await import('node:fs');
    const old = (NOW - RETENTION_MS - 86_400_000) / 1000;
    utimesSync(main, old, old);
    const orch = orchestration();
    await orch.scan(dirs());
    expect(orch.sessions()).toEqual([]);
  });

  it('no expone rutas ni lo interno', async () => {
    buildSession();
    const orch = orchestration();
    await orch.scan(dirs());
    const text = JSON.stringify(orch.sessions());
    expect(text).not.toContain('agent-a1.jsonl');
    expect(text).not.toContain('"tracker"');
    expect(text).not.toContain('"launches"');
  });
});

describe('contenido de un agente (se lee al abrirlo)', () => {
  it('pedido, respuesta y pasos, con los secretos tapados', async () => {
    const { sessionId } = buildSession();
    const orch = orchestration();
    await orch.scan(dirs());
    const content = orch.content(sessionId, 'a1', [claude])!;
    expect(content.available).toBe(true);
    expect(content.request).toContain('Corré el plan');
    expect(content.request).not.toContain('hunter2hunter2');
    expect(content.response).toBe('Listo, terminé el plan.');
    expect(content.steps.map((step) => step.tool)).toEqual(['Bash', 'Read', 'Agent']);
  });

  it('ids inválidos o inexistentes: nada; carpeta no permitida: sin contenido', async () => {
    const { sessionId } = buildSession();
    const orch = orchestration();
    await orch.scan(dirs());
    expect(orch.content('../x', 'a1', [claude])).toBeNull();
    expect(orch.content(sessionId, '../../etc/passwd', [claude])).toBeNull();
    expect(orch.content(sessionId, 'nada', [claude])).toBeNull();
    expect(orch.content(sessionId, 'a1', [join(root, 'otra-carpeta')])).toMatchObject({ available: false, request: null });
  });

  it('un enlace que saca el archivo de projects/ no se abre', async () => {
    const { sessionId, subs } = buildSession();
    const orch = orchestration();
    await orch.scan(dirs());
    const secret = join(root, 'secreto.jsonl');
    writeFileSync(secret, line({ type: 'user', message: { role: 'user', content: 'confidencial' } }));
    rmSync(join(subs, 'agent-a3.jsonl'));
    symlinkSync(secret, join(subs, 'agent-a3.jsonl'));
    expect(orch.content(sessionId, 'a3', [claude])).toMatchObject({ available: false, request: null });
  });
});

describe('modelos', () => {
  it('nombre corto de la familia', () => {
    expect(shortModel('claude-opus-5-5')).toBe('opus');
    expect(shortModel('claude-sonnet-5-5')).toBe('sonnet');
    expect(shortModel(null)).toBeNull();
  });
});

describe('agentes que solo vieron los hooks', () => {
  const session = (agents: string[]): OrchSession => ({ id: 'S1', account: 'c', title: null, project: 'p', branch: null, entrypoint: null, ticket: null, firstAt: '2026-11-10T10:00:00Z', lastAt: '2026-11-10T11:00:00Z', main: { tokens: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }, byDay: {}, toolCount: 0 }, agents: agents.map((agentId) => ({ agentId, toolUseId: null, parentAgentId: null, depth: 1, type: 'x', description: 'd', model: null, background: false, status: 'done' as const, startedAt: null, endedAt: null, tokens: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 }, byDay: {}, toolCount: 0, toolStats: {}, source: 'transcript' as const })) });
  const run = (over: Record<string, unknown>) => ({ id: 'run-1', sessionId: 'S1', agentId: null, type: 'Explore', description: 'Buscar', startedAt: '2026-11-10T12:00:00Z', endedAt: null, status: 'running' as const, project: null, ticket: null, ...over });

  it('suma los que no están, no repite los que ya leyó el escáner y arma la sesión si falta', () => {
    const merged = mergeHookRuns([session(['a1'])], [run({ agentId: 'a1' }), run({ id: 'run-2', agentId: 'a9' }), run({ id: 'run-3', sessionId: 'S2', agentId: 'b1', project: 'otro', ticket: '33000', startedAt: '2026-11-10T13:00:00Z' })]);
    expect(merged.map((item) => item.id)).toEqual(['S2', 'S1']);
    expect(merged.find((item) => item.id === 'S1')!.agents.map((agent) => `${agent.agentId}:${agent.source}`)).toEqual(['a1:transcript', 'a9:hook']);
    expect(merged.find((item) => item.id === 'S2')).toMatchObject({ project: 'otro', ticket: '33000' });
  });
});

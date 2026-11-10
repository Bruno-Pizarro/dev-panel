import { describe, expect, it } from 'vitest';
import { barOf, buildRows, filterSessions, formatSpan, formatTokens, localDay, modelFamily, NO_FILTERS, parentsOf, spanOf, summarize, tokensOf, tokensOnDay, type OrchAgent, type OrchSession } from './orchestration';

const NOW = Date.parse('2026-11-10T15:00:00Z');
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const zero = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
const agent = (over: Partial<OrchAgent> & { agentId: string }): OrchAgent => ({ toolUseId: null, parentAgentId: null, depth: 1, type: 'general-purpose', description: 'Tarea', model: 'claude-opus-5-5', background: false, status: 'done', startedAt: at(60), endedAt: at(30), tokens: { ...zero, input: 10, output: 20, cacheCreate: 30, cacheRead: 999 }, byDay: {}, toolCount: 3, toolStats: {}, source: 'transcript', ...over });
const session = (agents: OrchAgent[], over: Partial<OrchSession> = {}): OrchSession => ({ id: 'S', account: 'c', title: 'Notificaciones', project: '33528-notif', branch: 'feature/33528', entrypoint: null, ticket: '33528', firstAt: at(120), lastAt: at(10), main: { tokens: { ...zero, input: 100, output: 100 }, byDay: {}, toolCount: 5 }, agents, ...over });

describe('formato', () => {
  it('tokens: sin contar la caché leída; abreviados', () => {
    expect(tokensOf({ input: 1, output: 2, cacheCreate: 3, cacheRead: 1_000_000 })).toBe(6);
    expect([950, 12_400, 1_500_000, 2_000_000].map(formatTokens)).toEqual(['950', '12 k', '1.5 M', '2 M']);
  });
  it('tiempos y modelos', () => {
    expect([38_000, 252_000, 3_900_000].map(formatSpan)).toEqual(['38 s', '4 min 12 s', '1 h 05 min']);
    expect([modelFamily('claude-opus-5-5'), modelFamily('claude-haiku-5-5'), modelFamily(null)]).toEqual(['opus', 'haiku', null]);
  });
});

describe('árbol de agentes', () => {
  const agents = [
    agent({ agentId: 'b', startedAt: at(50), parentAgentId: 'a', depth: 2 }),
    agent({ agentId: 'a', startedAt: at(60) }),
    agent({ agentId: 'c', startedAt: at(40) }),
    agent({ agentId: 'd', startedAt: at(30), parentAgentId: 'b', depth: 3 }),
    agent({ agentId: 'huerfano', startedAt: at(20), parentAgentId: 'no-esta' }),
  ];
  it('cada agente seguido de los que lanzó, con su nivel; el que perdió a su padre cuelga de la raíz', () => {
    const rows = buildRows(agents, new Set());
    expect(rows.map((row) => `${'-'.repeat(row.level)}${row.agent.agentId}`)).toEqual(['a', '-b', '--d', 'c', 'huerfano']);
    expect(rows[0]).toMatchObject({ children: 1, collapsed: false });
  });
  it('una rama cerrada oculta lo de adentro y lo marca', () => {
    const rows = buildRows(agents, new Set(['a']));
    expect(rows.map((row) => row.agent.agentId)).toEqual(['a', 'c', 'huerfano']);
    expect(rows[0]).toMatchObject({ collapsed: true });
    expect(parentsOf(agents).sort()).toEqual(['a', 'b']);
  });
});

describe('línea de tiempo', () => {
  it('el tramo va del primero al último; un agente trabajando llega hasta ahora', () => {
    const list = [agent({ agentId: 'a', startedAt: at(60), endedAt: at(30) }), agent({ agentId: 'b', startedAt: at(40), endedAt: null, status: 'running' })];
    expect(spanOf(list, NOW)).toEqual({ start: NOW - 60 * 60_000, end: NOW });
    expect(spanOf([], NOW)).toBeNull();
  });
  it('posición y ancho de la barra, con un mínimo para que siempre se vea', () => {
    const span = { start: NOW - 60 * 60_000, end: NOW };
    expect(barOf(agent({ agentId: 'a', startedAt: at(60), endedAt: at(30) }), span, NOW)).toEqual({ left: 0, width: 50 });
    expect(barOf(agent({ agentId: 'b', startedAt: at(30), endedAt: at(30) }), span, NOW)!.width).toBe(0.8);
    expect(barOf(agent({ agentId: 'c', startedAt: null }), span, NOW)).toBeNull();
  });
});

describe('resumen y filtros', () => {
  const list = [
    agent({ agentId: 'a', description: 'Ejecutar plan #33528', status: 'running', endedAt: null }),
    agent({ agentId: 'b', description: 'Revisar diff', type: 'Explore', model: 'claude-haiku-5-5', status: 'lost' }),
    agent({ agentId: 'c', description: 'Otra cosa', model: 'claude-sonnet-5-5' }),
  ];
  const all = [session(list), session([], { id: 'V', title: 'Vacía', ticket: null, project: 'otra' })];

  it('resume la sesión', () => {
    const summary = summarize(session(list), NOW);
    expect(summary).toMatchObject({ agents: 3, running: 1, tokens: 180, mainTokens: 200, tools: 9, models: ['haiku', 'opus', 'sonnet'] });
    expect(summary.durationMs).toBe(110 * 60_000);
  });
  it('filtra por estado, modelo y tipo, dejando solo los agentes que coinciden', () => {
    expect(filterSessions(all, { ...NO_FILTERS, status: 'running' })[0]!.agents.map((a) => a.agentId)).toEqual(['a']);
    expect(filterSessions(all, { ...NO_FILTERS, model: 'haiku' })[0]!.agents.map((a) => a.agentId)).toEqual(['b']);
    expect(filterSessions(all, { ...NO_FILTERS, type: 'Explore' })[0]!.agents.map((a) => a.agentId)).toEqual(['b']);
    expect(filterSessions(all, { ...NO_FILTERS, status: 'lost', model: 'opus' })).toEqual([]);
  });
  it('el texto busca sin tildes ni mayúsculas en el agente y en el título, carpeta, rama y ticket de la sesión', () => {
    expect(filterSessions(all, { ...NO_FILTERS, q: 'REVISAR' })[0]!.agents.map((a) => a.agentId)).toEqual(['b']);
    expect(filterSessions(all, { ...NO_FILTERS, q: 'notificaciones' })[0]!.agents).toHaveLength(3);
    expect(filterSessions(all, { ...NO_FILTERS, q: '33528' })[0]!.id).toBe('S');
    expect(filterSessions(all, { ...NO_FILTERS, q: 'vacia' }).map((s) => s.id)).toEqual(['V']);
  });
  it('por ticket', () => {
    expect(filterSessions(all, { ...NO_FILTERS, ticket: '33528' }).map((s) => s.id)).toEqual(['S']);
  });
  it('tokens de un día: la conversación y los agentes', () => {
    const day = localDay(NOW);
    const s = session([agent({ agentId: 'a', byDay: { [day]: 50, '2020-01-01': 7 } })], { main: { tokens: zero, byDay: { [day]: 25 }, toolCount: 0 } });
    expect(tokensOnDay([s], day)).toBe(75);
    expect(tokensOnDay([s], '2020-01-02')).toBe(0);
  });
});

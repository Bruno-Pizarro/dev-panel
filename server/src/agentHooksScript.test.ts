import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sin tipos
import { apply } from '../scripts/install-agent-hooks.mjs';

const existing = {
  model: 'x',
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: 'node stop.js' }] }],
    PreToolUse: [{ matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: 'node q.js' }] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: 'node sub.js' }] }],
  },
};

describe('install-agent-hooks', () => {
  it('suma sus tres hooks sin tocar lo que ya había', () => {
    const next = apply(existing, false);
    expect(next.model).toBe('x');
    expect(next.hooks.Stop).toEqual(existing.hooks.Stop);
    expect(next.hooks.PreToolUse[0]).toEqual(existing.hooks.PreToolUse[0]);
    expect(next.hooks.PreToolUse[1]).toMatchObject({ matcher: 'Agent|Task' });
    expect(next.hooks.SubagentStop[0]).toEqual(existing.hooks.SubagentStop[0]);
    expect(next.hooks.SubagentStop).toHaveLength(2);
    expect(next.hooks.SubagentStart).toHaveLength(1);
    expect(JSON.stringify(next)).toContain('/api/agents/event');
    expect(JSON.stringify(existing)).not.toContain('/api/agents/event');
  });

  it('es idempotente: correrlo dos veces no duplica', () => {
    const once = apply(existing, false);
    expect(apply(once, false)).toEqual(once);
  });

  it('--remove saca solo lo suyo y deja el resto como estaba', () => {
    expect(apply(apply(existing, false), true)).toEqual(existing);
    expect(apply({}, true)).toEqual({});
  });

  it('funciona sobre un settings sin hooks', () => {
    const next = apply({ model: 'x' }, false);
    expect(Object.keys(next.hooks).sort()).toEqual(['PreToolUse', 'SubagentStart', 'SubagentStop']);
  });
});

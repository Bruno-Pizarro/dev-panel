import { describe, expect, it } from 'vitest';
import { demoRuns, isDemoRun } from './agentDemo';

describe('vista previa del aviso de agentes', () => {
  it('trae tres agentes de ejemplo (dos trabajando, uno terminado), todos reconocibles como ejemplo', () => {
    const runs = demoRuns(Date.parse('2026-11-03T12:00:00Z'));
    expect(runs.map((run) => run.status)).toEqual(['running', 'running', 'done']);
    expect(runs.every(isDemoRun)).toBe(true);
    expect(runs[2]!.endedAt).not.toBeNull();
    expect(isDemoRun({ id: 'toolu_123' })).toBe(false);
  });
});

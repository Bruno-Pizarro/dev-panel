import { describe, expect, it } from 'vitest';
import type { MrInfo } from './gitlab.js';
import { buildClosing, type ClosingInput } from './ticketClosing.js';

const mr = (over: Partial<MrInfo>): MrInfo => ({ repo: 'front', iid: 1, order: 0, title: null, url: 'https://git/mr/1', state: 'merged', draft: false, sourceBranch: null, targetBranch: null, mergeStatus: null, hasConflicts: false, discussionsResolved: null, notes: 0, pipeline: null, updatedAt: null, level: 'ok', summary: '', error: null, ...over });
const input = (over: Partial<ClosingInput> = {}): ClosingInput => ({ ticket: '33527', title: 'Firmas', mrs: [mr({})], mrsAvailable: true, testData: { ticket: '33527', rows: [], total: 0, error: null, queues: [], queuesError: null, notes: null }, repoIssues: [], note: '', ...over });
const level = (report: ReturnType<typeof buildClosing>, id: string) => report.items.find((entry) => entry.id === id)?.level;

describe('buildClosing', () => {
  it('todo mergeado y limpio: sin pendientes', () => {
    const report = buildClosing(input());
    expect(report.summary.pending).toBe(0);
    expect(report.request).toContain('El panel no ve pendientes.');
  });

  it('MR abierto, datos de prueba y repos sueltos quedan como pendientes y viajan en el pedido', () => {
    const report = buildClosing(
      input({ mrs: [mr({}), mr({ repo: 'legajo', iid: 68, state: 'opened' })], repoIssues: ['front: 2 sin commitear'], testData: { ticket: '33527', rows: [], total: 5, error: null, queues: [{ name: 'q', messages: 1 } as never], queuesError: null, notes: null }, note: 'Falta avisar a Luana' }),
    );
    expect(level(report, 'mrs')).toBe('warn');
    expect(level(report, 'repos')).toBe('warn');
    expect(level(report, 'data')).toBe('warn');
    expect(level(report, 'queues')).toBe('warn');
    expect(report.request).toContain('legajo !68');
    expect(report.request).toContain('Falta avisar a Luana');
    expect(report.request).toContain('No hagas push, merge ni cambios en Redmine');
  });

  it('pipeline fallido es error y sin GitLab queda como dato desconocido', () => {
    expect(level(buildClosing(input({ mrs: [mr({ pipeline: { status: 'failed', url: null } })] })), 'pipeline')).toBe('error');
    expect(level(buildClosing(input({ mrs: [], mrsAvailable: false })), 'mrs')).toBe('idle');
  });
});

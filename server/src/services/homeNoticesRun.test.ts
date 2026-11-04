import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DevPanelConfig } from '../config.js';
import type { MrInfo } from './gitlab.js';

// El orquestador guarda en disco: se carga después de apuntar los datos a una carpeta temporal (nunca a la real).
const mr = (over: Partial<MrInfo> = {}): MrInfo => ({ repo: 'front', iid: 171, order: 1, title: 'Pantalla Firmas por legajo', url: 'https://g/mr/171', state: 'opened', draft: false, sourceBranch: null, targetBranch: null, mergeStatus: null, hasConflicts: false, discussionsResolved: null, notes: 0, pipeline: null, updatedAt: '2026-11-04T09:00:00Z', level: 'ok', summary: 'Listo para mergear', error: null, ...over });

describe('getNotices (una revisión por día)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp-home-'));
  let home: typeof import('./homeNotices.js');
  let config: DevPanelConfig;
  beforeAll(async () => {
    process.env['DEV_PANEL_DATA'] = dir;
    process.env['REDMINE_API_KEY'] = 'clave-inventada';
    home = await import('./homeNotices.js');
    const { defaultConfig } = await import('../config.js');
    config = defaultConfig('/tmp/x') as DevPanelConfig;
    config.redmine.baseUrl = 'https://r.example';
    config.workday = { entry: '09:00', exit: '18:00', punchUrl: '' };
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  let calls: string[] = [];
  const fake = (async (url: string) => {
    const path = url.replace('https://r.example', '');
    calls.push(path);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (path.startsWith('/users/current')) return json({ user: { id: 1, firstname: 'Bruno', lastname: 'Pizarro' } });
    if (path.startsWith('/issues.json?assigned_to_id=me&status_id=open')) return json({ issues: [{ id: 33527, subject: '[8 SP] Firmas por legajo', status: { name: 'Desarrollo' }, tracker: { name: 'Nueva funcionalidad' }, due_date: '2026-11-05', updated_on: '2026-11-04T09:00:00Z' }, { id: 30392, subject: 'Ticket viejo perdido', status: { name: 'Análisis' }, tracker: { name: 'Nueva funcionalidad' }, due_date: '2025-10-17', updated_on: '2025-10-17T09:00:00Z' }] });
    if (path.startsWith('/issues/33527.json?include=journals,children')) return json({ issue: { journals: [{ user: { name: 'Mariano Buglio' }, created_on: '2026-11-04T08:00:00Z', notes: 'Probé y está bien' }], children: [{ id: 33945 }] } });
    if (path.startsWith('/issues/33945.json')) return json({ issue: { subject: 'Testing 33527', tracker: { name: 'Control QA' }, journals: [] } });
    if (path.startsWith('/issues.json?tracker_id=22')) return json({ issues: [{ id: 40000, subject: 'ICONO - Requerimientos semana del 02/11/2026 al 06/11/2026' }, { id: 33677, subject: 'Sprint Semana 02/11/26 al 06/11/26' }] });
    if (path.startsWith('/issues/40000.json')) return json({ issue: { relations: [] } });
    if (path.startsWith('/issues/33677.json')) return json({ issue: { relations: [{ issue_id: 33677, issue_to_id: 33527 }] } });
    if (path.startsWith('/issues.json?issue_id=')) return json({ issues: [{ id: 33527, subject: '[8 SP] Firmas por legajo', status: { name: 'Revisión' }, tracker: { name: 'Nueva funcionalidad' }, updated_on: '2026-11-04T09:00:00Z' }] });
    return { ok: false, status: 404, json: async () => ({}) };
  }) as never;
  const deps = () => ({ fetcher: fake, fetchMrs: async () => [{ ticket: '33527', mr: mr({ hasConflicts: true }) }], fetchHolidays: async () => [] });
  const noon = new Date(2026, 10, 4, 12, 0);

  it('la primera vez consulta y arma los avisos de vencimiento, comentarios, MRs y sprint, los importantes primero', async () => {
    calls = [];
    const report = await home.getNotices(config, { hoursLoaded: true }, noon, deps());
    expect(report.fromCache).toBe(false);
    expect(report.errors).toEqual([]);
    const ids = report.notices.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['due-33527', 'review-33527', 'mr-conflict-front!171', 'sprint-33677']));
    // El ticket viejo (vencido, pero fuera del sprint actual) no genera aviso.
    expect(ids).not.toContain('due-30392');
    const levels = report.notices.map((n) => n.level);
    expect(levels.indexOf('info')).toBeGreaterThan(levels.lastIndexOf('important'));
    expect(report.notices.find((n) => n.id === 'sprint-33677')!.detail).toContain('8 de 8 SP entregados');
    expect(calls.length).toBeGreaterThan(5);
  });

  it('el mismo día no vuelve a consultar: lee lo guardado (y las rutinas se calculan al momento)', async () => {
    calls = [];
    const report = await home.getNotices(config, { hoursLoaded: false }, new Date(2026, 10, 4, 19, 0), deps());
    expect(report.fromCache).toBe(true);
    expect(calls).toEqual([]);
    expect(report.routines.map((n) => n.id)).toEqual(['routine-hours-2026-11-04']);
  });

  it('"Volver a revisar" consulta de nuevo en el mismo día', async () => {
    calls = [];
    const report = await home.getNotices(config, { refresh: true, hoursLoaded: true }, noon, deps());
    expect(report.fromCache).toBe(false);
    expect(calls.length).toBeGreaterThan(5);
  });

  it('al otro día revisa de nuevo, y los comentarios nuevos son los posteriores a la última revisión', async () => {
    calls = [];
    const report = await home.getNotices(config, { hoursLoaded: true }, new Date(2026, 10, 5, 9, 0), deps());
    expect(report.fromCache).toBe(false);
    expect(report.date).toBe('2026-11-05');
    // El comentario de Mariano es del 04/11 08:00 UTC, anterior a la revisión del 04/11 12:00 local: ya no es "nuevo".
    expect(report.notices.some((n) => n.id === 'review-33527')).toBe(false);
  });

  it('una fuente que falla queda en errors y no tira abajo a las demás; sin API key se avisa', async () => {
    const failing = { ...deps(), fetchMrs: async () => { throw new Error('GitLab sin token'); } };
    const report = await home.getNotices(config, { refresh: true, hoursLoaded: true }, new Date(2026, 10, 5, 12, 0), failing);
    expect(report.errors).toEqual([{ source: 'GitLab', message: 'GitLab sin token' }]);
    expect(report.notices.some((n) => n.kind === 'due' || n.kind === 'sprint')).toBe(true);
    const off = { ...config, home: { ...config.home, due: false, mrs: false, reviews: false, sprint: false, holidays: false, routines: false } };
    const empty = await home.getNotices(off, { refresh: true }, noon, deps());
    expect(empty.notices).toEqual([]);
    expect(empty.routines).toEqual([]);
  });

  it('sin un sprint actual no se avisan vencimientos y se aclara por qué', async () => {
    const noSprint = (async (url: string) => {
      const path = url.replace('https://r.example', '');
      if (path.startsWith('/issues.json?tracker_id=22')) return { ok: true, status: 200, json: async () => ({ issues: [{ id: 1, subject: 'Sprint Semana 26/10/26 al 30/10/26' }] }) };
      return (fake as unknown as (u: string) => Promise<unknown>)(url);
    }) as never;
    const report = await home.getNotices(config, { refresh: true, hoursLoaded: true }, noon, { ...deps(), fetcher: noSprint });
    expect(report.notices.some((n) => n.kind === 'due')).toBe(false);
    expect(report.errors.map((e) => e.source)).toContain('Vencimientos');
  });
});

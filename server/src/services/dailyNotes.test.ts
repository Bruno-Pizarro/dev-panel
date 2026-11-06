import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { buildNotesPrompt, buildNotesRequest, formatDayData } from './dailyNotes.js';
import type { TicketWeek } from './weekly.js';

const ticket = (extra: Partial<TicketWeek>): TicketWeek => ({ ticket: '33526', url: null, title: 'Pestaña de pendientes', redmineStatus: null, kind: 'desarrollo', commits: [], pushes: 0, reviews: [], mergeRequests: [], tests: [], analyses: [], estimations: [], ...extra });

describe('pedido de notas del día', () => {
  it('lista cada ticket con lo hecho y avisa la actividad que no se pudo asociar', () => {
    const data = formatDayData('2026-11-06', [ticket({ commits: [{ repo: 'front', subject: 'feat: pestaña' }], pushes: 1, tests: ['31/31'] })], ticket({ ticket: null, title: null, commits: [{ repo: 'legajo', subject: 'fix: algo' }] }));
    expect(data).toContain('Día 2026-11-06');
    expect(data).toContain('- Ticket 33526 — Pestaña de pendientes');
    expect(data).toContain('1 commits en front: feat: pestaña');
    expect(data).toContain('Pruebas: 31/31');
    expect(data).toContain('no se pudo asociar a un ticket');
    expect(data).toContain('- Sin número de ticket');
  });

  it('sin actividad lo dice, y el pedido fija las reglas: solo desarrollo, sin inventar, con OK antes de publicar y sin links ni consultas extra', () => {
    expect(formatDayData('2026-11-06', [], null)).toContain('sin desarrollo registrado hoy');
    const prompt = buildNotesPrompt('2026-11-06', 'DATOS');
    expect(prompt).toContain('2026-11-06');
    expect(prompt).toContain('ya generan su propia nota');
    expect(prompt).toContain('No inventes');
    expect(prompt).toContain('esperá mi OK');
    expect(prompt).toContain('redmine-drive');
    expect(prompt).toContain('no consultes los tickets');
    expect(prompt).toContain('DATOS');
    expect(prompt).not.toContain('https://');
  });

  const folder = mkdtempSync(join(tmpdir(), 'dp-notes-'));
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  it('sin repos ni tickets en la base de conocimiento arma el pedido vacío sin fallar', async () => {
    const base = defaultConfig('/x');
    const config = { ...base, repos: [], paths: { ...base.paths, extra: folder, projects: folder } };
    const result = await buildNotesRequest(config, new Date(2026, 10, 6, 18, 0));
    expect(result).toMatchObject({ date: '2026-11-06', tickets: [] });
    expect(result.prompt).toContain('sin desarrollo registrado hoy');
  });
});

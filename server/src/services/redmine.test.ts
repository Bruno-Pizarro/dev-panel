import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { RedmineError, clearRedmineCache, fetchIssue, loadCredentials, mapIssue, parseSubject } from './redmine.js';

const SECRET = 'clave-secreta-de-prueba-0123456789abcdef';
const dir = mkdtempSync(join(tmpdir(), 'dp-redmine-'));
const file = join(dir, 'config.json');
writeFileSync(file, JSON.stringify({ api_key: SECRET, redmine_url: 'https://redmine.example.com/' }));
const config = { ...defaultConfig('/work'), redmine: { enabled: true, configFile: file, baseUrl: '' } };

const RAW = {
  id: 33526, subject: '[5 SP] [Módulo : Legajo Digital] Pestaña "Pendientes de firma" en el Perfil', project: { name: 'TRIUNFO - RRHH' }, tracker: { name: 'Nueva funcionalidad' },
  status: { name: 'Desarrollo' }, priority: { name: 'Normal' }, author: { name: 'Nico' }, assigned_to: { name: 'Bruno' }, estimated_hours: 16, spent_hours: 1,
  created_on: '2026-10-21T16:43:05Z', updated_on: '2026-10-27T13:46:27Z', relations: [{}, {}],
  journals: [{ user: { name: 'A' }, created_on: '2026-10-26', notes: '' }, ...['uno', 'dos', 'tres', 'cuatro'].map((notes, i) => ({ user: { name: 'B' }, created_on: `2026-10-2${i}`, notes }))],
};

beforeEach(() => clearRedmineCache());

describe('parseSubject', () => {
  it('separa SP, módulo y título', () => {
    expect(parseSubject(RAW.subject)).toEqual({ storyPoints: 5, module: 'Legajo Digital', title: 'Pestaña "Pendientes de firma" en el Perfil' });
    expect(parseSubject('Sin prefijos')).toEqual({ storyPoints: null, module: null, title: 'Sin prefijos' });
  });
});

describe('mapIssue', () => {
  it('arma el resumen con horas, relaciones y las últimas 3 notas con texto', () => {
    const issue = mapIssue(RAW, 'https://r.example.com');
    expect(issue).toMatchObject({ id: 33526, url: 'https://r.example.com/issues/33526', status: 'Desarrollo', storyPoints: 5, estimatedHours: 16, spentHours: 1, relations: 2, assignedTo: 'Bruno' });
    expect(issue.lastNotes.map((note) => note.notes)).toEqual(['dos', 'tres', 'cuatro']);
  });
});

describe('credenciales', () => {
  it('lee la key del archivo de la skill, normaliza la URL y respeta enabled=false', () => {
    expect(loadCredentials(config, {})).toEqual({ key: SECRET, baseUrl: 'https://redmine.example.com' });
    expect(loadCredentials({ ...config, redmine: { ...config.redmine, enabled: false } }, {})).toBeNull();
    expect(loadCredentials({ ...config, redmine: { enabled: true, configFile: join(dir, 'no-existe.json'), baseUrl: '' } }, {})).toBeNull();
  });
  it('la variable de entorno tiene prioridad', () => {
    expect(loadCredentials(config, { REDMINE_API_KEY: 'otra', REDMINE_URL: 'https://x.test' })).toEqual({ key: 'otra', baseUrl: 'https://x.test' });
  });
});

describe('fetchIssue', () => {
  const okFetcher = (calls: Array<{ url: string; key: string | undefined }>) => async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, key: init.headers['X-Redmine-API-Key'] });
    return { ok: true, status: 200, json: async () => ({ issue: RAW }) };
  };

  it('manda la key por cabecera, no por URL, y cachea 60 s', async () => {
    const calls: Array<{ url: string; key: string | undefined }> = [];
    const fetcher = okFetcher(calls);
    const first = await fetchIssue(config, '33526', fetcher, 1000);
    await fetchIssue(config, '33526', fetcher, 30_000);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://redmine.example.com/issues/33526.json?include=journals,relations');
    expect(calls[0]!.url).not.toContain(SECRET);
    expect(calls[0]!.key).toBe(SECRET);
    expect(JSON.stringify(first)).not.toContain(SECRET);
    await fetchIssue(config, '33526', fetcher, 90_000);
    expect(calls).toHaveLength(2);
  });

  it('valida el número, y traduce 404, 401 y falta de credenciales', async () => {
    await expect(fetchIssue(config, '33526; rm', okFetcher([]))).rejects.toMatchObject({ status: 400 });
    const status = (code: number) => async () => ({ ok: false, status: code, json: async () => ({}) });
    await expect(fetchIssue(config, '33526', status(404))).rejects.toMatchObject({ status: 404 });
    await expect(fetchIssue(config, '33526', status(401))).rejects.toMatchObject({ status: 403 });
    const off = { ...config, redmine: { enabled: false, configFile: '', baseUrl: '' } };
    await expect(fetchIssue(off, '33526', okFetcher([]))).rejects.toBeInstanceOf(RedmineError);
  });
});

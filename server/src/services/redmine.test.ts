import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, paths } from '../config.js';
import { RedmineError, clearRedmineCache, fetchIssue, forgetRedmineIssue, httpProblem, loadCredentials, mapIssue, parseSubject } from './redmine.js';

const SECRET = 'clave-secreta-de-prueba-0123456789abcdef';
const dir = mkdtempSync(join(tmpdir(), 'dp-redmine-'));
const file = join(dir, 'config.json');
writeFileSync(file, JSON.stringify({ api_key: SECRET, redmine_url: 'https://redmine.example.com/' }));
const config = { ...defaultConfig('/work'), redmine: { enabled: true, apiKey: '', configFile: file, baseUrl: '', doneStatuses: [] } };

const RAW = {
  id: 33526, subject: '[5 SP] [Módulo : Legajo Digital] Pestaña "Pendientes de firma" en el Perfil', project: { name: 'TRIUNFO - RRHH' }, tracker: { name: 'Nueva funcionalidad' },
  status: { name: 'Desarrollo' }, priority: { name: 'Normal' }, author: { name: 'Nico' }, assigned_to: { name: 'Bruno' }, estimated_hours: 16, spent_hours: 1,
  created_on: '2026-10-21T16:43:05Z', updated_on: '2026-10-27T13:46:27Z', relations: [{}, {}],
  journals: [{ user: { name: 'A' }, created_on: '2026-10-26', notes: '' }, ...['uno', 'dos', 'tres', 'cuatro'].map((notes, i) => ({ user: { name: 'B' }, created_on: `2026-10-2${i}`, notes }))],
};

beforeEach(() => {
  clearRedmineCache();
  // El caché de SP vive en archivo: cada prueba parte vacía.
  mkdirSync(paths.data, { recursive: true });
  writeFileSync(join(paths.data, 'sp-cache.json'), '{}');
});

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

  it('trae la descripción completa solo en el detalle (con journals), no en las listas', () => {
    const list = Object.fromEntries(Object.entries(RAW).filter(([key]) => key !== 'journals')) as typeof RAW;
    expect(mapIssue({ ...RAW, description: '  # Título\n\nTexto largo  ' }, 'https://r.example.com').description).toBe('# Título\n\nTexto largo');
    expect(mapIssue({ ...list, description: 'no debería viajar' }, 'https://r.example.com').description).toBe('');
  });
});

describe('credenciales', () => {
  it('usa redmine.apiKey del config local después de la variable y antes de la skill', () => {
    const local = { ...config, redmine: { ...config.redmine, apiKey: 'clave-del-config' } };
    expect(loadCredentials(local, {})).toEqual({ key: 'clave-del-config', baseUrl: 'https://redmine.example.com' });
    expect(loadCredentials(local, { REDMINE_API_KEY: 'de-la-variable' })?.key).toBe('de-la-variable');
  });

  it('lee la key del archivo de la skill, normaliza la URL y respeta enabled=false', () => {
    expect(loadCredentials(config, {})).toEqual({ key: SECRET, baseUrl: 'https://redmine.example.com' });
    expect(loadCredentials({ ...config, redmine: { ...config.redmine, enabled: false } }, {})).toBeNull();
    expect(loadCredentials({ ...config, redmine: { enabled: true, apiKey: '', configFile: join(dir, 'no-existe.json'), baseUrl: '', doneStatuses: [] } }, {})).toBeNull();
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
    expect(calls.filter((call) => call.url.includes('/issues/33526.json'))).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://redmine.example.com/issues/33526.json?include=journals,relations');
    expect(calls[0]!.url).not.toContain(SECRET);
    expect(calls[0]!.key).toBe(SECRET);
    expect(JSON.stringify(first)).not.toContain(SECRET);
    await fetchIssue(config, '33526', fetcher, 90_000);
    expect(calls.filter((call) => call.url.includes('/issues/33526.json'))).toHaveLength(2);
  });

  it('"Actualizar" olvida lo guardado de un ticket y el siguiente pedido va a Redmine', async () => {
    const calls: Array<{ url: string; key: string | undefined }> = [];
    const fetcher = okFetcher(calls);
    await fetchIssue(config, '33526', fetcher, 1000);
    await fetchIssue(config, '33526', fetcher, 2000);
    const issueCalls = () => calls.filter((call) => call.url.includes('/issues/33526.json')).length;
    expect(issueCalls()).toBe(1);
    forgetRedmineIssue('33526');
    await fetchIssue(config, '33526', fetcher, 3000);
    expect(issueCalls()).toBe(2);
  });

  it('valida el número, y traduce 404, 401 y falta de credenciales', async () => {
    await expect(fetchIssue(config, '33526; rm', okFetcher([]))).rejects.toMatchObject({ status: 400 });
    const status = (code: number) => async () => ({ ok: false, status: code, json: async () => ({}) });
    await expect(fetchIssue(config, '33526', status(404))).rejects.toMatchObject({ status: 404 });
    await expect(fetchIssue(config, '33526', status(401))).rejects.toMatchObject({ status: 403 });
    const off = { ...config, redmine: { enabled: false, apiKey: '', configFile: '', baseUrl: '', doneStatuses: [] } };
    await expect(fetchIssue(off, '33526', okFetcher([]))).rejects.toBeInstanceOf(RedmineError);
  });
});

describe('errores de Redmine', () => {
  const html = { get: (name: string) => (name === 'content-type' ? 'text/html' : null) };
  const json = { get: (name: string) => (name === 'content-type' ? 'application/json' : null) };
  it('un 403 con HTML (proxy) o un 5xx no se confunden con una key inválida', async () => {
    expect((await httpProblem({ status: 403, headers: html }))).toMatchObject({ status: 503 });
    expect((await httpProblem({ status: 403, headers: html })).message).toMatch(/no de la API key/);
    expect((await httpProblem({ status: 502, headers: html })).message).toMatch(/no está disponible/);
  });
  it('un 401 con JSON sí es una key rechazada, y 404 es ticket inexistente', async () => {
    expect((await httpProblem({ status: 401, headers: json })).message).toMatch(/rechazó la API key/);
    expect(await httpProblem({ status: 404, headers: json }, '33526')).toMatchObject({ status: 404 });
  });
});

describe('story points del plugin Agile', () => {
  it('los lee de agile_data (aunque el título no los traiga), los guarda por versión del ticket y no los vuelve a pedir', async () => {
    const calls: string[] = [];
    const raw = { ...RAW, id: 33023, subject: '[Módulo : Legajos - Autogestión] Bloqueo de usuarios', updated_on: '2026-10-27T13:46:27Z' };
    const fetcher = async (url: string) => {
      calls.push(url);
      if (url.includes('agile_data')) return { ok: true, status: 200, json: async () => ({ agile_data: { issue_id: 33023, story_points: 8 } }) };
      return { ok: true, status: 200, json: async () => ({ issue: raw }) };
    };
    clearRedmineCache();
    const first = await fetchIssue(config, '33023', fetcher, 1000);
    expect(first.storyPoints).toBe(8);
    clearRedmineCache();
    const again = await fetchIssue(config, '33023', fetcher, 999_999);
    expect(again.storyPoints).toBe(8);
    expect(calls.filter((url) => url.includes('agile_data'))).toHaveLength(1);
  });

  it('si el endpoint falla, queda el valor del título', async () => {
    const raw = { ...RAW, id: 99001, updated_on: '2026-10-28T00:00:00Z' };
    const fetcher = async (url: string) => (url.includes('agile_data') ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ issue: raw }) });
    clearRedmineCache();
    expect((await fetchIssue(config, '99001', fetcher, 1000)).storyPoints).toBe(5);
  });
});

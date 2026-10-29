import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import type { CommandResult, Runner } from '../docker.js';
import { fetchTicketMrs, clearGitlabCache, clearSshToken, mapMr, parseSshToken, mergeOrder, projectOfMr, refsForTicket, type Fetcher } from './gitlab.js';
import type { RepoStatus } from './gitRepos.js';
import { parseQueues, readServicesHealth, readTestDataReport } from './ticketHealth.js';
import { buildShipChecklist, extractI18nBlocks, flattenKeys, lastRunOf, parseRunResult, readI18nCheck, repoWarnings, reposChangedSince, summarizeShip } from './ticketStatus.js';

const repo = (over: Partial<RepoStatus> = {}): RepoStatus => ({
  repo: 'front', exists: true, branch: 'feature/1-x', base: { name: 'desarrollo', ahead: 2, behind: 0 }, dirty: [], last: null, lastCommitAt: '2026-10-28T10:00:00-03:00',
  upstream: { name: 'origin/feature/1-x', ahead: 0, behind: 0 }, commits: [], stashes: 0, ticket: '1', ...over,
});

describe('parseRunResult', () => {
  it('separa tramos con etiqueta', () => {
    expect(parseRunResult('API 25/25 · pantalla A 25/26 · B 31/31')).toEqual([
      { label: 'API', passed: 25, total: 25 }, { label: 'pantalla A', passed: 25, total: 26 }, { label: 'B', passed: 31, total: 31 },
    ]);
  });
  it('acepta un tramo sin etiqueta e ignora el texto sin n/m', () => {
    expect(parseRunResult('31/31')).toEqual([{ label: null, passed: 31, total: 31 }]);
    expect(parseRunResult('todo bien')).toEqual([]);
    expect(parseRunResult(undefined)).toEqual([]);
  });
  it('lastRunOf suma y detecta fallos', () => {
    const run = lastRunOf({ pruebas: [{ fecha: '2026-10-27', resultado: '1/1' }, { fecha: '2026-10-28', resultado: 'A 2/3 · B 1/1' }] });
    expect(run).toMatchObject({ fecha: '2026-10-28', passed: 3, total: 4, allPassed: false });
    expect(lastRunOf(null)).toBeNull();
  });
});

describe('repoWarnings', () => {
  it('repo sano = sin avisos', () => expect(repoWarnings(repo(), 'feature/1-x')).toEqual([]));
  it('avisa rama distinta, cambios, rebase y push', () => {
    const texts = repoWarnings(repo({ branch: 'desarrollo', dirty: [{ status: 'M', path: 'a' }], base: { name: 'desarrollo', ahead: 1, behind: 3 }, upstream: { name: 'o', ahead: 2, behind: 0 } }), 'feature/1-x').map((warning) => warning.text);
    expect(texts).toEqual(expect.arrayContaining([expect.stringContaining('el ticket usa'), '1 archivo sin commitear', expect.stringContaining('falta rebase'), '2 commits sin push']));
  });
  it('rama con trabajo y sin upstream = sin publicar; tras rebase = divergió', () => {
    expect(repoWarnings(repo({ upstream: null }), undefined).map((w) => w.text)).toEqual(['La rama no está publicada (sin upstream)']);
    expect(repoWarnings(repo({ upstream: { name: 'o', ahead: 8, behind: 8 } }), undefined)[0]?.text).toContain('Divergió');
  });
  it('repo inexistente es error', () => expect(repoWarnings(repo({ exists: false }), undefined)[0]?.level).toBe('error'));
});

describe('reposChangedSince', () => {
  it('solo cuenta commits de días posteriores', () => {
    expect(reposChangedSince('2026-10-28', [repo({ repo: 'a', lastCommitAt: '2026-10-28T23:00:00Z' }), repo({ repo: 'b', lastCommitAt: '2026-10-29T08:00:00Z' }), repo({ repo: 'c', lastCommitAt: null })])).toEqual(['b']);
    expect(reposChangedSince(null, [repo()])).toEqual([]);
  });
});

describe('buildShipChecklist', () => {
  const meta = { rama: 'feature/1-x', repos: ['front'], pruebas: [{ fecha: '2026-10-28', resultado: '31/31' }], codeReview: [{ fecha: '2026-10-28', veredicto: 'aprobado' }], mrs: [{ repo: 'front', iid: 1 }] };
  const base = { meta, docs: ['1_EJECUCION_v1.0.md'], repos: [repo()], manual: { done: 3, total: 3 }, i18n: null };
  it('todo en orden = listo', () => {
    const items = buildShipChecklist(base);
    expect(items.every((item) => item.level === 'ok' || item.level === 'idle')).toBe(true);
    expect(summarizeShip(items).ready).toBe(true);
  });
  it('sin pruebas ni review ni MRs: errores y avisos', () => {
    const items = buildShipChecklist({ ...base, meta: { rama: 'feature/1-x', repos: ['front'] }, docs: [], manual: { done: 1, total: 4 } });
    const level = (id: string) => items.find((item) => item.id === id)?.level;
    expect(level('tests')).toBe('error');
    expect(level('review')).toBe('error');
    expect(level('report')).toBe('warn');
    expect(level('manual')).toBe('warn');
    expect(level('mrs')).toBe('warn');
    expect(summarizeShip(items).ready).toBe(false);
  });
  it('tests con fallo y commits posteriores', () => {
    const items = buildShipChecklist({ ...base, meta: { ...meta, pruebas: [{ fecha: '2026-10-20', resultado: 'A 2/3' }] } });
    expect(items.find((item) => item.id === 'tests')?.detail).toContain('A 2/3');
    expect(items.find((item) => item.id === 'fresh')?.level).toBe('warn');
  });
  it('claves i18n faltantes son error', () => {
    const items = buildShipChecklist({ ...base, i18n: { file: 'x.md', total: 2, missing: { es: ['a.b'], en: [] } } });
    expect(items.find((item) => item.id === 'i18n')?.level).toBe('error');
  });
});

describe('claves i18n', () => {
  const md = '# t\n\n## Bloque para `src/assets/i18n/es.json`\n\n```json\n    "pending": { "title": "T", "tabs": { "a": "A" } }\n```\n\n## Bloque para `src/assets/i18n/en.json`\n\n```json\n    "pending": { "title": "T", "tabs": { "a": "A" } }\n```\n';
  it('extrae y aplana', () => {
    const blocks = extractI18nBlocks(md);
    expect(flattenKeys(blocks.es)).toEqual(['pending.title', 'pending.tabs.a']);
    expect(Object.keys(blocks)).toEqual(['es', 'en']);
  });
  it('compara con los diccionarios del front', () => {
    const root = mkdtempSync(join(tmpdir(), 'i18n-'));
    const ticketDir = join(root, 'extra');
    const i18n = join(root, 'projects', 'front', 'src', 'assets', 'i18n');
    mkdirSync(ticketDir, { recursive: true });
    mkdirSync(i18n, { recursive: true });
    writeFileSync(join(ticketDir, '1_I18N_KEYS.md'), md);
    writeFileSync(join(i18n, 'es.json'), JSON.stringify({ pending: { title: 'x', tabs: { a: 'a' } } }));
    writeFileSync(join(i18n, 'en.json'), JSON.stringify({ pending: { title: 'x' } }));
    expect(readI18nCheck(ticketDir, join(root, 'projects'))).toEqual({ file: '1_I18N_KEYS.md', total: 2, missing: { es: [], en: ['pending.tabs.a'] } });
    expect(readI18nCheck(join(root, 'projects'), join(root, 'projects'))).toBeNull();
  });
});

describe('gitlab', () => {
  const config = defaultConfig('/work');
  it('toma el proyecto de la URL solo si es el host configurado', () => {
    expect(projectOfMr(config, { url: 'https://git.icono-cloud.com/e-sueldos-v3/legajo/-/merge_requests/12' })).toEqual({ project: 'e-sueldos-v3/legajo', iid: 12 });
    expect(projectOfMr(config, { url: 'https://evil.example/x/y/-/merge_requests/1' })).toBeNull();
    expect(projectOfMr(config, { url: 'https://evil.example/x/y/-/merge_requests/1', repo: 'legajo', iid: 3 })).toEqual({ project: 'e-sueldos-v3/legajo', iid: 3 });
    expect(projectOfMr(config, { repo: '../x', iid: 3 })).toBeNull();
  });
  it('orden de merge: backends primero, front al final, o el explícito', () => {
    expect(mergeOrder(['front', 'legajo', 'documentos'], undefined)).toEqual(['documentos', 'legajo', 'front']);
    expect(mergeOrder(['front', 'legajo', 'documentos'], ['legajo', 'documentos'])).toEqual(['legajo', 'documentos', 'front']);
  });
  it('refsForTicket ordena', () => {
    const refs = refsForTicket(config, { mrs: [{ repo: 'front', iid: 3 }, { repo: 'documentos', iid: 1 }] } as never);
    expect(refs.map((ref) => [ref.repo, ref.order])).toEqual([['front', 1], ['documentos', 0]]);
  });
  const ref = { repo: 'front', iid: 1, project: 'g/front', order: 0 };
  it('mapMr: prioridades de estado', () => {
    expect(mapMr(ref, { state: 'merged' }).level).toBe('ok');
    expect(mapMr(ref, { state: 'opened', has_conflicts: true }).level).toBe('error');
    expect(mapMr(ref, { state: 'opened', head_pipeline: { status: 'failed' } }).summary).toContain('falló');
    expect(mapMr(ref, { state: 'opened', blocking_discussions_resolved: false }).level).toBe('warn');
    expect(mapMr(ref, { state: 'opened', draft: true }).summary).toContain('borrador');
    expect(mapMr(ref, { state: 'opened', head_pipeline: { status: 'running' } }).level).toBe('warn');
    expect(mapMr(ref, { state: 'opened', head_pipeline: { status: 'success' }, detailed_merge_status: 'mergeable' }).level).toBe('ok');
    expect(mapMr(ref, { state: 'opened', detailed_merge_status: 'not_approved' }).summary).toContain('not approved');
  });
  it('fetchTicketMrs: sin token no llama; con token usa el host configurado y no filtra el token', async () => {
    clearGitlabCache();
    const meta = { mrs: [{ repo: 'front', iid: 7, url: 'https://git.icono-cloud.com/e-sueldos-v3/front/-/merge_requests/7' }] } as never;
    const calls: Array<{ url: string; token: string | undefined }> = [];
    const fetcher: Fetcher = async (url, init) => {
      calls.push({ url, token: init.headers['PRIVATE-TOKEN'] });
      return { ok: true, status: 200, json: async () => ({ state: 'opened', title: 'T', web_url: 'u' }) };
    };
    expect(await fetchTicketMrs(config, meta, false, fetcher, 0, {})).toMatchObject({ configured: false, mrs: [] });
    expect(calls).toHaveLength(0);
    const report = await fetchTicketMrs(config, meta, false, fetcher, 0, { GITLAB_TOKEN: 'secret' });
    expect(report.mrs[0]).toMatchObject({ iid: 7, title: 'T', level: 'ok' });
    expect(calls[0]).toEqual({ url: 'https://git.icono-cloud.com/api/v4/projects/e-sueldos-v3%2Ffront/merge_requests/7', token: 'secret' });
    await fetchTicketMrs(config, meta, false, fetcher, 1000, { GITLAB_TOKEN: 'secret' });
    expect(calls).toHaveLength(1); // caché de 30 s
    await fetchTicketMrs(config, meta, true, fetcher, 1000, { GITLAB_TOKEN: 'secret' });
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(report)).not.toContain('secret');
  });
  it('una falla queda en la fila, no tira todo', async () => {
    clearGitlabCache();
    const fetcher: Fetcher = async () => ({ ok: false, status: 401, json: async () => ({}) });
    const report = await fetchTicketMrs(config, { mrs: [{ repo: 'front', iid: 9 }] } as never, true, fetcher, 0, { GITLAB_TOKEN: 'x' });
    expect(report.mrs[0]).toMatchObject({ level: 'error', error: expect.stringContaining('token') });
  });
});

describe('token de 1 día por SSH', () => {
  const config = { ...defaultConfig('/work'), gitlab: { ...defaultConfig('/work').gitlab, sshAuto: true } };
  const meta = { mrs: [{ repo: 'front', iid: 7 }] } as never;
  const sshOutput = 'Token:   glpat-AbCd.01.0w1eq82ou\nScopes:  read_api\nExpires: 2026-10-31\n';
  it('parseSshToken toma la palabra completa, con puntos', () => {
    expect(parseSshToken(sshOutput)).toBe('glpat-AbCd.01.0w1eq82ou');
    expect(parseSshToken('remote: Usage: personal_access_token <name>')).toBeNull();
  });
  it('sshAuto apagado: no usa SSH', async () => {
    clearSshToken();
    clearGitlabCache();
    const calls: string[][] = [];
    const runner: Runner = async (_file, args) => (calls.push(args), { ok: true, stdout: sshOutput, stderr: '' });
    const fetcher: Fetcher = async () => ({ ok: true, status: 200, json: async () => ({ state: 'opened' }) });
    const report = await fetchTicketMrs(defaultConfig('/work'), meta, true, fetcher, 0, {}, runner);
    expect(report).toMatchObject({ configured: false, tokenError: null });
    expect(calls).toHaveLength(0);
  });
  it('pide el token por SSH al host configurado, lo reutiliza y no lo devuelve', async () => {
    clearSshToken();
    clearGitlabCache();
    const calls: string[][] = [];
    const runner: Runner = async (file, args) => (calls.push([file, ...args]), { ok: true, stdout: sshOutput, stderr: '' });
    const used: string[] = [];
    const fetcher: Fetcher = async (_url, init) => (used.push(init.headers['PRIVATE-TOKEN'] ?? ''), { ok: true, status: 200, json: async () => ({ state: 'opened' }) });
    const report = await fetchTicketMrs(config, meta, true, fetcher, 0, {}, runner);
    expect(calls[0]).toEqual(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'git@git.icono-cloud.com', 'personal_access_token', 'dev-panel', 'read_api', '1']);
    expect(used).toEqual(['glpat-AbCd.01.0w1eq82ou']);
    expect(JSON.stringify(report)).not.toContain('glpat');
    await fetchTicketMrs(config, meta, true, fetcher, 1000, {}, runner);
    expect(calls).toHaveLength(1); // reutilizado
  });
  it('si GitLab rechaza el token pedido, pide uno nuevo una vez y reintenta', async () => {
    clearSshToken();
    clearGitlabCache();
    let mints = 0;
    const runner: Runner = async () => ({ ok: true, stdout: `Token:   glpat-${++mints === 1 ? 'viejo' : 'nuevo'}.01.x\n`, stderr: '' });
    const fetcher: Fetcher = async (_url, init) => (init.headers['PRIVATE-TOKEN']?.includes('viejo') ? { ok: false, status: 401, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ state: 'merged' }) });
    const report = await fetchTicketMrs(config, meta, true, fetcher, 0, {}, runner);
    expect(mints).toBe(2);
    expect(report.mrs[0]).toMatchObject({ state: 'merged', level: 'ok' });
  });
  it('si SSH falla, lo informa y no reintenta enseguida', async () => {
    clearSshToken();
    clearGitlabCache();
    let calls = 0;
    const runner: Runner = async () => (calls++, { ok: false, stdout: '', stderr: 'Permission denied (publickey)' });
    const fetcher: Fetcher = async () => ({ ok: true, status: 200, json: async () => ({}) });
    const first = await fetchTicketMrs(config, meta, true, fetcher, 10_000, {}, runner);
    expect(first).toMatchObject({ configured: false, tokenError: expect.stringContaining('SSH') });
    await fetchTicketMrs(config, meta, true, fetcher, 20_000, {}, runner);
    expect(calls).toBe(1);
  });
  it('un token fijo (variable) manda sobre SSH', async () => {
    clearSshToken();
    clearGitlabCache();
    let calls = 0;
    const runner: Runner = async () => (calls++, { ok: true, stdout: sshOutput, stderr: '' });
    const fetcher: Fetcher = async () => ({ ok: true, status: 200, json: async () => ({ state: 'opened' }) });
    await fetchTicketMrs(config, meta, true, fetcher, 0, { GITLAB_TOKEN: 'fijo' }, runner);
    expect(calls).toBe(0);
  });
});

describe('servicios y datos de prueba', () => {
  const config = defaultConfig('/work');
  const ok = (stdout = ''): CommandResult => ({ ok: true, stdout, stderr: '' });
  it('parseQueues ignora cabeceras', () => {
    expect(parseQueues('name\tmessages_ready\tmessages_unacknowledged\nuser.update\t0\t3\nother\t2\t0')).toEqual([{ name: 'user.update', ready: 0, unacked: 3 }, { name: 'other', ready: 2, unacked: 0 }]);
  });
  it('marca detenido, ausente y sano', async () => {
    const runner: Runner = async (_file, args) => {
      if (args[0] === 'ps') return ok(['legajo\trunning\tUp 2 hours (healthy)\t\timg\tlegajo', 'security\texited\tExited (1)\t\timg\tsecurity', 'minio-mc\texited\tExited (0) 3 hours ago\t\timg\tmc'].join('\n'));
      if (args[0] === 'inspect') return ok('');
      return ok('Found 0 errors. Watching for file changes.');
    };
    const report = await readServicesHealth(config, { repos: ['legajo'] } as never, runner);
    const by = (name: string) => report.services.find((item) => item.service === name);
    expect(by('legajo')?.level).toBe('ok');
    expect(by('security')).toMatchObject({ level: 'error', state: 'exited' });
    expect(by('mc')).toMatchObject({ level: 'idle' });
    expect(report.missing).not.toContain('mc');
    expect(by('new-panel')).toMatchObject({ level: 'error', state: 'missing' });
    expect(report.missing).toContain('new-panel');
  });
  it('datos de prueba: sin ticket no consulta Mongo y las colas salen filtradas', async () => {
    const runner: Runner = async (_file, args) => (args.includes('rabbitmqctl') ? ok('q1\t0\t0\nuser.update\t0\t4') : { ok: false, stdout: '', stderr: 'mongo caído' });
    const report = await readTestDataReport(config, { datosPrueba: { avisos: ['a'] } } as never, null, runner);
    expect(report.error).toContain('número de ticket');
    expect(report.queues).toEqual([{ name: 'user.update', ready: 0, unacked: 4 }]);
    expect(report.notes?.avisos).toEqual(['a']);
    const failing = await readTestDataReport(config, null, '33526', runner);
    expect(failing.error).toBeTruthy();
  });
});

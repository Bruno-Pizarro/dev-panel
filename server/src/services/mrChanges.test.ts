import { beforeEach, describe, expect, it } from 'vitest';
import type { DevPanelConfig } from '../config.js';
import type { Fetcher } from './gitlab.js';
import { clearMrChangesCache, mapMrFiles, mrLabel, readMrChanges, readMrFileDiff, readMrSignature } from './mrChanges.js';
import { viewKey } from './changeReview.js';

const config = { gitlab: { enabled: true, baseUrl: 'https://git.example.com', group: 'grupo', token: 'tk-inventado', sshAuto: false } } as unknown as DevPanelConfig;
const meta = { ticket: '1', mrs: [{ repo: 'front', iid: 7 }, { repo: 'legajo', iid: 3 }] } as never;
const raw = { source_branch: 'feature/x', target_branch: 'desarrollo', changes: [
  { old_path: 'a.ts', new_path: 'a.ts', diff: '@@ -1,2 +1,2 @@\n-uno\n+dos\n igual\n' },
  { old_path: 'b.png', new_path: 'b.png', new_file: true, diff: '' },
] };
const fetcher = ((calls: string[]) => (async (url: string) => (calls.push(url), { ok: true, status: 200, json: async () => raw }))) as (calls: string[]) => Fetcher;

beforeEach(clearMrChangesCache);

describe('cambios de MRs de GitLab', () => {
  it('mapea archivos: estado, líneas, binarios sin diff y huella estable', () => {
    const files = mapMrFiles(raw, {}, 'front !7');
    expect(files.map((file) => [file.path, file.status, file.added, file.deleted, file.binary])).toEqual([['a.ts', 'M', 1, 1, false], ['b.png', 'A', null, null, true]]);
    expect(files[0]!.signature).toBe(mapMrFiles(raw, {}, 'front !7')[0]!.signature);
  });

  it('la marca de visto vale mientras el diff sea el mismo y pasa a "changed" si cambia', () => {
    const [seen] = mapMrFiles(raw, {}, 'front !7');
    const viewed = { [viewKey('front !7', 'committed', 'a.ts')]: seen!.signature };
    expect(mapMrFiles(raw, viewed, 'front !7')[0]!.viewed).toBe('yes');
    const changed = { ...raw, changes: [{ ...raw.changes[0]!, diff: '@@ -1 +1 @@\n-uno\n+tres\n' }] };
    expect(mapMrFiles(changed, viewed, 'front !7')[0]!.viewed).toBe('changed');
  });

  it('lee cada MR del ticket con el token en la cabecera, solo al servidor configurado, y cachea', async () => {
    const calls: string[] = [];
    const headers: Array<Record<string, string>> = [];
    const spy: Fetcher = async (url, init) => (headers.push(init.headers), fetcher(calls)(url, init));
    const report = await readMrChanges(config, meta, {}, false, { fetcher: spy });
    // El front va último en el orden de merge.
    expect(report.repos.map((repo) => repo.repo)).toEqual(['legajo !3', 'front !7']);
    expect(calls.every((url) => url.startsWith('https://git.example.com/api/v4/projects/'))).toBe(true);
    expect(headers[0]).toEqual({ 'PRIVATE-TOKEN': 'tk-inventado' });
    await readMrChanges(config, meta, {}, false, { fetcher: spy });
    expect(calls).toHaveLength(2);
    expect(report.progress.total).toBe(4);
  });

  it('devuelve el diff de un archivo, avisa si no hay diff y rechaza MRs ajenos al ticket', async () => {
    const deps = { fetcher: fetcher([]) };
    expect(await readMrFileDiff(config, meta, 'front !7', 'a.ts', deps)).toMatchObject({ ok: true, value: { diff: raw.changes[0]!.diff } });
    expect(await readMrFileDiff(config, meta, 'front !7', 'b.png', deps)).toMatchObject({ ok: true, value: { truncated: true } });
    expect(await readMrFileDiff(config, meta, 'otro !1', 'a.ts', deps)).toMatchObject({ ok: false, status: 404 });
    expect(await readMrSignature(config, meta, 'front !7', 'nada.ts', deps)).toMatchObject({ ok: false, status: 404 });
  });

  it('sin token no intenta nada y explica por qué', async () => {
    const calls: string[] = [];
    const report = await readMrChanges({ gitlab: { ...config.gitlab, token: '' } } as never, { ticket: '1', mrs: [{ repo: 'front', iid: 7 }] } as never, {}, false, { fetcher: fetcher(calls), env: {} });
    expect(calls).toHaveLength(0);
    expect(report.repos).toEqual([]);
    expect(report.message).toMatch(/token/i);
  });

  it('etiqueta el MR con repo e iid', () => {
    expect(mrLabel({ repo: null, project: 'g/legajo', iid: 4 })).toBe('legajo !4');
  });
});

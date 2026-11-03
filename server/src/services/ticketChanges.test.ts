import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig, type DevPanelConfig } from '../config.js';
import { isSafeRelativePath, limitDiff, MAX_DIFF_LINES, parseNameStatus, parseNumstat, readFileDiff, readTicketChanges } from './ticketChanges.js';

describe('parsers', () => {
  it('parseNumstat lee agregadas, borradas y binarios', () => {
    expect(parseNumstat('3\t1\ta.ts\n-\t-\timg.png\nbasura')).toEqual([
      { path: 'a.ts', added: 3, deleted: 1, binary: false },
      { path: 'img.png', added: null, deleted: null, binary: true },
    ]);
  });
  it('parseNameStatus devuelve la letra de estado por ruta', () => {
    expect([...parseNameStatus('M\ta.ts\nA\tdir/b.ts\n')]).toEqual([['a.ts', 'M'], ['dir/b.ts', 'A']]);
  });
  it('isSafeRelativePath rechaza escapes y opciones', () => {
    expect(isSafeRelativePath('src/a.ts')).toBe(true);
    for (const bad of ['', '/etc/passwd', '../x', 'a/../../x', '--output=x', 'a\0b']) expect(isSafeRelativePath(bad)).toBe(false);
  });
  it('limitDiff corta los diffs enormes', () => {
    expect(limitDiff('+a\n-b').truncated).toBe(false);
    expect(limitDiff('x\n'.repeat(MAX_DIFF_LINES + 1))).toMatchObject({ truncated: true, diff: '' });
    expect(limitDiff('x'.repeat(1024 * 1024 + 1)).reason).toMatch(/1 MB/);
  });
});

describe('con un repo git real', () => {
  const projects = mkdtempSync(join(tmpdir(), 'dp-changes-'));
  const repoDir = join(projects, 'documentos');
  const git = (...args: string[]) => execFileSync('git', ['-C', repoDir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  mkdirSync(repoDir);
  git('init', '-q', '-b', 'desarrollo');
  writeFileSync(join(repoDir, 'a.ts'), 'uno\n');
  writeFileSync(join(repoDir, '.env'), 'X=1\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feature/1-x');
  writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\n');
  writeFileSync(join(repoDir, 'b.ts'), 'nuevo\n');
  git('add', '.');
  git('commit', '-q', '-m', 'cambio propio');
  writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\ntres\n');
  writeFileSync(join(repoDir, '.env'), 'X=2\n');
  writeFileSync(join(repoDir, 'captura.png'), 'bin');
  const config = { ...defaultConfig(projects), envProfiles: { documentos: { file: '.env' } } } as unknown as DevPanelConfig;

  it('separa commiteado y sin commitear, e ignora el .env administrado', async () => {
    const [changes] = await readTicketChanges(config, ['documentos']);
    expect(changes).toMatchObject({ exists: true, branch: 'feature/1-x', base: 'desarrollo', ignored: ['.env'] });
    expect(changes!.commits.map((commit) => commit.subject)).toEqual(['cambio propio']);
    expect(changes!.committed.map((file) => [file.path, file.status, file.added])).toEqual([['a.ts', 'M', 1], ['b.ts', 'A', 1]]);
    expect(changes!.working.map((file) => [file.path, file.status])).toEqual([['a.ts', 'M'], ['captura.png', 'nuevo']]);
  });

  it('un repo inexistente se informa sin romper', async () => {
    expect((await readTicketChanges(config, ['nope']))[0]).toMatchObject({ exists: false, committed: [] });
  });

  it('devuelve el diff de un archivo, por alcance', async () => {
    const committed = await readFileDiff(config, 'documentos', 'a.ts', 'committed');
    expect(committed.ok && committed.value.diff).toContain('+dos');
    const working = await readFileDiff(config, 'documentos', 'a.ts', 'working');
    expect(working.ok && working.value.diff).toContain('+tres');
    expect(working.ok && working.value.diff).not.toContain('+dos');
  });

  it('no muestra sin trackear, ni el .env, ni rutas fuera de los cambios o inseguras', async () => {
    expect(await readFileDiff(config, 'documentos', 'captura.png', 'working')).toMatchObject({ ok: true, value: { truncated: true } });
    expect(await readFileDiff(config, 'documentos', '.env', 'working')).toMatchObject({ ok: false, status: 404 });
    expect(await readFileDiff(config, 'documentos', 'a.ts', 'committed').then((r) => r.ok)).toBe(true);
    expect(await readFileDiff(config, 'documentos', '../../etc/passwd', 'working')).toMatchObject({ ok: false, status: 400 });
    expect(await readFileDiff(config, 'documentos', 'no-cambiado.ts', 'committed')).toMatchObject({ ok: false, status: 404 });
  });
});

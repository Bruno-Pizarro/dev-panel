import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, type DevPanelConfig } from '../config.js';
import { isSafeRelativePath, limitDiff, MAX_DIFF_LINES, parseNameStatus, parseNumstat, parseRawStatuses, clearBaseCache, readFileDiff, readFileDiffSince, readFileSignature, readTicketChanges } from './ticketChanges.js';

describe('parsers', () => {
  it('parseNumstat lee agregadas, borradas y binarios', () => {
    expect(parseNumstat('3\t1\ta.ts\n-\t-\timg.png\nbasura')).toEqual([
      { path: 'a.ts', added: 3, deleted: 1, binary: false },
      { path: 'img.png', added: null, deleted: null, binary: true },
    ]);
  });
  it('parseRawStatuses devuelve la letra de estado por ruta desde la salida --raw', () => {
    const raw = ':100644 100644 aaa bbb M\ta.ts\n:000000 100644 0000 ccc A\tdir/b.ts\n3\t1\ta.ts\n';
    expect([...parseRawStatuses(raw)]).toEqual([['a.ts', 'M'], ['dir/b.ts', 'A']]);
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
  beforeEach(clearBaseCache);
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

describe('base de una rama cortada de otra feature', () => {
  beforeEach(clearBaseCache);
  const projects = mkdtempSync(join(tmpdir(), 'dp-base-'));
  const repoDir = join(projects, 'legajo');
  const git = (...args: string[]) => execFileSync('git', ['-C', repoDir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  const commit = (file: string, message: string) => (writeFileSync(join(repoDir, file), `${message}\n`), git('add', '.'), git('commit', '-q', '-m', message));
  mkdirSync(repoDir);
  git('init', '-q', '-b', 'desarrollo');
  commit('base.ts', 'base');
  git('checkout', '-q', '-b', 'feature/1-padre');
  commit('padre.ts', 'padre uno');
  commit('padre2.ts', 'padre dos');
  git('checkout', '-q', '-b', 'feature/2-hija');
  commit('hija.ts', 'hija');
  const config = defaultConfig(projects) as unknown as DevPanelConfig;

  it('compara con la rama padre y no con desarrollo', async () => {
    const [changes] = await readTicketChanges(config, ['legajo']);
    expect(changes).toMatchObject({ branch: 'feature/2-hija', base: 'feature/1-padre' });
    expect(changes!.committed.map((file) => file.path)).toEqual(['hija.ts']);
  });

  it('una rama cortada de desarrollo sigue comparándose con desarrollo', async () => {
    git('checkout', '-q', 'desarrollo');
    git('checkout', '-q', '-b', 'feature/3-directa');
    commit('directa.ts', 'directa');
    const [changes] = await readTicketChanges(config, ['legajo']);
    expect(changes).toMatchObject({ base: 'desarrollo' });
    expect(changes!.committed.map((file) => file.path)).toEqual(['directa.ts']);
  });
});

describe('un archivo con caracteres especiales en la ruta', () => {
  beforeEach(clearBaseCache);
  const projects = mkdtempSync(join(tmpdir(), 'dp-changes-glob-'));
  const repoDir = join(projects, 'front');
  const git = (...args: string[]) => execFileSync('git', ['-C', repoDir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  mkdirSync(repoDir);
  git('init', '-q', '-b', 'desarrollo');
  writeFileSync(join(repoDir, 'base.ts'), 'uno\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feature/2-y');
  writeFileSync(join(repoDir, '[id].ts'), 'a\n');
  writeFileSync(join(repoDir, 'otro.ts'), 'b\n');
  git('add', '.');
  git('commit', '-q', '-m', 'cambio');
  const config = { ...defaultConfig(projects), envProfiles: {} } as unknown as DevPanelConfig;

  it('se pide solo ese archivo: la ruta se toma literal (no como comodín)', async () => {
    const result = await readFileDiff(config, 'front', '[id].ts', 'committed');
    expect(result.ok && result.value.diff).toContain('+a');
    expect(result.ok && result.value.diff).not.toContain('+b');
    // un comodín no abre otros archivos: no figura entre los cambios
    expect(await readFileDiff(config, 'front', '*.ts', 'committed')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('últimos cambios: lo que cambió desde que se marcó como visto', () => {
  beforeEach(clearBaseCache);
  const projects = mkdtempSync(join(tmpdir(), 'dp-since-'));
  const repoDir = join(projects, 'front');
  const git = (...args: string[]) => execFileSync('git', ['-C', repoDir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  const config = { ...defaultConfig(projects), envProfiles: {} } as unknown as DevPanelConfig;
  mkdirSync(repoDir);
  git('init', '-q', '-b', 'desarrollo');
  writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feature/3-z');
  writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\ntres\n');
  git('add', '.');
  git('commit', '-q', '-m', 'primer cambio');
  const signatureOf = async (scope: 'committed' | 'working') => {
    const result = await readFileSignature(config, 'front', 'a.ts', scope);
    if (!result.ok) throw new Error(result.error);
    return result.signature;
  };

  it('commiteado: sin cambios nuevos no muestra nada; con un commit nuevo muestra solo ese cambio', async () => {
    const viewed = await signatureOf('committed');
    const same = await readFileDiffSince(config, 'front', 'a.ts', 'committed', viewed);
    expect(same.ok && same.value).toMatchObject({ diff: '', reason: 'Sin cambios desde que lo viste', since: true });
    writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\ntres\ncuatro\n');
    git('commit', '-q', '-am', 'segundo cambio');
    const since = await readFileDiffSince(config, 'front', 'a.ts', 'committed', viewed);
    expect(since.ok && since.value.since).toBe(true);
    expect(since.ok && since.value.diff).toContain('+cuatro');
    // lo que ya se había visto (+tres) no aparece como cambio
    expect(since.ok && since.value.diff).not.toContain('+tres');
    // el cambio completo sigue mostrando todo
    const full = await readFileDiff(config, 'front', 'a.ts', 'committed');
    expect(full.ok && full.value.diff).toContain('+tres');
  });

  it('si no se encuentra lo que se vio, muestra el cambio completo y avisa', async () => {
    const result = await readFileDiffSince(config, 'front', 'a.ts', 'committed', `${'a'.repeat(40)}>${'b'.repeat(40)}`);
    expect(result.ok && result.value.note).toMatch(/se muestra el cambio completo/);
    expect(result.ok && result.value.diff).toContain('+tres');
  });

  it('sin commitear: sin copia de lo que se vio avisa y muestra el cambio completo', async () => {
    writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\ntres\ncuatro\ncinco\n');
    const result = await readFileDiffSince(config, 'front', 'a.ts', 'working', 'c'.repeat(40));
    expect(result.ok && result.value.note).toMatch(/No hay copia/);
    expect(result.ok && result.value.diff).toContain('+cinco');
  });
});

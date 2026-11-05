import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DevPanelConfig } from '../config.js';

const dataDir = mkdtempSync(join(tmpdir(), 'dp-review-data-'));
const projects = mkdtempSync(join(tmpdir(), 'dp-review-projects-'));
const repoDir = join(projects, 'front');
const git = (...args: string[]) => execFileSync('git', ['-C', repoDir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });

let review: typeof import('./changeReview.js');
let changes: typeof import('./ticketChanges.js');
let config: DevPanelConfig;

beforeAll(async () => {
  process.env['DEV_PANEL_DATA'] = dataDir;
  review = await import('./changeReview.js');
  changes = await import('./ticketChanges.js');
  const { defaultConfig } = await import('../config.js');
  config = defaultConfig(projects) as DevPanelConfig;
  mkdirSync(repoDir);
  git('init', '-q', '-b', 'desarrollo');
  writeFileSync(join(repoDir, 'a.ts'), 'uno\n');
  writeFileSync(join(repoDir, 'b.ts'), 'uno\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feature/1-x');
  writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\n');
  writeFileSync(join(repoDir, 'b.ts'), 'uno\ndos\n');
  git('add', '.');
  git('commit', '-q', '-m', 'propio');
});
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(projects, { recursive: true, force: true });
});

describe('changeReview', () => {
  it('guarda y quita marcas por ticket, y distingue visto / cambió / sin marcar', () => {
    const key = review.viewKey('front', 'committed', 'a.ts');
    expect(review.viewKey('front', 'working', 'a.ts')).not.toBe(key);
    review.setViewed('1-ticket', key, 'sig1');
    expect(review.getViewed('1-ticket')[key]).toBe('sig1');
    expect(review.getViewed('otro-ticket')).toEqual({});
    expect(review.viewedStateOf(review.getViewed('1-ticket'), key, 'sig1')).toBe('yes');
    expect(review.viewedStateOf(review.getViewed('1-ticket'), key, 'sig2')).toBe('changed');
    expect(review.viewedStateOf({}, key, 'sig1')).toBe('no');
    review.setViewed('1-ticket', key, null);
    expect(review.getViewed('1-ticket')).toEqual({});
  });
});

describe('archivos vistos en los cambios de la rama', () => {
  it('cada archivo trae su huella y arranca sin ver', async () => {
    const [repo] = await changes.readTicketChanges(config, ['front'], undefined, {});
    expect(repo!.committed.map((file) => [file.path, file.viewed])).toEqual([['a.ts', 'no'], ['b.ts', 'no']]);
    expect(repo!.committed.every((file) => /^[0-9a-f]{40}>[0-9a-f]{40}$/.test(file.signature))).toBe(true);
  });

  it('marcar un archivo lo deja visto; si cambia con un commit nuevo vuelve a "cambió"; el progreso lo cuenta', async () => {
    const signature = await changes.readFileSignature(config, 'front', 'a.ts', 'committed');
    expect(signature.ok).toBe(true);
    const marks = { [review.viewKey('front', 'committed', 'a.ts')]: (signature as { signature: string }).signature };

    let repos = await changes.readTicketChanges(config, ['front'], undefined, marks);
    expect(repos[0]!.committed.map((file) => file.viewed)).toEqual(['yes', 'no']);
    expect(changes.viewedProgress(repos)).toEqual({ total: 2, viewed: 1, pending: [{ repo: 'front', count: 1 }] });

    writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\ntres\n');
    git('add', '.');
    git('commit', '-q', '-m', 'otro cambio');
    repos = await changes.readTicketChanges(config, ['front'], undefined, marks);
    expect(repos[0]!.committed.map((file) => file.viewed)).toEqual(['changed', 'no']);
    expect(changes.viewedProgress(repos).viewed).toBe(0);
  });

  it('los cambios sin commitear también tienen huella (el contenido actual) y cambian al editarlos', async () => {
    writeFileSync(join(repoDir, 'b.ts'), 'uno\ndos\nlocal\n');
    writeFileSync(join(repoDir, 'nuevo.ts'), 'x\n');
    const first = (await changes.readTicketChanges(config, ['front']))[0]!.working;
    expect(first.map((file) => file.path).sort()).toEqual(['b.ts', 'nuevo.ts']);
    const before = first.find((file) => file.path === 'b.ts')!.signature;
    expect(before).toMatch(/^[0-9a-f]{40}$/);
    writeFileSync(join(repoDir, 'b.ts'), 'uno\ndos\nlocal 2\n');
    const after = (await changes.readTicketChanges(config, ['front']))[0]!.working.find((file) => file.path === 'b.ts')!.signature;
    expect(after).not.toBe(before);
  });

  it('no calcula la huella de rutas inseguras ni de archivos que no figuran en los cambios', async () => {
    expect(await changes.readFileSignature(config, 'front', '../x', 'working')).toMatchObject({ ok: false, status: 400 });
    expect(await changes.readFileSignature(config, 'front', 'inexistente.ts', 'committed')).toMatchObject({ ok: false, status: 404 });
  });
});

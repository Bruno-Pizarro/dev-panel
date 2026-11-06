import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// La carpeta de datos del panel se fija ANTES de cargar el servicio: las copias de lo visto no pueden ir a la carpeta real.
vi.hoisted(() => {
  process.env['DEV_PANEL_DATA'] = `${process.env['TMPDIR'] ?? '/tmp'}/dp-since-data-${process.pid}`;
});
const { defaultConfig } = await import('../config.js');
const { readFileDiffSince, readFileSignature, snapshotWorkingFile } = await import('./ticketChanges.js');

describe('últimos cambios de un archivo sin commitear', () => {
  const projects = mkdtempSync(join(tmpdir(), 'dp-since-w-'));
  const repoDir = join(projects, 'front');
  const git = (...args: string[]) => execFileSync('git', ['-C', repoDir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  const config = defaultConfig(projects) as never;
  mkdirSync(repoDir);
  git('init', '-q', '-b', 'desarrollo');
  writeFileSync(join(repoDir, 'a.ts'), 'uno\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feature/4-w');

  it('al marcarlo se guarda una copia y después se muestra solo lo agregado desde entonces', async () => {
    writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\n');
    const signature = await readFileSignature(config, 'front', 'a.ts', 'working');
    if (!signature.ok) throw new Error(signature.error);
    expect(snapshotWorkingFile(config, 'front', 'a.ts', signature.signature)).toBe(true);
    const same = await readFileDiffSince(config, 'front', 'a.ts', 'working', signature.signature);
    expect(same.ok && same.value.reason).toBe('Sin cambios desde que lo viste');
    writeFileSync(join(repoDir, 'a.ts'), 'uno\ndos\ntres\n');
    const since = await readFileDiffSince(config, 'front', 'a.ts', 'working', signature.signature);
    expect(since.ok && since.value.since).toBe(true);
    expect(since.ok && since.value.diff).toContain('+tres');
    expect(since.ok && since.value.diff).not.toContain('+dos');
  });

  it('rechaza guardar una copia de una ruta insegura', () => {
    expect(snapshotWorkingFile(config, 'front', '../../etc/passwd', 'd'.repeat(40))).toBe(false);
  });
});

import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DailyError, formatDraft, listDaily, localDate, parseShortstat, readDaily, sinceDate, writeDaily } from './daily.js';

const tempDir = () => mkdtempSync(join(tmpdir(), 'dev-panel-daily-'));

describe('historial de daily (5 archivos)', () => {
  it('guarda hasta 5 archivos y al agregar el sexto borra el más viejo', () => {
    const dir = tempDir();
    ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'].forEach((date) => writeDaily(dir, date, `# ${date}`));
    expect(listDaily(dir)).toHaveLength(5);

    const result = writeDaily(dir, '2026-10-27', '# nuevo');
    expect(result.deleted).toEqual(['2026-10-20']);
    expect(listDaily(dir)).toEqual(['2026-10-27', '2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21']);
    expect(existsSync(join(dir, '2026-10-20.md'))).toBe(false);
  });

  it('reescribir el daily de hoy no borra nada', () => {
    const dir = tempDir();
    ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'].forEach((date) => writeDaily(dir, date, 'x'));
    expect(writeDaily(dir, '2026-10-27', 'editado').deleted).toEqual([]);
    expect(readDaily(dir, '2026-10-27')).toBe('editado');
  });

  it('ignora archivos que no son daily y rechaza fechas inválidas o ../', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'notas.md'), 'x');
    writeDaily(dir, '2026-10-27', 'x');
    expect(listDaily(dir)).toEqual(['2026-10-27']);
    expect(() => writeDaily(dir, '../../etc/passwd', 'x')).toThrow(DailyError);
    expect(() => readDaily(dir, '2026-13-99/../x')).toThrow(DailyError);
  });

  it('un daily inexistente devuelve null y uno enorme se rechaza', () => {
    const dir = tempDir();
    expect(readDaily(dir, '2026-10-27')).toBeNull();
    expect(() => writeDaily(dir, '2026-10-27', 'x'.repeat(300 * 1024))).toThrow(/demasiado grande/);
  });
});

describe('borrador', () => {
  it('suma las estadísticas de git log --shortstat', () => {
    const text = '@@abc\tfeat: a\n\n 3 files changed, 10 insertions(+), 2 deletions(-)\n@@def\tfix: b\n\n 1 file changed, 4 insertions(+)\n';
    expect(parseShortstat(text)).toEqual({ files: 4, insertions: 14, deletions: 2 });
  });

  it('"desde": hoy, ayer o el día siguiente al último daily anterior a hoy', () => {
    const now = new Date(2026, 9, 27, 18, 30);
    expect(localDate(sinceDate('today', now, []))).toBe('2026-10-27');
    expect(localDate(sinceDate('yesterday', now, []))).toBe('2026-10-26');
    expect(localDate(sinceDate('last', now, ['2026-10-27', '2026-10-23']))).toBe('2026-10-24');
    expect(localDate(sinceDate('last', now, []))).toBe('2026-10-27');
  });

  it('arma el markdown con tickets y actividad por repo', () => {
    const markdown = formatDraft(
      '2026-10-27',
      [{ repo: 'front', branch: 'feature/x', commits: [{ hash: 'abc1234', subject: 'feat: panel' }], files: 3, insertions: 10, deletions: 2, uncommitted: 1 }],
      [{ dir: '33526-x', ticket: '33526', title: 'Pendientes de firma', estado: 'En desarrollo', rama: null, repos: [], mrs: 0, lastUpdated: 0, docs: 0, images: 0, hasMeta: true, lastTest: { fecha: null, resultado: '31/31' }, review: null }],
    );
    expect(markdown).toContain('# Daily 2026-10-27');
    expect(markdown).toContain('**#33526 Pendientes de firma** — En desarrollo · pruebas 31/31');
    const linked = formatDraft('2026-10-27', [], [{ dir: '33526-x', ticket: '33526', title: 'Pendientes de firma', estado: null, rama: null, repos: [], mrs: 0, lastUpdated: 0, docs: 0, images: 0, hasMeta: false, lastTest: null, review: null }], (t) => `https://r.example.com/issues/${t}`);
    expect(linked).toContain('**[#33526](https://r.example.com/issues/33526) Pendientes de firma**');
    expect(markdown).toContain('### front (`feature/x`)');
    expect(markdown).toContain('1 commits · 3 archivos · +10 −2');
    expect(markdown).toContain('`abc1234` feat: panel');
    expect(markdown).toContain('1 archivos sin commitear');
  });
});

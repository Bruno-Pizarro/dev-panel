import { describe, expect, it } from 'vitest';
import { parseDiffLines } from './diff';

const DIFF = ['diff --git a/a.ts b/a.ts', 'index 1..2 100644', '--- a/a.ts', '+++ b/a.ts', '@@ -10,3 +10,3 @@ fn', ' uno', '-dos', '+tres', ' cuatro', '\\ No newline at end of file', ''].join('\n');

describe('parseDiffLines', () => {
  it('descarta la cabecera técnica y numera las líneas', () => {
    expect(parseDiffLines(DIFF)).toEqual([
      { kind: 'hunk', text: '@@ -10,3 +10,3 @@ fn' },
      { kind: 'ctx', old: 10, next: 10, text: 'uno' },
      { kind: 'del', old: 11, next: null, text: 'dos' },
      { kind: 'add', old: null, next: 11, text: 'tres' },
      { kind: 'ctx', old: 12, next: 12, text: 'cuatro' },
    ]);
  });
  it('no inventa líneas con el salto final y reinicia la numeración en cada bloque', () => {
    const lines = parseDiffLines('@@ -1 +1 @@\n-a\n+b\n@@ -50,2 +50,2 @@\n x\n');
    expect(lines.filter((l) => l.kind === 'hunk')).toHaveLength(2);
    expect(lines.at(-1)).toMatchObject({ kind: 'ctx', old: 50, next: 50 });
  });
});

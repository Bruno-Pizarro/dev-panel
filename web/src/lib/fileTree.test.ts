import { describe, expect, it } from 'vitest';
import { buildFileTree, countFiles, type TreeFolder } from './fileTree';
import type { ChangedFile } from './types';

const file = (path: string): ChangedFile => ({ path, status: 'A', added: 1, deleted: 0, binary: false, untracked: false, signature: '', viewed: 'no' });

describe('árbol de archivos cambiados', () => {
  it('agrupa por carpeta, carpetas primero y todo ordenado', () => {
    const tree = buildFileTree([file('z.ts'), file('src/b.ts'), file('src/a/x.ts'), file('src/a/y.ts'), file('README.md')]);
    expect(tree.map((node) => `${node.kind}:${node.name}`)).toEqual(['folder:src', 'file:README.md', 'file:z.ts']);
    const src = tree[0] as TreeFolder;
    expect(src.children.map((node) => `${node.kind}:${node.name}`)).toEqual(['folder:a', 'file:b.ts']);
  });

  it('junta las carpetas que solo tienen una carpeta adentro', () => {
    const tree = buildFileTree([file('src/app/modules/x/a.ts'), file('src/app/modules/x/b.ts')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: 'folder', name: 'src/app/modules/x', path: 'src/app/modules/x' });
    expect(countFiles(tree[0]!)).toBe(2);
  });

  it('no junta una carpeta que además tiene archivos', () => {
    const tree = buildFileTree([file('src/a.ts'), file('src/lib/b.ts')]);
    expect(tree[0]).toMatchObject({ name: 'src' });
    expect((tree[0] as TreeFolder).children.map((node) => node.name)).toEqual(['lib', 'a.ts']);
  });

  it('sin archivos no hay árbol', () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

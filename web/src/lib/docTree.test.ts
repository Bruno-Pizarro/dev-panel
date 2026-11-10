import { describe, expect, it } from 'vitest';
import { buildDocTree, countDocs, folderPaths, foldersContaining, type DocFolder } from './docTree';

const FILES = ['README.md', 'informes/v2/b.md', 'informes/v2/a.md', 'informes/resumen.md', 'zeta.md', 'pruebas/uno/2.md', 'pruebas/uno/10.md'];

describe('árbol de documentos', () => {
  it('agrupa por carpeta, carpetas primero y todo ordenado (con números naturales)', () => {
    const tree = buildDocTree(FILES);
    expect(tree.map((node) => `${node.kind}:${node.name}`)).toEqual(['folder:informes', 'folder:pruebas/uno', 'file:README.md', 'file:zeta.md']);
    const informes = tree[0] as DocFolder;
    expect(informes.children.map((node) => `${node.kind}:${node.name}`)).toEqual(['folder:v2', 'file:resumen.md']);
    expect((tree[1] as DocFolder).children.map((node) => node.name)).toEqual(['2.md', '10.md']);
  });

  it('junta las carpetas que solo tienen una carpeta adentro y conserva la ruta completa de la última', () => {
    const tree = buildDocTree(['a/b/c/x.md', 'a/b/c/y.md']);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: 'folder', name: 'a/b/c', path: 'a/b/c' });
  });

  it('no junta una carpeta que tiene archivos propios', () => {
    const tree = buildDocTree(['a/x.md', 'a/b/y.md']);
    expect(tree[0]).toMatchObject({ name: 'a', path: 'a' });
    expect((tree[0] as DocFolder).children.map((node) => node.name)).toEqual(['b', 'x.md']);
  });

  it('cuenta documentos por carpeta y lista todas las carpetas', () => {
    const tree = buildDocTree(FILES);
    expect(countDocs(tree[0]!)).toBe(3);
    expect(folderPaths(tree)).toEqual(['informes', 'informes/v2', 'pruebas/uno']);
  });

  it('las carpetas que contienen un documento (para dejarlo visible)', () => {
    const tree = buildDocTree(FILES);
    expect(foldersContaining(tree, 'informes/v2/a.md')).toEqual(['informes', 'informes/v2']);
    expect(foldersContaining(tree, 'pruebas/uno/2.md')).toEqual(['pruebas/uno']);
    expect(foldersContaining(tree, 'README.md')).toEqual([]);
  });

  it('lista vacía o sin carpetas', () => {
    expect(buildDocTree([])).toEqual([]);
    expect(buildDocTree(['a.md', 'b.md']).map((node) => node.kind)).toEqual(['file', 'file']);
  });
});

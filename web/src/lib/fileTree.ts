import type { ChangedFile } from './types';

export interface TreeFolder {
  kind: 'folder';
  /** Nombre a mostrar; las carpetas con un solo hijo carpeta se juntan ("src/app/x"). */
  name: string;
  /** Ruta completa de la carpeta (sirve de clave). */
  path: string;
  children: TreeNode[];
}
export interface TreeLeaf {
  kind: 'file';
  name: string;
  file: ChangedFile;
}
export type TreeNode = TreeFolder | TreeLeaf;

/** Carpetas primero y después archivos, cada grupo por nombre. */
const byKind = (a: TreeNode, b: TreeNode): number => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1);

/** Junta `a` > `b` > `c` en una sola fila cuando cada carpeta solo contiene otra carpeta. */
const compact = (node: TreeNode): TreeNode => {
  if (node.kind === 'file') return node;
  let current: TreeFolder = { ...node, children: node.children.map(compact) };
  while (current.children.length === 1 && current.children[0]!.kind === 'folder') {
    const only = current.children[0] as TreeFolder;
    current = { kind: 'folder', name: `${current.name}/${only.name}`, path: only.path, children: only.children };
  }
  return current;
};

/** Árbol de carpetas de una lista de archivos cambiados (rutas relativas del repo). */
export const buildFileTree = (files: ChangedFile[]): TreeNode[] => {
  const root: TreeFolder = { kind: 'folder', name: '', path: '', children: [] };
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let folder = root;
    parts.slice(0, -1).forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      let next = folder.children.find((child): child is TreeFolder => child.kind === 'folder' && child.name === part);
      if (!next) {
        next = { kind: 'folder', name: part, path, children: [] };
        folder.children.push(next);
      }
      folder = next;
    });
    folder.children.push({ kind: 'file', name: parts[parts.length - 1] ?? file.path, file });
  }
  const sort = (node: TreeFolder): TreeFolder => ({ ...node, children: node.children.map((child) => (child.kind === 'folder' ? sort(child) : child)).sort(byKind) });
  return sort(root).children.map(compact);
};

/** Cuántos archivos hay debajo (para el contador de cada carpeta). */
export const countFiles = (node: TreeNode): number => (node.kind === 'file' ? 1 : node.children.reduce((sum, child) => sum + countFiles(child), 0));

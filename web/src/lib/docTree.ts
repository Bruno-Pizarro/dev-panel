/** Árbol de carpetas de una lista de documentos (rutas relativas a la carpeta del ticket), para el visor de Informes. */
export interface DocFolder {
  kind: 'folder';
  /** Nombre a mostrar; las carpetas con una sola carpeta adentro se juntan ("a/b/c"). */
  name: string;
  /** Ruta completa de la carpeta: sirve de clave y para recordar si está cerrada. */
  path: string;
  children: DocNode[];
}
export interface DocLeaf {
  kind: 'file';
  name: string;
  /** Ruta completa del documento. */
  path: string;
}
export type DocNode = DocFolder | DocLeaf;

/** Carpetas primero y después archivos, cada grupo por nombre. */
const byKind = (a: DocNode, b: DocNode): number => (a.kind === b.kind ? a.name.localeCompare(b.name, 'es', { numeric: true }) : a.kind === 'folder' ? -1 : 1);

const sortFolder = (folder: DocFolder): DocFolder => ({ ...folder, children: folder.children.map((child) => (child.kind === 'folder' ? sortFolder(child) : child)).sort(byKind) });

/** Junta `a` > `b` > `c` en una sola fila cuando cada carpeta solo contiene otra carpeta. */
const compact = (node: DocNode): DocNode => {
  if (node.kind === 'file') return node;
  let current: DocFolder = { ...node, children: node.children.map(compact) };
  while (current.children.length === 1 && current.children[0]!.kind === 'folder') {
    const only = current.children[0] as DocFolder;
    current = { kind: 'folder', name: `${current.name}/${only.name}`, path: only.path, children: only.children };
  }
  return current;
};

export const buildDocTree = (files: string[]): DocNode[] => {
  const root: DocFolder = { kind: 'folder', name: '', path: '', children: [] };
  for (const file of files) {
    const parts = file.split('/').filter(Boolean);
    if (!parts.length) continue;
    let folder = root;
    parts.slice(0, -1).forEach((part, index) => {
      let next = folder.children.find((child): child is DocFolder => child.kind === 'folder' && child.name === part);
      if (!next) {
        next = { kind: 'folder', name: part, path: parts.slice(0, index + 1).join('/'), children: [] };
        folder.children.push(next);
      }
      folder = next;
    });
    folder.children.push({ kind: 'file', name: parts[parts.length - 1]!, path: file });
  }
  return sortFolder(root).children.map(compact);
};

/** Cuántos documentos hay debajo (contador de cada carpeta). */
export const countDocs = (node: DocNode): number => (node.kind === 'file' ? 1 : node.children.reduce((sum, child) => sum + countDocs(child), 0));

/** Rutas de todas las carpetas del árbol (para «colapsar todo»). */
export const folderPaths = (nodes: DocNode[]): string[] => nodes.flatMap((node) => (node.kind === 'folder' ? [node.path, ...folderPaths(node.children)] : []));

/** Carpetas que contienen el documento (para dejarlo siempre visible). */
export const foldersContaining = (nodes: DocNode[], file: string): string[] =>
  nodes.flatMap((node) => (node.kind === 'folder' && file.startsWith(`${node.path}/`) ? [node.path, ...foldersContaining(node.children, file)] : []));

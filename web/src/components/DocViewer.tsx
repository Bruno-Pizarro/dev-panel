import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, FileText, Folder } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { buildDocTree, countDocs, folderPaths, foldersContaining, type DocNode } from '../lib/docTree';
import { useReloadOn, useStoredState } from '../lib/hooks';
import { fileUrl } from '../lib/tickets';
import { withParam } from '../lib/urlState';
import { useAsync } from '../lib/useAsync';
import { Markdown } from './Markdown';
import { Skeleton } from './Skeleton';

const Reader = ({ dir, file, refreshKey }: { dir: string; file: string; refreshKey: number }) => {
  const doc = useAsync(() => api.get<{ content: string }>(fileUrl(dir, file)));
  useReloadOn(refreshKey, doc.reload);
  if (doc.loading && !doc.data) return <Skeleton className="h-64" />;
  if (doc.error || !doc.data) return <p className="text-danger">No se pudo leer el documento: {doc.error}</p>;
  return <Markdown source={doc.data.content} ticket={{ dir, file }} />;
};

/** Ancho de la flecha de una carpeta (size-3.5 = 14 px) más el gap-1.5 (6 px). */
const CHEVRON_SPACE = 20;

interface NodesProps {
  nodes: DocNode[];
  depth: number;
  closed: Set<string>;
  selected: string | null;
  onToggle: (path: string) => void;
  onPick: (file: string) => void;
}

/** Carpetas que se abren y se cierran, y documentos que se eligen para leer. */
const Nodes = ({ nodes, depth, closed, selected, onToggle, onPick }: NodesProps) => (
  <ul>
    {nodes.map((node) => {
      // Los documentos no tienen flecha: se corren lo que ocupa para que su icono quede bajo el de la carpeta.
      const pad = { paddingLeft: `${depth * 14 + 8 + (node.kind === 'file' ? CHEVRON_SPACE : 0)}px` };
      if (node.kind === 'folder') {
        const shut = closed.has(node.path);
        return (
          <li key={`d:${node.path}`}>
            <button type="button" onClick={() => onToggle(node.path)} aria-expanded={!shut} style={pad} title={node.path} className="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-3 text-left text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg">
              {shut ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : <ChevronDown className="size-3.5 shrink-0" aria-hidden />}
              <Folder className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 break-all font-medium">{node.name}</span>
              <span className="text-sm">{countDocs(node)}</span>
            </button>
            {!shut && <Nodes nodes={node.children} depth={depth + 1} closed={closed} selected={selected} onToggle={onToggle} onPick={onPick} />}
          </li>
        );
      }
      return (
        <li key={`f:${node.path}`}>
          <button type="button" onClick={() => onPick(node.path)} style={pad} title={node.path} className={cn('flex w-full items-start gap-1.5 rounded-lg py-1.5 pr-3 text-left text-sm transition-colors', selected === node.path ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
            <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="break-all">{node.name}</span>
          </button>
        </li>
      );
    })}
  </ul>
);

/**
 * Árbol de documentos MD a la izquierda y lector a la derecha. Las carpetas arrancan abiertas, se abren y cierran una a una o todas
 * juntas desde el botón de arriba, y el panel recuerda cuáles dejaste cerradas en cada ticket (`localStorage`).
 */
export const DocViewer = ({ dir, files, initial, refreshKey = 0 }: { dir: string; files: string[]; initial?: string | null; refreshKey?: number }) => {
  // El documento abierto va en la URL (?doc=): al recargar o compartir el enlace se abre el mismo. Sin pedido (o uno que ya no existe), el de por defecto.
  const [params, setParams] = useSearchParams();
  const defaultFile = initial && files.includes(initial) ? initial : (files[0] ?? null);
  const requested = params.get('doc');
  const selected = requested && files.includes(requested) ? requested : defaultFile;
  const setSelected = (file: string) => setParams((previous) => withParam(previous, 'doc', file === defaultFile ? null : file), { replace: true });
  const [closedList, setClosedList] = useStoredState<string[]>(`dev-panel.docs-closed.${dir}`, []);
  // La lista puede llegar como un arreglo nuevo en cada render: el árbol se rearma solo si cambian los documentos.
  const filesKey = files.join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tree = useMemo(() => buildDocTree(files), [filesKey]);
  const allFolders = useMemo(() => folderPaths(tree), [tree]);
  const closed = useMemo(() => new Set(closedList), [closedList]);
  const anyOpen = allFolders.some((path) => !closed.has(path));

  // El documento elegido siempre queda a la vista: si el panel recordaba cerrada una carpeta que lo contiene, se abre.
  useEffect(() => {
    if (!selected) return;
    const parents = foldersContaining(tree, selected);
    if (parents.some((path) => closed.has(path))) setClosedList(closedList.filter((path) => !parents.includes(path)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tree]);

  if (!files.length) return <p className="text-muted">Esta carpeta no tiene documentos Markdown.</p>;
  const toggle = (path: string) => setClosedList(closed.has(path) ? closedList.filter((item) => item !== path) : [...closedList, path]);
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="self-start rounded-2xl border border-line bg-surface p-2">
        {allFolders.length > 0 && (
          <div className="mb-1 flex items-center justify-between gap-2 border-b border-line px-2 pb-2">
            <span className="text-sm text-muted">{files.length} documentos</span>
            <button type="button" onClick={() => setClosedList(anyOpen ? allFolders : [])} title={anyOpen ? 'Cerrar todas las carpetas' : 'Abrir todas las carpetas'} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg" data-testid="docs-toggle-all">
              {anyOpen ? <ChevronsDownUp className="size-4" aria-hidden /> : <ChevronsUpDown className="size-4" aria-hidden />}
              {anyOpen ? 'Colapsar todo' : 'Expandir todo'}
            </button>
          </div>
        )}
        <Nodes nodes={tree} depth={0} closed={closed} selected={selected} onToggle={toggle} onPick={setSelected} />
      </div>
      <article className="min-w-0 rounded-2xl border border-line bg-surface p-6">{selected && <Reader key={selected} dir={dir} file={selected} refreshKey={refreshKey} />}</article>
    </div>
  );
};

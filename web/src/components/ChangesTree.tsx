import { Check, ChevronDown, ChevronRight, File, Folder, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildFileTree, countFiles, type TreeNode } from '../lib/fileTree';
import { cn } from '../lib/cn';
import type { ChangedFile, RepoChanges, ViewedState } from '../lib/types';

export type TreeScope = 'committed' | 'working';
interface Props {
  repos: RepoChanges[];
  current: string | null;
  keyOf: (repo: string, scope: TreeScope, path: string) => string;
  stateOf: (repo: string, scope: TreeScope, file: ChangedFile) => ViewedState;
  onPick: (key: string) => void;
  open: boolean;
  onToggle: () => void;
}

/** Ancho de la flecha de una carpeta (size-3.5 = 14 px) más el gap-1.5 (6 px). */
const CHEVRON_SPACE = 20;

const statusTone = (status: string): string => (status === 'A' || status === 'nuevo' ? 'text-success' : status === 'D' ? 'text-danger' : 'text-info');

/** Árbol de carpetas de los archivos de un repo (commiteados o sin commitear); las carpetas se abren y cierran. */
const Nodes = ({ nodes, repo, scope, depth, props, shut, toggle }: { nodes: TreeNode[]; repo: string; scope: TreeScope; depth: number; props: Props; shut: Set<string>; toggle: (id: string) => void }) => (
  <ul>
    {nodes.map((node) => {
      // Los archivos no tienen flecha: se corren lo que ocupa (icono + separación) para que su icono quede bajo el de la carpeta.
      const pad = { paddingLeft: `${depth * 12 + 6 + (node.kind === 'file' ? CHEVRON_SPACE : 0)}px` };
      if (node.kind === 'folder') {
        const id = `${repo}|${scope}|${node.path}`;
        const closed = shut.has(id);
        return (
          <li key={id}>
            <button type="button" onClick={() => toggle(id)} aria-expanded={!closed} style={pad} className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg">
              {closed ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : <ChevronDown className="size-3.5 shrink-0" aria-hidden />}
              <Folder className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono" title={node.path}>{node.name}</span>
              <span className="text-sm">{countFiles(node)}</span>
            </button>
            {!closed && <Nodes nodes={node.children} repo={repo} scope={scope} depth={depth + 1} props={props} shut={shut} toggle={toggle} />}
          </li>
        );
      }
      const key = props.keyOf(repo, scope, node.file.path);
      const viewed = props.stateOf(repo, scope, node.file);
      return (
        <li key={key}>
          <button type="button" onClick={() => props.onPick(key)} style={pad} title={node.file.path} className={cn('flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm hover:bg-surface-2', props.current === key && 'bg-accent/15 text-fg')}>
            <File className="size-3.5 shrink-0 text-muted" aria-hidden />
            <span className={cn('min-w-0 flex-1 truncate font-mono', viewed === 'yes' && 'text-muted line-through decoration-muted/50')}>{node.name}</span>
            <span className={cn('font-mono text-sm font-semibold', statusTone(node.file.status))}>{node.file.status === 'nuevo' ? 'A' : node.file.status}</span>
            {viewed === 'yes' ? <Check className="size-3.5 shrink-0 text-success" aria-label="Visto" /> : viewed === 'changed' ? <span className="size-2 shrink-0 rounded-full bg-warning" title="Cambió desde que lo viste" /> : null}
          </button>
        </li>
      );
    })}
  </ul>
);

/** Panel lateral contraíble con el árbol de los archivos cambiados de cada repo; al elegir uno, la lista salta a su diff. */
export const ChangesTree = (props: Props) => {
  const [shut, setShut] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setShut((previous) => { const next = new Set(previous); if (!next.delete(id)) next.add(id); return next; });
  const trees = useMemo(() => props.repos.map((repo) => ({ repo: repo.repo, committed: buildFileTree(repo.committed), working: buildFileTree(repo.working), total: repo.committed.length + repo.working.length })), [props.repos]);

  if (!props.open) {
    return (
      <button type="button" onClick={props.onToggle} aria-label="Mostrar el árbol de archivos" title="Mostrar el árbol de archivos" className="sticky top-4 flex size-10 shrink-0 items-center justify-center self-start rounded-lg border border-line bg-surface text-muted hover:bg-surface-2 hover:text-fg">
        <PanelLeftOpen className="size-5" aria-hidden />
      </button>
    );
  }
  return (
    <aside aria-label="Árbol de archivos" className="sticky top-4 max-h-[calc(100vh-2rem)] w-72 shrink-0 self-start overflow-y-auto rounded-2xl border border-line bg-surface">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2.5">
        <span className="text-sm font-semibold">Archivos</span>
        <button type="button" onClick={props.onToggle} aria-label="Ocultar el árbol de archivos" title="Ocultar el árbol de archivos" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><PanelLeftClose className="size-4" aria-hidden /></button>
      </div>
      <div className="space-y-3 p-2">
        {trees.map((entry) => {
          const id = `${entry.repo}|repo`;
          const closed = shut.has(id);
          return (
            <section key={entry.repo}>
              <button type="button" onClick={() => toggle(id)} aria-expanded={!closed} className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm font-semibold hover:bg-surface-2">
                {closed ? <ChevronRight className="size-4 shrink-0" aria-hidden /> : <ChevronDown className="size-4 shrink-0" aria-hidden />}
                <span className="min-w-0 flex-1 truncate font-mono">{entry.repo}</span>
                <span className="text-sm text-muted">{entry.total}</span>
              </button>
              {!closed && (
                <div>
                  {entry.total === 0 && <p className="px-3 py-1 text-sm text-muted">Sin cambios</p>}
                  {entry.committed.length > 0 && <Nodes nodes={entry.committed} repo={entry.repo} scope="committed" depth={0} props={props} shut={shut} toggle={toggle} />}
                  {entry.working.length > 0 && (
                    <>
                      <p className="mt-2 px-2 text-sm font-medium text-warning">Sin commitear</p>
                      <Nodes nodes={entry.working} repo={entry.repo} scope="working" depth={0} props={props} shut={shut} toggle={toggle} />
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
};

import { ChevronDown, ChevronRight, GitCompare } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useReloadOn } from '../lib/hooks';
import type { ChangedFile, FileDiff, RepoChanges, TicketChangesReport } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

type Scope = 'committed' | 'working';

const lineClass = (line: string) =>
  line.startsWith('+') && !line.startsWith('+++')
    ? 'bg-success/15 text-success'
    : line.startsWith('-') && !line.startsWith('---')
      ? 'bg-danger/15 text-danger'
      : line.startsWith('@@')
        ? 'bg-info/10 text-info'
        : 'text-muted';

/** Se monta recién al abrir el archivo: `useAsync` carga una sola vez al montar, así el diff se pide en ese momento. */
const DiffView = ({ dir, repo, path, scope }: { dir: string; repo: string; path: string; scope: Scope }) => {
  const diff = useAsync(() => api.get<FileDiff>(`/api/tickets/${encodeURIComponent(dir)}/changes/diff?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&scope=${scope}`));
  return (
    <div className="mb-3 overflow-x-auto rounded-lg border border-line bg-bg">
      {diff.loading && !diff.data ? <Skeleton className="h-20" /> : diff.error || !diff.data ? <p className="p-3 text-danger">{diff.error}</p> : diff.data.reason ? <p className="p-3 text-sm text-muted">{diff.data.reason}</p> : !diff.data.diff ? <p className="p-3 text-sm text-muted">Sin diferencias de contenido.</p> : (
        <pre className="min-w-max font-mono text-sm leading-6">
          {diff.data.diff.split('\n').map((line, index) => <div key={index} className={cn('whitespace-pre px-3', lineClass(line))}>{line || ' '}</div>)}
        </pre>
      )}
    </div>
  );
};

const FileRow = ({ dir, repo, file, scope }: { dir: string; repo: string; file: ChangedFile; scope: Scope }) => {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface-2">
        {open ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
        <Badge tone={file.status === 'A' || file.status === 'nuevo' ? 'success' : file.status === 'D' ? 'danger' : 'info'}>{file.status}</Badge>
        <span className="min-w-0 flex-1 break-all font-mono text-sm">{file.path}</span>
        {file.binary ? <span className="text-sm text-muted">binario</span> : file.added !== null && <span className="whitespace-nowrap font-mono text-sm"><span className="text-success">+{file.added}</span> <span className="text-danger">-{file.deleted}</span></span>}
      </button>
      {open && <DiffView dir={dir} repo={repo} path={file.path} scope={scope} />}
    </li>
  );
};

const FileList = ({ dir, repo, files, scope, empty }: { dir: string; repo: string; files: ChangedFile[]; scope: Scope; empty: string }) =>
  files.length === 0 ? <p className="text-sm text-muted">{empty}</p> : <ul className="divide-y divide-line">{files.map((file) => <FileRow key={`${scope}:${file.path}`} dir={dir} repo={repo} file={file} scope={scope} />)}</ul>;

const totals = (files: ChangedFile[]) => files.reduce((sum, file) => ({ added: sum.added + (file.added ?? 0), deleted: sum.deleted + (file.deleted ?? 0) }), { added: 0, deleted: 0 });

const Repo = ({ dir, changes, baseBranch }: { dir: string; changes: RepoChanges; baseBranch: string }) => {
  const [open, setOpen] = useState(true);
  const sum = totals(changes.committed);
  const none = changes.committed.length === 0 && changes.working.length === 0 && changes.commits.length === 0;
  return (
    <Card
      title={<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2">{open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}<span className="font-mono">{changes.repo}</span></button>}
      action={<div className="flex flex-wrap items-center justify-end gap-2">{changes.branch && <Badge>{changes.branch}</Badge>}<Badge tone={changes.committed.length ? 'accent' : 'neutral'}>{changes.committed.length} archivos · +{sum.added} -{sum.deleted}</Badge>{changes.working.length > 0 && <Badge tone="warning">{changes.working.length} sin commitear</Badge>}</div>}
    >
      {open && (!changes.exists ? <p className="text-danger">El repo no existe en esta máquina</p> : (
        <div className="space-y-6">
          {changes.base === null && <p className="text-sm text-warning">No se encontró la rama base {baseBranch}: solo se muestran los cambios sin commitear.</p>}
          {none && <p className="text-sm text-muted">Sin cambios respecto de {changes.base ?? baseBranch}.</p>}
          {changes.commits.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Commits ({changes.commits.length})</h3>
              <ul className="divide-y divide-line">
                {changes.commits.map((commit) => (
                  <li key={commit.hash} className="flex flex-wrap items-baseline gap-x-3 py-2"><span className="font-mono text-sm text-accent">{commit.hash}</span><span className="min-w-0 flex-1">{commit.subject}</span><span className="text-sm text-muted">{commit.author} · {commit.when}</span></li>
                ))}
              </ul>
            </div>
          )}
          {changes.committed.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">Commiteado contra {changes.base} ({changes.committed.length})</h3><FileList dir={dir} repo={changes.repo} files={changes.committed} scope="committed" empty="" /></div>}
          {changes.working.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">Sin commitear ({changes.working.length})</h3><FileList dir={dir} repo={changes.repo} files={changes.working} scope="working" empty="" /></div>}
          {changes.ignored.length > 0 && <p className="text-sm text-muted">No se cuentan: {changes.ignored.join(', ')} (lo administra el panel por el perfil de entorno).</p>}
        </div>
      ))}
    </Card>
  );
};

/** Cambios de la rama del ticket al estilo de un MR: commits, archivos con +/- y diff por archivo, commiteado y sin commitear. */
export const TicketChanges = ({ dir, refreshKey }: { dir: string; refreshKey: number }) => {
  const state = useAsync(() => api.get<TicketChangesReport>(`/api/tickets/${encodeURIComponent(dir)}/changes`));
  useReloadOn(refreshKey, state.reload);
  if (state.loading && !state.data) return <Skeleton className="h-64" />;
  if (state.error || !state.data) return <p className="text-danger">{state.error}</p>;
  if (state.data.repos.length === 0) return <EmptyState icon={<GitCompare className="size-6" />} title="Sin repos">El ticket.json no declara repos: no hay de dónde leer los cambios.</EmptyState>;
  return <div className="space-y-6">{state.data.repos.map((repo) => <Repo key={repo.repo} dir={dir} changes={repo} baseBranch={state.data!.baseBranch} />)}</div>;
};

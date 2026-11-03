import { ChevronDown, ChevronRight, GitCompare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useReloadOn } from '../lib/hooks';
import type { ChangedFile, FileDiff, RepoChanges, TicketChangesReport } from '../lib/types';
import { parseDiffLines } from '../lib/diff';
import { languageOf, tokenizeLine } from '../lib/highlight';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

type Scope = 'committed' | 'working';

/** Se monta recién al abrir el archivo: `useAsync` carga una sola vez al montar, así el diff se pide en ese momento. */
const DiffView = ({ dir, repo, path, scope }: { dir: string; repo: string; path: string; scope: Scope }) => {
  const diff = useAsync(() => api.get<FileDiff>(`/api/tickets/${encodeURIComponent(dir)}/changes/diff?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&scope=${scope}`));
  const slash = path.lastIndexOf('/');
  const language = languageOf(path);
  const lines = useMemo(() => (diff.data?.diff ? parseDiffLines(diff.data.diff) : []), [diff.data]);
  return (
    <div className="editor mb-3">
      <div className="editor-bar">
        <span className="min-w-0 truncate"><span>{slash >= 0 ? path.slice(0, slash + 1) : ''}</span><span className="font-semibold" style={{ color: 'var(--ed-fg)' }}>{path.slice(slash + 1)}</span></span>
      </div>
      {diff.loading && !diff.data ? <Skeleton className="m-3 h-20" /> : diff.error || !diff.data ? <p className="editor-note" style={{ color: 'rgb(var(--danger))' }}>{diff.error}</p> : diff.data.reason ? <p className="editor-note">{diff.data.reason}</p> : lines.length === 0 ? <p className="editor-note">Sin diferencias de contenido.</p> : (
        <div className="editor-code">
          {lines.map((line, index) =>
            line.kind === 'hunk' ? (
              <div key={index} className="editor-hunk">{line.text}</div>
            ) : (
              <div key={index} className={cn('editor-row', line.kind !== 'ctx' && line.kind)}>
                <span className="editor-num">{line.old ?? ''}</span>
                <span className="editor-num">{line.next ?? ''}</span>
                <span className="editor-sign">{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ''}</span>
                <span>{line.text ? tokenizeLine(line.text, language).map((token, position) => <span key={position} className={token.cls ? `tok-${token.cls}` : undefined}>{token.text}</span>) : ' '}</span>
              </div>
            )
          )}
        </div>
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
    <section className="rounded-2xl border border-line bg-surface">
      {/* Toda la barra abre y cierra el repo, no solo el nombre. */}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={cn('flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-2', open ? 'rounded-t-2xl border-b border-line' : 'rounded-2xl')}>
        <span className="flex items-center gap-2 text-base font-semibold">{open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}<span className="font-mono">{changes.repo}</span></span>
        <span className="flex flex-wrap items-center justify-end gap-2">{changes.branch && <Badge>{changes.branch}</Badge>}<Badge tone={changes.committed.length ? 'accent' : 'neutral'}>{changes.committed.length} archivos · +{sum.added} -{sum.deleted}</Badge>{changes.working.length > 0 && <Badge tone="warning">{changes.working.length} sin commitear</Badge>}</span>
      </button>
      {open && (!changes.exists ? <p className="p-5 text-danger">El repo no existe en esta máquina</p> : (
        <div className="space-y-6 p-5">
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
    </section>
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

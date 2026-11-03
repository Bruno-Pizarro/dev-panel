import { Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, GitCompare } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useReloadOn } from '../lib/hooks';
import type { ChangedFile, FileDiff, RepoChanges, TicketChangesReport, ViewedState } from '../lib/types';
import { parseDiffLines } from '../lib/diff';
import { languageOf, tokenizeLine } from '../lib/highlight';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Button } from './Button';
import { useToast } from './Toast';
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

/** Estado de "visto" que comparten todos los archivos: la marca se guarda en el servidor y la pantalla la refleja al instante. */
interface Review {
  dir: string;
  stateOf: (repo: string, scope: Scope, file: ChangedFile) => ViewedState;
  toggle: (repo: string, scope: Scope, file: ChangedFile, viewed: boolean) => Promise<boolean>;
  /** Cada "Expandir todo" o "Contraer todo" suma uno y trae el valor al que se llevan todos los archivos. */
  bulk: { open: boolean; tick: number };
}
const ReviewContext = createContext<Review | null>(null);
const useReview = (): Review => {
  const review = useContext(ReviewContext);
  if (!review) throw new Error('ReviewContext');
  return review;
};

const markKey = (repo: string, scope: Scope, path: string) => `${repo}|${scope}|${path}`;

/** Verdadero cuando el elemento se acercó a la pantalla (una vez que se vio, queda así): los diffs se piden recién entonces. */
const useNearViewport = () => {
  const ref = useRef<HTMLLIElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setNear(true), { rootMargin: '600px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  return { ref, near };
};

/** Un archivo como en GitLab o GitHub: encabezado con "Visto" y el diff expandido debajo (al marcarlo como visto se contrae). */
const FileSection = ({ repo, file, scope }: { repo: string; file: ChangedFile; scope: Scope }) => {
  const review = useReview();
  const viewed = review.stateOf(repo, scope, file);
  const [open, setOpen] = useState(viewed !== 'yes');
  const [busy, setBusy] = useState(false);
  const { ref, near } = useNearViewport();
  const lastTick = useRef(review.bulk.tick);
  useEffect(() => {
    if (review.bulk.tick !== lastTick.current) {
      lastTick.current = review.bulk.tick;
      setOpen(review.bulk.open);
    }
  }, [review.bulk]);

  const toggleViewed = async (next: boolean) => {
    setBusy(true);
    const ok = await review.toggle(repo, scope, file, next);
    setBusy(false);
    if (ok) setOpen(!next);
  };

  return (
    <li ref={ref} id={`file-${repo}-${scope}-${file.path}`} className={cn('rounded-xl border bg-surface', viewed === 'yes' ? 'border-success/40' : viewed === 'changed' ? 'border-warning/60' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {open ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
          <Badge tone={file.status === 'A' || file.status === 'nuevo' ? 'success' : file.status === 'D' ? 'danger' : 'info'}>{file.status}</Badge>
          <span className="min-w-0 flex-1 break-all font-mono text-sm">{file.path}</span>
          {file.binary ? <span className="text-sm text-muted">binario</span> : file.added !== null && <span className="whitespace-nowrap font-mono text-sm"><span className="text-success">+{file.added}</span> <span className="text-danger">-{file.deleted}</span></span>}
        </button>
        {viewed === 'changed' && <Badge tone="warning">Cambió desde que lo viste</Badge>}
        <label className={cn('flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors', viewed === 'yes' ? 'border-success/50 bg-success/10 text-success' : 'border-line text-muted hover:text-fg', busy && 'opacity-60')}>
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={viewed === 'yes'} disabled={busy} onChange={(event) => void toggleViewed(event.target.checked)} />
          {viewed === 'yes' && <Check className="size-4" aria-hidden />}
          Visto
        </label>
      </div>
      {open && <div className="px-3 pb-3">{near ? <DiffView dir={review.dir} repo={repo} path={file.path} scope={scope} /> : <Skeleton className="h-24" />}</div>}
    </li>
  );
};

const FileList = ({ repo, files, scope }: { repo: string; files: ChangedFile[]; scope: Scope }) => <ul className="space-y-3">{files.map((file) => <FileSection key={`${scope}:${file.path}`} repo={repo} file={file} scope={scope} />)}</ul>;

const totals = (files: ChangedFile[]) => files.reduce((sum, file) => ({ added: sum.added + (file.added ?? 0), deleted: sum.deleted + (file.deleted ?? 0) }), { added: 0, deleted: 0 });

const Repo = ({ changes, baseBranch }: { changes: RepoChanges; baseBranch: string }) => {
  const review = useReview();
  const [open, setOpen] = useState(true);
  const sum = totals(changes.committed);
  const files = [...changes.committed.map((file) => ({ file, scope: 'committed' as Scope })), ...changes.working.map((file) => ({ file, scope: 'working' as Scope }))];
  const seen = files.filter(({ file, scope }) => review.stateOf(changes.repo, scope, file) === 'yes').length;
  const none = changes.committed.length === 0 && changes.working.length === 0 && changes.commits.length === 0;
  return (
    <section className="rounded-2xl border border-line bg-surface">
      {/* Toda la barra abre y cierra el repo, no solo el nombre. */}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={cn('flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-2', open ? 'rounded-t-2xl border-b border-line' : 'rounded-2xl')}>
        <span className="flex items-center gap-2 text-base font-semibold">{open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}<span className="font-mono">{changes.repo}</span></span>
        <span className="flex flex-wrap items-center justify-end gap-2">
          {changes.branch && <Badge>{changes.branch}</Badge>}
          <Badge tone={changes.committed.length ? 'accent' : 'neutral'}>{changes.committed.length} archivos · +{sum.added} -{sum.deleted}</Badge>
          {changes.working.length > 0 && <Badge tone="warning">{changes.working.length} sin commitear</Badge>}
          {files.length > 0 && <Badge tone={seen === files.length ? 'success' : 'warning'}>{seen}/{files.length} vistos</Badge>}
        </span>
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
          {changes.committed.length > 0 && <div><h3 className="mb-3 text-sm font-semibold">Commiteado contra {changes.base} ({changes.committed.length})</h3><FileList repo={changes.repo} files={changes.committed} scope="committed" /></div>}
          {changes.working.length > 0 && <div><h3 className="mb-3 text-sm font-semibold">Sin commitear ({changes.working.length})</h3><FileList repo={changes.repo} files={changes.working} scope="working" /></div>}
          {changes.ignored.length > 0 && <p className="text-sm text-muted">No se cuentan: {changes.ignored.join(', ')} (lo administra el panel por el perfil de entorno).</p>}
        </div>
      ))}
    </section>
  );
};

/**
 * Cambios de la rama del ticket al estilo de un MR: por repo, los commits y cada archivo con su diff expandido y una casilla
 * "Visto". Marcar todos los archivos es obligatorio para el chequeo "Cambios revisados" del Estado del ticket.
 */
export const TicketChanges = ({ dir, refreshKey }: { dir: string; refreshKey: number }) => {
  const toast = useToast();
  const state = useAsync(() => api.get<TicketChangesReport>(`/api/tickets/${encodeURIComponent(dir)}/changes`));
  useReloadOn(refreshKey, state.reload);
  // Lo marcado en esta pantalla se refleja al instante; al volver a leer del servidor, manda lo que él guardó.
  const [marks, setMarks] = useState<Record<string, ViewedState>>({});
  useEffect(() => setMarks({}), [state.data]);
  const [bulk, setBulk] = useState({ open: true, tick: 0 });

  const stateOf = useCallback((repo: string, scope: Scope, file: ChangedFile): ViewedState => marks[markKey(repo, scope, file.path)] ?? file.viewed, [marks]);
  const toggle = useCallback(
    async (repo: string, scope: Scope, file: ChangedFile, viewed: boolean) => {
      try {
        await api.put(`/api/tickets/${encodeURIComponent(dir)}/changes/viewed`, { repo, path: file.path, scope, viewed });
        setMarks((current) => ({ ...current, [markKey(repo, scope, file.path)]: viewed ? 'yes' : 'no' }));
        return true;
      } catch (error) {
        toast('error', (error as Error).message);
        return false;
      }
    },
    [dir, toast],
  );
  const review = useMemo<Review>(() => ({ dir, stateOf, toggle, bulk }), [dir, stateOf, toggle, bulk]);

  if (state.loading && !state.data) return <Skeleton className="h-64" />;
  if (state.error || !state.data) return <p className="text-danger">{state.error}</p>;
  const report = state.data;
  if (report.repos.length === 0) return <EmptyState icon={<GitCompare className="size-6" />} title="Sin repos">El ticket.json no declara repos: no hay de dónde leer los cambios.</EmptyState>;

  const all = report.repos.flatMap((repo) => [...repo.committed.map((file) => stateOf(repo.repo, 'committed', file)), ...repo.working.map((file) => stateOf(repo.repo, 'working', file))]);
  const seen = all.filter((value) => value === 'yes').length;
  return (
    <ReviewContext.Provider value={review}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-3.5">
          <div className="min-w-48 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm font-medium"><span>Archivos vistos</span><span className={seen === all.length ? 'text-success' : 'text-warning'}>{seen}/{all.length}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className={cn('h-full rounded-full transition-all', seen === all.length ? 'bg-success' : 'bg-accent')} style={{ width: `${all.length ? Math.round((seen / all.length) * 100) : 0}%` }} /></div>
            <p className="mt-1.5 text-sm text-muted">Leé cada archivo y marcalo como visto: el Estado del ticket no da el visto bueno hasta que estén todos.</p>
          </div>
          <Button icon={<ChevronsUpDown className="size-4" />} onClick={() => setBulk({ open: true, tick: bulk.tick + 1 })}>Expandir todo</Button>
          <Button icon={<ChevronsDownUp className="size-4" />} onClick={() => setBulk({ open: false, tick: bulk.tick + 1 })}>Contraer todo</Button>
        </div>
        {report.repos.map((repo) => <Repo key={repo.repo} changes={repo} baseBranch={report.baseBranch} />)}
      </div>
    </ReviewContext.Provider>
  );
};

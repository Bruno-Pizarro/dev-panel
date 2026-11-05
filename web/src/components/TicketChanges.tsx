import { Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, GitCompare } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useReloadOn, useStoredState } from '../lib/hooks';
import type { ChangedFile, FileDiff, RepoChanges, TicketChangesReport, ViewedState } from '../lib/types';
import { parseDiffLines } from '../lib/diff';
import { languageOf, tokenizeLine } from '../lib/highlight';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { ChangesTree } from './ChangesTree';
import { Button } from './Button';
import { Chip } from './Chip';
import { ShortcutKey } from './Key';
import { useShortcutMap } from '../lib/useShortcuts';
import { useToast } from './Toast';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

type Scope = 'committed' | 'working';
/** De dónde salen los cambios: la copia local de los repos (`changes`) o los MRs de GitLab (`mr-changes`). */
type Segment = 'changes' | 'mr-changes';

/** Se monta recién al abrir el archivo: `useAsync` carga una sola vez al montar, así el diff se pide en ese momento. */
const DiffView = ({ dir, segment, repo, path, scope }: { dir: string; segment: Segment; repo: string; path: string; scope: Scope }) => {
  const diff = useAsync(() => api.get<FileDiff>(`/api/tickets/${encodeURIComponent(dir)}/${segment}/diff?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&scope=${scope}`));
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
  segment: Segment;
  stateOf: (repo: string, scope: Scope, file: ChangedFile) => ViewedState;
  toggle: (repo: string, scope: Scope, file: ChangedFile, viewed: boolean) => Promise<boolean>;
  /** El archivo en el que está parado el teclado (N / P / V): `repo|scope|ruta`. */
  current: string | null;
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
  const isCurrent = review.current === markKey(repo, scope, file.path);
  // Marcar como visto (con el mouse o con V) contrae el archivo; desmarcarlo lo vuelve a abrir.
  const previous = useRef(viewed);
  useEffect(() => {
    if (previous.current !== viewed && (viewed === 'yes' || previous.current === 'yes')) setOpen(viewed !== 'yes');
    previous.current = viewed;
  }, [viewed]);
  // El archivo elegido con N / P se acerca a la pantalla.
  useEffect(() => {
    if (isCurrent) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [isCurrent, ref]);
  const lastTick = useRef(review.bulk.tick);
  useEffect(() => {
    if (review.bulk.tick !== lastTick.current) {
      lastTick.current = review.bulk.tick;
      setOpen(review.bulk.open);
    }
  }, [review.bulk]);

  const toggleViewed = async (next: boolean) => {
    setBusy(true);
    await review.toggle(repo, scope, file, next);
    setBusy(false);
  };

  return (
    <li ref={ref} id={`file-${repo}-${scope}-${file.path}`} className={cn('scroll-mt-4 rounded-xl border bg-surface', isCurrent && 'ring-2 ring-accent/60', viewed === 'yes' ? 'border-success/40' : viewed === 'changed' ? 'border-warning/60' : 'border-line')}>
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
          {isCurrent && <ShortcutKey id="changes.viewed" />}
        </label>
      </div>
      {open && <div className="px-3 pb-3">{near ? <DiffView dir={review.dir} segment={review.segment} repo={repo} path={file.path} scope={scope} /> : <Skeleton className="h-24" />}</div>}
    </li>
  );
};

const FileList = ({ repo, files, scope }: { repo: string; files: ChangedFile[]; scope: Scope }) => <ul className="space-y-3">{files.map((file) => <FileSection key={`${scope}:${file.path}`} repo={repo} file={file} scope={scope} />)}</ul>;

const totals = (files: ChangedFile[]) => files.reduce((sum, file) => ({ added: sum.added + (file.added ?? 0), deleted: sum.deleted + (file.deleted ?? 0) }), { added: 0, deleted: 0 });

const Repo = ({ changes, baseBranch }: { changes: RepoChanges; baseBranch: string }) => {
  const review = useReview();
  const [open, setOpen] = useState(true);
  // Si el teclado (N / P) llega a un archivo de un repo contraído, se abre.
  const currentFile = review.current;
  useEffect(() => {
    if (currentFile?.startsWith(`${changes.repo}|`)) setOpen(true);
  }, [currentFile, changes.repo]);
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
const TicketChanges = ({ dir, refreshKey, segment }: { dir: string; refreshKey: number; segment: Segment }) => {
  const toast = useToast();
  const state = useAsync(() => api.get<TicketChangesReport>(`/api/tickets/${encodeURIComponent(dir)}/${segment}`));
  useReloadOn(refreshKey, state.reload);
  // Lo marcado en esta pantalla se refleja al instante; al volver a leer del servidor, manda lo que él guardó.
  const [marks, setMarks] = useState<Record<string, ViewedState>>({});
  useEffect(() => setMarks({}), [state.data]);
  const [bulk, setBulk] = useState({ open: true, tick: 0 });

  const stateOf = useCallback((repo: string, scope: Scope, file: ChangedFile): ViewedState => marks[markKey(repo, scope, file.path)] ?? file.viewed, [marks]);
  const toggle = useCallback(
    async (repo: string, scope: Scope, file: ChangedFile, viewed: boolean) => {
      try {
        await api.put(`/api/tickets/${encodeURIComponent(dir)}/${segment}/viewed`, { repo, path: file.path, scope, viewed });
        setMarks((current) => ({ ...current, [markKey(repo, scope, file.path)]: viewed ? 'yes' : 'no' }));
        return true;
      } catch (error) {
        toast('error', (error as Error).message);
        return false;
      }
    },
    [dir, segment, toast],
  );
  const [current, setCurrent] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useStoredState('devpanel.changes.tree', typeof window === 'undefined' || window.innerWidth >= 1280);
  const review = useMemo<Review>(() => ({ dir, segment, stateOf, toggle, bulk, current }), [dir, segment, stateOf, toggle, bulk, current]);

  // Todos los archivos en el orden en que se ven (por repo: primero lo commiteado y después lo sin commitear), para moverse con el teclado.
  const flat = useMemo(
    () => (state.data?.repos ?? []).flatMap((repo) => [...repo.committed.map((file) => ({ repo: repo.repo, scope: 'committed' as Scope, file })), ...repo.working.map((file) => ({ repo: repo.repo, scope: 'working' as Scope, file }))].map((item) => ({ ...item, key: markKey(item.repo, item.scope, item.file.path) }))),
    [state.data],
  );
  /** Elegir en el árbol: marca el archivo y, si ya era el actual (el efecto no se dispara), lo trae a la vista igual. */
  const pick = (key: string) => {
    setCurrent(key);
    const [repo = '', scope = '', ...rest] = key.split('|');
    document.getElementById(`file-${repo}-${scope}-${rest.join('|')}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const move = (delta: 1 | -1) => {
    if (!flat.length) return;
    const index = flat.findIndex((item) => item.key === current);
    const target = index < 0 ? (delta > 0 ? 0 : flat.length - 1) : Math.min(flat.length - 1, Math.max(0, index + delta));
    setCurrent(flat[target]!.key);
  };
  const toggleCurrent = async () => {
    const index = flat.findIndex((item) => item.key === current);
    // Sin archivo elegido, V solo elige el primero: marcar sin saber cuál sería un descuido.
    if (index < 0) return move(1);
    const item = flat[index]!;
    const wasSeen = stateOf(item.repo, item.scope, item.file) === 'yes';
    if (!(await toggle(item.repo, item.scope, item.file, !wasSeen)) || wasSeen) return;
    // Al marcarlo pasa al siguiente que todavía no se vio.
    const next = flat.slice(index + 1).find((candidate) => stateOf(candidate.repo, candidate.scope, candidate.file) !== 'yes');
    if (next) setCurrent(next.key);
  };
  useShortcutMap({ 'changes.next': () => move(1), 'changes.prev': () => move(-1), 'changes.viewed': () => void toggleCurrent(), 'changes.expand': () => setBulk({ open: !bulk.open, tick: bulk.tick + 1 }) });

  if (state.loading && !state.data) return <Skeleton className="h-64" />;
  if (state.error || !state.data) return <p className="text-danger">{state.error}</p>;
  const report = state.data;
  if (report.message && report.repos.length === 0) return <EmptyState icon={<GitCompare className="size-6" />} title="No se pudieron leer los MRs">{report.message}</EmptyState>;
  if (report.repos.length === 0) return <EmptyState icon={<GitCompare className="size-6" />} title="Sin repos">El ticket.json no declara repos: no hay de dónde leer los cambios.</EmptyState>;

  const all = report.repos.flatMap((repo) => [...repo.committed.map((file) => stateOf(repo.repo, 'committed', file)), ...repo.working.map((file) => stateOf(repo.repo, 'working', file))]);
  const seen = all.filter((value) => value === 'yes').length;
  return (
    <ReviewContext.Provider value={review}>
      <div className="flex items-start gap-4">
      <ChangesTree repos={report.repos} current={current} keyOf={markKey} stateOf={stateOf} onPick={pick} open={treeOpen} onToggle={() => setTreeOpen(!treeOpen)} />
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-3.5">
          <div className="min-w-48 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm font-medium"><span>Archivos vistos</span><span className={seen === all.length ? 'text-success' : 'text-warning'}>{seen}/{all.length}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className={cn('h-full rounded-full transition-all', seen === all.length ? 'bg-success' : 'bg-accent')} style={{ width: `${all.length ? Math.round((seen / all.length) * 100) : 0}%` }} /></div>
            <p className="mt-1.5 text-sm text-muted">{segment === 'mr-changes' ? 'Cambios de los MRs en GitLab. Las marcas son tuyas y se invalidan si suben otro commit que toque el archivo.' : 'Leé cada archivo y marcalo como visto: el Estado del ticket no da el visto bueno hasta que estén todos.'}</p>
          </div>
          <span className="flex items-center gap-1.5 text-sm text-muted" title="Archivo anterior / siguiente">Archivo <ShortcutKey id="changes.prev" /><ShortcutKey id="changes.next" /></span>
          <Button icon={bulk.open ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />} onClick={() => setBulk({ open: !bulk.open, tick: bulk.tick + 1 })}>{bulk.open ? 'Contraer todo' : 'Expandir todo'}<ShortcutKey id="changes.expand" /></Button>
        </div>
        {report.message && <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">{report.message}</p>}
        {report.repos.map((repo) => <Repo key={repo.repo} changes={repo} baseBranch={report.baseBranch} />)}
      </div>
      </div>
    </ReviewContext.Provider>
  );
};

/** Pestaña Cambios: la copia local de los repos o los MRs de GitLab. Un ticket de revisión (desarrollo de otra persona) abre en los MRs. */
export const TicketChangesTab = ({ dir, refreshKey, mrs, preferMr }: { dir: string; refreshKey: number; mrs: number; preferMr: boolean }) => {
  const [source, setSource] = useState<Segment>(preferMr && mrs > 0 ? 'mr-changes' : 'changes');
  return (
    <div className="space-y-4">
      {mrs > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Ver los cambios de</span>
          <Chip selected={source === 'changes'} onToggle={() => setSource('changes')} hint="Lo que hay en tus repos locales: la rama del ticket contra la base y lo sin commitear.">Mis repos</Chip>
          <Chip selected={source === 'mr-changes'} onToggle={() => setSource('mr-changes')} hint="Lo que muestra GitLab de cada MR del ticket. No hace falta tener la rama en esta máquina.">MRs de GitLab ({mrs})</Chip>
        </div>
      )}
      <TicketChanges key={source} dir={dir} refreshKey={refreshKey} segment={source} />
    </div>
  );
};

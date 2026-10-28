import { ClipboardCheck, Columns3, ExternalLink, Layers, RefreshCw, Search, Timer, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SpHistoryCard } from '../components/SpHistoryCard';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tooltip } from '../components/Tooltip';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { pillStyle, serviceColor } from '../lib/colors';
import { useStoredState } from '../lib/hooks';
import { useDragScroll } from '../lib/useDragScroll';
import { timeAgo } from '../lib/tickets';
import type { Board, RedmineIssue, TicketSummary } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Sort = 'updated' | 'sp' | 'priority';
const STALE_DAYS = 7;

const STATUS_RGB: Record<string, string> = {
  'Análisis': '99 179 237', 'Req. Definido': '129 140 248', 'Estimación': '167 139 250', 'Ampliación': '232 121 249', 'Desarrollo': '251 191 36', 'Commit': '251 146 60',
  'Revisión': '244 114 182', 'Testeado': '163 230 53', 'Testing Consultoría': '45 212 191', 'Testing Consultoría Externo': '34 211 238', 'Testing Aprobado Consultoría': '74 222 128',
  'Terminado': '74 222 128', 'Entregado': '139 152 169', 'Rechazado': '251 113 133', 'Baja': '139 152 169',
};
const PRIORITY_RANK: Record<string, number> = { Inmediata: 0, Urgente: 1, Alta: 2, Normal: 3, Baja: 4 };

const ageDays = (iso: string) => (Date.now() - Date.parse(iso)) / 86_400_000;
const hoursText = (value: number | null) => (value === null ? '—' : `${value % 1 === 0 ? value : value.toFixed(1)}h`);

const Card = ({ issue, folder }: { issue: RedmineIssue; folder: TicketSummary | undefined }) => {
  const stale = !issue.statusClosed && ageDays(issue.updatedOn) > STALE_DAYS;
  const progress = issue.estimatedHours ? Math.min(100, Math.round(((issue.spentHours ?? 0) / issue.estimatedHours) * 100)) : null;
  const over = issue.estimatedHours !== null && (issue.spentHours ?? 0) > issue.estimatedHours;
  return (
    <article className="rounded-xl border border-line bg-surface p-3.5 shadow-sm transition-colors hover:border-accent/40">
      <div className="flex items-start justify-between gap-2">
        <a href={issue.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-mono text-sm text-accent hover:underline">#{issue.id}<ExternalLink className="size-3.5" aria-hidden /></a>
        <div className="flex items-center gap-1.5">
          {issue.storyPoints !== null && <Tooltip content="Story points" width={160}><span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-mono text-sm font-semibold text-accent">{issue.storyPoints} SP</span></Tooltip>}
          {issue.priority !== 'Normal' && <Badge tone={/inmediata|urgente|alta/i.test(issue.priority) ? 'danger' : 'neutral'}>{issue.priority}</Badge>}
        </div>
      </div>
      <h3 className="mt-1.5 font-medium leading-snug">{issue.title}</h3>
      {issue.module && <div className="mt-2"><span className="rounded-md border px-1.5 py-0.5 text-sm" style={pillStyle(serviceColor(issue.module))}>{issue.module}</span></div>}
      {progress !== null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-sm text-muted"><span className="inline-flex items-center gap-1"><Timer className="size-3.5" aria-hidden />{hoursText(issue.spentHours)} / {hoursText(issue.estimatedHours)}</span><span className={cn(over && 'text-danger')}>{progress}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={cn('h-full rounded-full', over ? 'bg-danger' : 'bg-accent')} style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted"><UserRound className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{issue.assignedTo ?? 'Sin asignar'}</span></span>
        <Tooltip content={`Última actualización: ${new Date(issue.updatedOn).toLocaleString('es-AR')}${stale ? ` · sin cambios hace más de ${STALE_DAYS} días` : ''}`} width={260}><span className={cn(stale ? 'font-medium text-warning' : 'text-muted')}>{timeAgo(Date.parse(issue.updatedOn))}</span></Tooltip>
      </div>
      {folder && (
        <div className="mt-3 flex gap-2 border-t border-line pt-2.5 text-sm">
          <Link to={`/pruebas/${encodeURIComponent(folder.dir)}`} className="inline-flex items-center gap-1 text-muted hover:text-accent"><ClipboardCheck className="size-4" aria-hidden />Pruebas</Link>
          <Link to={`/planificacion/${encodeURIComponent(folder.dir)}`} className="inline-flex items-center gap-1 text-muted hover:text-accent"><Layers className="size-4" aria-hidden />Plan</Link>
        </div>
      )}
    </article>
  );
};

export const Kanban = () => {
  const [days, setDays] = useStoredState<number>('devpanel.kanban.days', 30);
  const [sort, setSort] = useStoredState<Sort>('devpanel.kanban.sort', 'updated');
  const [showClosed, setShowClosed] = useStoredState<boolean>('devpanel.kanban.closed', false);
  const [hiddenColumns, setHiddenColumns] = useStoredState<string[]>('devpanel.kanban.hidden', []);
  const [picking, setPicking] = useState(false);
  const dragRef = useDragScroll<HTMLDivElement>();
  const [query, setQuery] = useState('');
  const board = useAsync(() => api.get<Board>(`/api/redmine/board?days=${days}`));
  const folders = useAsync(() => api.get<{ tickets: TicketSummary[] }>('/api/tickets'));
  // Al cambiar los filtros del servidor (alcance o días) se vuelve a pedir; la primera carga ya la hizo useAsync.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else board.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const data = board.data;
  const byTicket = useMemo(() => new Map((folders.data?.tickets ?? []).filter((item) => item.ticket).map((item) => [item.ticket!, item])), [folders.data]);

  const columns = useMemo(() => {
    if (!data) return [];
    const text = query.trim().toLowerCase();
    const visible = data.issues.filter((issue) => (!text || `${issue.id} ${issue.title} ${issue.module ?? ''}`.toLowerCase().includes(text)));
    const order = (a: RedmineIssue, b: RedmineIssue) =>
      sort === 'sp' ? (b.storyPoints ?? -1) - (a.storyPoints ?? -1) : sort === 'priority' ? (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || b.updatedOn.localeCompare(a.updatedOn) : b.updatedOn.localeCompare(a.updatedOn);
    return data.statuses
      .filter((status) => (showClosed || !status.closed) && !hiddenColumns.includes(status.name))
      .map((status) => {
        const issues = visible.filter((issue) => issue.status === status.name).sort(order);
        return { status, issues, sp: issues.reduce((sum, issue) => sum + (issue.storyPoints ?? 0), 0), hours: issues.reduce((sum, issue) => sum + (issue.estimatedHours ?? 0), 0) };
      })
      .filter((column) => column.issues.length > 0 || !column.status.closed);
  }, [data, query, sort, showClosed, hiddenColumns]);

  const shown = columns.reduce((sum, column) => sum + column.issues.length, 0);
  // Columnas sin tickets ocupan lugar: se colapsan a un rótulo angosto.
  const empty = columns.filter((column) => column.issues.length === 0);
  const filled = columns.filter((column) => column.issues.length > 0);

  return (
    <>
      <PageHeader
        title="Kanban"
        description={data ? `${shown} tickets con cambios en los últimos ${data.days} días · tus tickets en Redmine, solo lectura` : 'Tickets de Redmine por estado.'}
        actions={<Button icon={<RefreshCw className="size-4" />} onClick={board.reload}>Actualizar</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex h-10 w-72 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent/60">
          <Search className="size-4 text-muted" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar número, título o módulo…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
        </label>
                <div className="flex items-center gap-2"><span className="text-sm text-muted">Cambios en</span>{[7, 30, 60].map((value) => <Chip key={value} selected={days === value} onToggle={() => setDays(value)}>{value} días</Chip>)}</div>
        <div className="flex items-center gap-2"><span className="text-sm text-muted">Ordenar</span>{([['updated', 'Actualización'], ['sp', 'SP'], ['priority', 'Prioridad']] as const).map(([id, label]) => <Chip key={id} selected={sort === id} onToggle={() => setSort(id)}>{label}</Chip>)}</div>
        <Chip selected={showClosed} onToggle={() => setShowClosed(!showClosed)} hint="Entregado, Rechazado y Baja">Mostrar cerrados</Chip>
        <Button className="h-10" icon={<Columns3 className="size-4" />} onClick={() => setPicking(!picking)}>Columnas{hiddenColumns.length ? ` (${hiddenColumns.length} ocultas)` : ''}</Button>
      </div>

      {picking && data && (
        <div className="mb-5 rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between"><span className="font-medium">Elegí qué columnas ver</span>
            <span className="flex gap-3 text-sm"><button type="button" className="text-accent hover:underline" onClick={() => setHiddenColumns([])}>Mostrar todas</button><button type="button" className="text-accent hover:underline" onClick={() => setHiddenColumns(data.statuses.map((status) => status.name))}>Ocultar todas</button></span></div>
          <div className="flex flex-wrap gap-2">
            {data.statuses.map((status) => {
              const count = data.issues.filter((issue) => issue.status === status.name).length;
              return <Chip key={status.id} color={STATUS_RGB[status.name] ?? '138 151 255'} selected={!hiddenColumns.includes(status.name)} onToggle={() => setHiddenColumns(hiddenColumns.includes(status.name) ? hiddenColumns.filter((name) => name !== status.name) : [...hiddenColumns, status.name])}>{status.name} <span className="opacity-70">{count}</span></Chip>;
            })}
          </div>
          {!showClosed && <p className="mt-3 text-sm text-muted">Los estados cerrados (Entregado, Rechazado, Baja) además necesitan “Mostrar cerrados”.</p>}
        </div>
      )}

      <SpHistoryCard />

      {board.loading && !data ? <div className="flex gap-4"><Skeleton className="h-96 w-80" /><Skeleton className="h-96 w-80" /><Skeleton className="h-96 w-80" /></div> : board.error ? (
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-muted">Redmine: {board.error}</p>
      ) : (
        <>
          {data?.truncated && <p className="mb-3 text-sm text-warning">Hay más de 100 tickets en ese período: se muestran los 100 más recientes. Acotá los días.</p>}
          <div ref={dragRef} className="flex cursor-grab items-start gap-4 overflow-x-auto pb-4" title="Arrastrá para moverte">
            {filled.map(({ status, issues, sp, hours }) => {
              const rgb = STATUS_RGB[status.name] ?? '138 151 255';
              return (
                <section key={status.id} className="w-80 shrink-0" aria-label={status.name}>
                  <header className="mb-3 rounded-xl border bg-surface px-3.5 py-2.5" style={{ borderColor: `rgb(${rgb} / 0.45)` }}>
                    <div className="flex items-center justify-between"><h2 className="font-semibold" style={{ color: `rgb(${rgb})` }}>{status.name}</h2><span className="rounded-md bg-surface-3 px-2 font-mono text-sm">{issues.length}</span></div>
                    <div className="mt-0.5 text-sm text-muted">{sp} SP · {hours % 1 === 0 ? hours : hours.toFixed(1)} h estimadas</div>
                  </header>
                  <div className="space-y-3">{issues.map((issue) => <Card key={issue.id} issue={issue} folder={byTicket.get(String(issue.id))} />)}</div>
                </section>
              );
            })}
          </div>
          {empty.length > 0 && <p className="text-sm text-muted">Sin tickets en: {empty.map((column) => column.status.name).join(' · ')}.</p>}
          {columns.length === 0 || shown === 0 ? <p className="py-10 text-center text-muted">Ningún ticket coincide.</p> : null}
        </>
      )}
    </>
  );
};

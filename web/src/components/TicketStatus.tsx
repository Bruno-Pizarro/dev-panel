import { Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useReloadOn } from '../lib/hooks';
import type { MrReport, ServicesReport, ShipReport, TicketDataReport, TicketGitReport } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { StatusDot } from './StatusDot';

const base = (dir: string) => `/api/tickets/${encodeURIComponent(dir)}`;

/** Carga una sección del Estado; un error en una no afecta a las demás. */
const Section = <T,>({ title, url, refreshKey, action, children }: { title: string; url: string; refreshKey: number; action?: (data: T) => React.ReactNode; children: (data: T) => React.ReactNode }) => {
  const state = useAsync(() => api.get<T>(url));
  useReloadOn(refreshKey, state.reload);
  return (
    <Card title={title} action={state.data && action ? action(state.data) : undefined}>
      {state.loading && !state.data ? <Skeleton className="h-24" /> : state.error || !state.data ? <p className="text-danger">{state.error}</p> : children(state.data)}
    </Card>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted">{children}</p>;

const Ship = ({ dir, refreshKey }: { dir: string; refreshKey: number }) => (
  <Section<ShipReport>
    title="Listo para abrir los MRs"
    url={`${base(dir)}/ship`}
    refreshKey={refreshKey}
    action={(data) => <Badge tone={data.summary.ready ? 'success' : data.summary.error ? 'danger' : 'warning'}>{data.summary.ready ? 'Todo en orden' : `${data.summary.error + data.summary.warn} por revisar`}</Badge>}
  >
    {(data) => (
      <div className="space-y-5">
        {data.lastRun && (
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-medium">Última corrida de pruebas</span>
              <span className="font-mono text-sm text-muted">{data.lastRun.fecha ?? 's/f'}</span>
              {data.lastRun.segments.length > 0 ? <Badge tone={data.lastRun.allPassed ? 'success' : 'warning'}>{data.lastRun.passed}/{data.lastRun.total}</Badge> : <Badge>sin n/m</Badge>}
              {data.lastRun.archivo && <span className="font-mono text-sm text-muted">{data.lastRun.archivo}</span>}
            </div>
            {data.lastRun.segments.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.lastRun.segments.map((segment, index) => (
                  <li key={index}>
                    <Badge tone={segment.passed >= segment.total ? 'success' : 'danger'}>
                      {segment.passed >= segment.total ? <Check className="mr-1 inline size-4" aria-hidden /> : <X className="mr-1 inline size-4" aria-hidden />}
                      {segment.label ? `${segment.label} ` : ''}{segment.passed}/{segment.total}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {data.lastRun.resumen && <p className="mt-3 text-sm text-muted">{data.lastRun.resumen}</p>}
          </div>
        )}
        <ul className="divide-y divide-line">
          {data.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5">
              <span className="w-64 shrink-0"><StatusDot status={item.level} label={item.label} labelClassName="text-fg" /></span>
              <span className="min-w-0 flex-1 text-muted">{item.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    )}
  </Section>
);

const Git = ({ dir, refreshKey }: { dir: string; refreshKey: number }) => (
  <Section<TicketGitReport> title="Git de los repos del ticket" url={`${base(dir)}/git`} refreshKey={refreshKey}>
    {(data) =>
      data.repos.length === 0 ? (
        <Hint>El ticket no declara <span className="font-mono">repos</span> en ticket.json.</Hint>
      ) : (
        <ul className="space-y-3">
          {data.repos.map((repo) => (
            <li key={repo.repo} className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-mono font-medium">{repo.repo}</span>
                <span className="font-mono text-sm text-muted">{repo.branch ?? '—'}</span>
                {repo.base && <Badge tone={repo.base.behind > 0 ? 'warning' : 'neutral'}>{repo.base.name}: +{repo.base.ahead} / −{repo.base.behind}</Badge>}
                {repo.upstream ? <Badge tone={repo.upstream.ahead || repo.upstream.behind ? 'warning' : 'success'}>remoto: ↑{repo.upstream.ahead} ↓{repo.upstream.behind}</Badge> : repo.exists && <Badge tone="warning">sin remoto</Badge>}
                {repo.exists && <Badge tone={repo.dirty.length ? 'warning' : 'success'}>{repo.dirty.length ? `${repo.dirty.length} sin commitear` : 'limpio'}</Badge>}
                {repo.ignored && repo.ignored.length > 0 && <Badge>{repo.ignored.join(', ')} ignorado</Badge>}
              </div>
              {repo.warnings.length > 0 && (
                <ul className="mt-2 space-y-1">{repo.warnings.map((warning) => <li key={warning.text}><StatusDot status={warning.level} label={warning.text} /></li>)}</ul>
              )}
              {repo.last && <p className="mt-2 truncate text-sm text-muted">Último: <span className="font-mono">{repo.last.hash}</span> {repo.last.subject} · {repo.last.when}</p>}
            </li>
          ))}
        </ul>
      )
    }
  </Section>
);

const Services = ({ dir, refreshKey }: { dir: string; refreshKey: number }) => (
  <Section<ServicesReport> title="Servicios para probar" url={`${base(dir)}/services`} refreshKey={refreshKey} action={(data) => <Badge tone={data.missing.length ? 'danger' : 'success'}>{data.missing.length ? `${data.missing.length} caídos` : 'todo arriba'}</Badge>}>
    {(data) => (
      <div className="space-y-3">
        <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {data.services.map((service) => (
            <li key={service.service} className="min-w-0">
              <StatusDot status={service.level} label={`${service.service} · ${service.detail}`} />
            </li>
          ))}
        </ul>
        {data.missing.length > 0 && <Hint>Para levantar {data.missing.join(', ')} usá <span className="font-medium">Levantar servicios</span> arriba (o la vista Levantado).</Hint>}
        {data.skipped.length > 0 && <Hint>Sin servicio de compose (no se levanta): {data.skipped.join(', ')}.</Hint>}
      </div>
    )}
  </Section>
);

const Gitlab = ({ dir, refreshKey }: { dir: string; refreshKey: number }) => (
  <Section<MrReport> title="Merge requests en GitLab" url={`${base(dir)}/gitlab${refreshKey > 0 ? '?fresh=1' : ''}`} refreshKey={refreshKey}>
    {(data) =>
      !data.configured && data.tokenError ? (
        <Hint>{data.tokenError}. Probá <span className="font-mono">ssh -T git@{new URL(data.baseUrl).hostname}</span> en una terminal, o cargá un token en <Link className="text-accent hover:underline" to="/configuracion">Configuración → GitLab</Link>.</Hint>
      ) : !data.configured ? (
        <Hint>Falta el token de GitLab: cargalo en <Link className="text-accent hover:underline" to="/configuracion">Configuración → GitLab</Link> (o con la variable <span className="font-mono">GITLAB_TOKEN</span>), o activá allí "Pedir un token de 1 día por SSH", que no hace falta renovar. Solo se leen datos.</Hint>
      ) : data.mrs.length === 0 ? (
        <Hint>El ticket no tiene MRs en <span className="font-mono">ticket.json</span>. Los registra la skill <span className="font-mono">ship</span> al crearlos.</Hint>
      ) : (
        <div className="space-y-3">
          <Hint>Orden sugerido de merge: el 1 primero (backends antes que el front; se cambia con <span className="font-mono">ordenMerge</span> en ticket.json).</Hint>
          <ul className="space-y-3">
            {data.mrs.map((mr) => (
              <li key={`${mr.repo}-${mr.iid}`} className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Badge tone="accent">{mr.order + 1}º</Badge>
                  <span className="font-mono font-medium">{mr.repo ?? '?'}</span>
                  {mr.url ? <a className="text-accent hover:underline" href={mr.url} target="_blank" rel="noreferrer noopener">!{mr.iid}</a> : <span>!{mr.iid}</span>}
                  {mr.state && <Badge tone={mr.state === 'merged' ? 'success' : mr.state === 'closed' ? 'neutral' : 'info'}>{mr.state}</Badge>}
                  {mr.pipeline && (mr.pipeline.url ? <a href={mr.pipeline.url} target="_blank" rel="noreferrer noopener"><Badge tone={mr.pipeline.status === 'success' ? 'success' : mr.pipeline.status === 'failed' ? 'danger' : 'warning'}>pipeline {mr.pipeline.status}</Badge></a> : <Badge>pipeline {mr.pipeline.status}</Badge>)}
                  {mr.notes > 0 && <Badge>{mr.notes} comentarios</Badge>}
                </div>
                {mr.title && <p className="mt-2 truncate">{mr.title}</p>}
                <div className="mt-2"><StatusDot status={mr.level} label={mr.summary} /></div>
                {mr.sourceBranch && <p className="mt-1 font-mono text-sm text-muted">{mr.sourceBranch} → {mr.targetBranch}</p>}
              </li>
            ))}
          </ul>
        </div>
      )
    }
  </Section>
);

const TestData = ({ dir, refreshKey }: { dir: string; refreshKey: number }) => (
  <Section<TicketDataReport> title="Datos de prueba" url={`${base(dir)}/test-data`} refreshKey={refreshKey} action={(data) => (data.ticket ? <Link className="text-sm text-accent hover:underline" to="/datos">Limpiar en Datos</Link> : null)}>
    {(data) => (
      <div className="space-y-4">
        {data.error ? (
          <Hint>No se pudieron contar los datos marcados con [{data.ticket ?? '?'}]: {data.error}</Hint>
        ) : (
          <div>
            <div className="mb-2 flex items-center gap-3"><span className="font-medium">Marcados con [{data.ticket}]</span><Badge tone={data.total ? 'warning' : 'success'}>{data.total ? `${data.total} documentos` : 'nada para limpiar'}</Badge></div>
            <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
              {data.rows.map((row) => <li key={`${row.db}.${row.collection}`} className="flex justify-between gap-3 font-mono text-sm"><span className="truncate text-muted">{row.db}.{row.collection}</span><span>{row.count}</span></li>)}
            </ul>
            <Hint>Los archivos subidos (PDF en uploads/S3) no se cuentan ni se limpian.</Hint>
          </div>
        )}
        <div>
          <div className="mb-2 flex items-center gap-3"><span className="font-medium">RabbitMQ</span>{data.queues && <Badge tone={data.queues.length ? 'warning' : 'success'}>{data.queues.length ? `${data.queues.length} colas con mensajes` : 'colas vacías'}</Badge>}</div>
          {data.queuesError && <Hint>{data.queuesError}</Hint>}
          {data.queues && data.queues.length > 0 && (
            <>
              <ul className="space-y-1">{data.queues.map((queue) => <li key={queue.name} className="flex justify-between gap-3 font-mono text-sm"><span className="truncate">{queue.name}</span><span className="text-muted">{queue.ready} listos · {queue.unacked} sin ack</span></li>)}</ul>
              <Hint>Al probar firmas, documentos y files suelen dejar mensajes de <span className="font-mono">user.update</span> sin confirmar. Se limpian con tu OK.</Hint>
            </>
          )}
        </div>
        {data.notes && (
          <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm">
            <div className="mb-1 font-medium">Notas del ticket</div>
            {data.notes.descripcion && <p>{data.notes.descripcion}</p>}
            {data.notes.siembra && <p className="mt-1"><span className="text-muted">Sembrar: </span>{data.notes.siembra}</p>}
            {data.notes.limpieza && <p className="mt-1"><span className="text-muted">Limpiar: </span>{data.notes.limpieza}</p>}
            {data.notes.avisos?.map((warning) => <p key={warning} className="mt-1"><StatusDot status="warn" label={warning} /></p>)}
          </div>
        )}
      </div>
    )}
  </Section>
);

/** Pestaña Estado: lo que hay que mirar antes de pasar un ticket a MR. Todo es solo lectura. */
export const TicketStatus = ({ dir, refreshKey }: { dir: string; refreshKey: number }) => (
  <div className="space-y-6">
    <Ship dir={dir} refreshKey={refreshKey} />
    <Git dir={dir} refreshKey={refreshKey} />
    <Gitlab dir={dir} refreshKey={refreshKey} />
    <Services dir={dir} refreshKey={refreshKey} />
    <TestData dir={dir} refreshKey={refreshKey} />
  </div>
);

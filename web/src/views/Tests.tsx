import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, toneOf } from '../components/Badge';
import { Card } from '../components/Card';
import { DocViewer } from '../components/DocViewer';
import { EmptyState } from '../components/EmptyState';
import { Gallery } from '../components/Gallery';
import { ManualTests } from '../components/ManualTests';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { TestRuns } from '../components/TestRuns';
import { RedmineCard } from '../components/RedmineCard';
import { TicketControls } from '../components/TicketControls';
import { TicketFrame } from '../components/TicketFrame';
import { TicketStatus } from '../components/TicketStatus';
import { TicketHeader } from '../components/TicketHeader';
import { TicketList } from '../components/TicketList';
import { RefreshButton } from '../components/RefreshButton';
import { api } from '../lib/api';
import { useReloadOn } from '../lib/hooks';
import type { TicketDetail, TicketSummary } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'estado' | 'resumen' | 'manuales' | 'informes' | 'capturas';

const Summary = ({ detail, onListChanged, refreshKey }: { detail: TicketDetail; onListChanged: () => void; refreshKey: number }) => {
  const meta = detail.meta;
  const empty = !meta?.pruebas?.length && !meta?.mrs?.length && !meta?.codeReview?.length;
  if (empty) return <EmptyState icon={<ClipboardCheck className="size-6" />} title="Sin resumen estructurado">Hay {detail.docs} documentos y {detail.images} capturas en las otras pestañas. El resumen aparece cuando existe <span className="font-mono">ticket.json</span>.</EmptyState>;
  return (
    <div className="space-y-6">
      {meta?.pruebas && meta.pruebas.length > 0 && <TestRuns dir={detail.dir} runs={meta.pruebas} onChanged={onListChanged} refreshKey={refreshKey} historyOnly={detail.kind !== 'revision'} />}
      {meta?.mrs && meta.mrs.length > 0 && (
        <Card title="Merge requests">
          <table className="w-full text-left text-sm">
            <thead className="text-muted"><tr><th className="pb-2 font-medium">Repo</th><th className="pb-2 font-medium">MR</th><th className="pb-2 font-medium">Autor</th><th className="pb-2 font-medium">Estado</th></tr></thead>
            <tbody className="divide-y divide-line">
              {meta.mrs.map((mr, index) => (
                <tr key={index}>
                  <td className="py-2.5 font-mono">{mr.repo ?? '—'}</td>
                  <td className="py-2.5">{mr.url ? <a className="text-accent hover:underline" href={mr.url} target="_blank" rel="noreferrer noopener">!{mr.iid ?? '?'}</a> : `!${mr.iid ?? '?'}`}</td>
                  <td className="py-2.5">{mr.autor ?? '—'}</td>
                  <td className="py-2.5">{mr.estado ? <Badge tone={toneOf(mr.estado)}>{mr.estado}</Badge> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {meta?.codeReview && meta.codeReview.length > 0 && (
        <Card title="Code review">
          <ul className="space-y-3">
            {[...meta.codeReview].reverse().map((review, index) => (
              <li key={index} className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <span className="w-28 shrink-0 font-mono text-sm text-muted">{review.fecha ?? '—'}</span>
                {review.veredicto && <Badge tone={toneOf(review.veredicto)}>{review.veredicto}</Badge>}
                {review.hallazgos !== undefined && <Badge>{review.hallazgos} hallazgos</Badge>}
                <span className="min-w-0 flex-1">{review.resumen}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

const Detail = ({ dir, onListChanged, refreshKey }: { dir: string; onListChanged: () => void; refreshKey: number }) => {
  const [tab, setTab] = useState<Tab>('resumen');
  const detail = useAsync(() => api.get<TicketDetail>(`/api/tickets/${encodeURIComponent(dir)}`));
  useReloadOn(refreshKey, detail.reload);
  if (detail.loading && !detail.data) return <Skeleton className="h-96" />;
  if (detail.error || !detail.data) return <p className="text-danger">{detail.error}</p>;
  const data = detail.data;
  const reports = data.files.docs.filter((file) => /EJECUCION|INFORME|PRUEBA|RESULT|REVIEW|HALLAZGO/i.test(file));
  return (
    <TicketFrame dir={dir} listPath="/pruebas" header={<><TicketHeader detail={data} /><TicketControls detail={data} view="pruebas" onChanged={() => (detail.reload(), onListChanged())} /><RedmineCard ticket={data.ticket} refreshKey={refreshKey} /></>}>
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'resumen', label: 'Resumen' }, { id: 'estado', label: 'Estado' }, { id: 'manuales', label: 'Pruebas manuales', count: data.meta?.pruebasManuales?.length }, { id: 'informes', label: 'Informes', count: data.files.docs.length }, { id: 'capturas', label: 'Capturas', count: data.files.images.length }]} />
      {tab === 'estado' && <TicketStatus dir={dir} refreshKey={refreshKey} />}
      {tab === 'resumen' && <Summary detail={data} onListChanged={onListChanged} refreshKey={refreshKey} />}
      {tab === 'manuales' && <ManualTests dir={dir} refreshKey={refreshKey} />}
      {tab === 'informes' && <DocViewer key={dir} dir={dir} files={data.files.docs} initial={data.meta?.pruebas?.at(-1)?.archivo ?? reports[0]} refreshKey={refreshKey} />}
      {tab === 'capturas' && <Gallery dir={dir} images={data.files.images} />}
    </TicketFrame>
  );
};

export const Tests = () => {
  const { dir } = useParams();
  const list = useAsync(() => api.get<{ tickets: TicketSummary[]; extra: string }>('/api/tickets'));
  // "Actualizar" recarga el listado y avisa al ticket abierto para que vuelva a leer todo lo suyo.
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="md:flex md:h-full md:min-h-0 md:flex-col">
      <PageHeader title="Pruebas" description={list.data ? `${list.data.tickets.length} carpetas en ${list.data.extra}` : 'Pruebas realizadas por ticket.'} actions={<RefreshButton busy={list.loading} onRefresh={() => (list.reload(), setRefreshKey((value) => value + 1))} />} />
      <div className="grid gap-6 md:min-h-0 md:flex-1 md:grid-rows-[minmax(0,1fr)] md:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="relative min-h-0 md:h-full">
          {list.loading && !list.data ? <Skeleton className="h-96" /> : <TicketList tickets={list.data?.tickets ?? []} basePath="/pruebas" withTestFilters />}
        </div>
        <div className="relative min-w-0 md:h-full md:overflow-y-auto md:pr-2">
          {dir ? <Detail key={dir} dir={dir} onListChanged={list.reload} refreshKey={refreshKey} /> : <EmptyState icon={<ClipboardCheck className="size-6" />} title="Elegí un ticket">Acá vas a ver el resumen de pruebas, los informes en Markdown y las capturas de cada carpeta de la base de conocimiento.</EmptyState>}
        </div>
      </div>
    </div>
  );
};

import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, toneOf } from '../components/Badge';
import { Card } from '../components/Card';
import { DocViewer } from '../components/DocViewer';
import { EmptyState } from '../components/EmptyState';
import { Gallery } from '../components/Gallery';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { TestRuns } from '../components/TestRuns';
import { RedmineCard } from '../components/RedmineCard';
import { TicketFrame } from '../components/TicketFrame';
import { TicketHeader } from '../components/TicketHeader';
import { TicketList } from '../components/TicketList';
import { api } from '../lib/api';
import type { TicketDetail, TicketSummary } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'resumen' | 'informes' | 'capturas';

const Summary = ({ detail }: { detail: TicketDetail }) => {
  const meta = detail.meta;
  const empty = !meta?.pruebas?.length && !meta?.mrs?.length && !meta?.codeReview?.length;
  if (empty) return <EmptyState icon={<ClipboardCheck className="size-6" />} title="Sin resumen estructurado">Hay {detail.docs} documentos y {detail.images} capturas en las otras pestañas. El resumen aparece cuando existe <span className="font-mono">ticket.json</span>.</EmptyState>;
  return (
    <div className="space-y-6">
      {meta?.pruebas && meta.pruebas.length > 0 && <TestRuns dir={detail.dir} runs={meta.pruebas} />}
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

const Detail = ({ dir }: { dir: string }) => {
  const [tab, setTab] = useState<Tab>('resumen');
  const detail = useAsync(() => api.get<TicketDetail>(`/api/tickets/${encodeURIComponent(dir)}`));
  if (detail.loading) return <Skeleton className="h-96" />;
  if (detail.error || !detail.data) return <p className="text-danger">{detail.error}</p>;
  const data = detail.data;
  const reports = data.files.docs.filter((file) => /EJECUCION|INFORME|PRUEBA|RESULT|REVIEW|HALLAZGO/i.test(file));
  return (
    <TicketFrame dir={dir} listPath="/pruebas" header={<><TicketHeader detail={data} /><RedmineCard ticket={data.ticket} /></>}>
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'resumen', label: 'Resumen' }, { id: 'informes', label: 'Informes', count: data.files.docs.length }, { id: 'capturas', label: 'Capturas', count: data.files.images.length }]} />
      {tab === 'resumen' && <Summary detail={data} />}
      {tab === 'informes' && <DocViewer key={dir} dir={dir} files={data.files.docs} initial={data.meta?.pruebas?.at(-1)?.archivo ?? reports[0]} />}
      {tab === 'capturas' && <Gallery dir={dir} images={data.files.images} />}
    </TicketFrame>
  );
};

export const Tests = () => {
  const { dir } = useParams();
  const list = useAsync(() => api.get<{ tickets: TicketSummary[]; extra: string }>('/api/tickets'));
  return (
    <>
      <PageHeader title="Pruebas" description={list.data ? `${list.data.tickets.length} carpetas en ${list.data.extra}` : 'Pruebas realizadas por ticket.'} />
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-0 lg:max-h-[calc(100vh-11rem)] lg:self-start">
          {list.loading ? <Skeleton className="h-96" /> : <TicketList tickets={list.data?.tickets ?? []} basePath="/pruebas" withTestFilters />}
        </div>
        <div className="min-w-0">
          {dir ? <Detail key={dir} dir={dir} /> : <EmptyState icon={<ClipboardCheck className="size-6" />} title="Elegí un ticket">Acá vas a ver el resumen de pruebas, los informes en Markdown y las capturas de cada carpeta de la base de conocimiento.</EmptyState>}
        </div>
      </div>
    </>
  );
};

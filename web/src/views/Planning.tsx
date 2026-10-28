import { Layers } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { DocViewer } from '../components/DocViewer';
import { EmptyState } from '../components/EmptyState';
import { Markdown } from '../components/Markdown';
import { Mermaid } from '../components/Mermaid';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { RedmineCard } from '../components/RedmineCard';
import { TicketControls } from '../components/TicketControls';
import { TicketFrame } from '../components/TicketFrame';
import { TicketHeader } from '../components/TicketHeader';
import { TicketList } from '../components/TicketList';
import { RefreshButton } from '../components/RefreshButton';
import { api } from '../lib/api';
import { useReloadOn } from '../lib/hooks';
import { assetUrl, classifyDocs, diagramFile, fileUrl, planDoc, referenceImage } from '../lib/tickets';
import type { TicketDetail, TicketSummary } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'plan' | 'diagrama' | 'referencia' | 'documentos';

const FileText = ({ dir, file, refreshKey, children }: { dir: string; file: string; refreshKey: number; children: (content: string) => React.ReactNode }) => {
  const doc = useAsync(() => api.get<{ content: string }>(fileUrl(dir, file)));
  useReloadOn(refreshKey, doc.reload);
  if (doc.loading && !doc.data) return <Skeleton className="h-64" />;
  if (doc.error || !doc.data) return <p className="text-danger">No se pudo leer {file}: {doc.error}</p>;
  return <>{children(doc.data.content)}</>;
};

const Detail = ({ dir, refreshKey }: { dir: string; refreshKey: number }) => {
  const [tab, setTab] = useState<Tab>('plan');
  const detail = useAsync(() => api.get<TicketDetail>(`/api/tickets/${encodeURIComponent(dir)}`));
  useReloadOn(refreshKey, detail.reload);
  if (detail.loading && !detail.data) return <Skeleton className="h-96" />;
  if (detail.error || !detail.data) return <p className="text-danger">{detail.error}</p>;
  const data = detail.data;
  // Un ticket solo de revisión nunca se muestra en Desarrollo: su lugar es Pruebas.
  if (data.kind === 'revision') return <Navigate to={`/pruebas/${encodeURIComponent(dir)}`} replace />;
  const plan = planDoc(data);
  const diagram = diagramFile(data);
  const reference = referenceImage(data);
  const groups = classifyDocs(data.files.docs);

  return (
    <TicketFrame dir={dir} listPath="/planificacion" header={<><TicketHeader detail={data} /><TicketControls detail={data} view="desarrollo" onChanged={detail.reload} /><RedmineCard ticket={data.ticket} refreshKey={refreshKey} /></>}>
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'plan', label: 'Plan' }, { id: 'diagrama', label: 'Diagrama' }, { id: 'referencia', label: 'Referencia visual' }, { id: 'documentos', label: 'Documentos', count: data.files.docs.length }]} />
      {tab === 'plan' &&
        (plan ? (
          <Card><FileText dir={dir} file={plan} refreshKey={refreshKey}>{(content) => <Markdown source={content} ticket={{ dir, file: plan }} />}</FileText></Card>
        ) : (
          <EmptyState icon={<Layers className="size-6" />} title="Sin plan en esta carpeta">Cuando exista un plan ejecutor, o el campo <span className="font-mono">plan.resumen</span> de ticket.json, se muestra acá.</EmptyState>
        ))}
      {tab === 'diagrama' &&
        (diagram ? (
          <FileText dir={dir} file={diagram} refreshKey={refreshKey}>{(content) => <Mermaid code={content} />}</FileText>
        ) : (
          <EmptyState icon={<Layers className="size-6" />} title="Sin diagrama de flujo">Se muestra un archivo <span className="font-mono">.mmd</span> (Mermaid) de la carpeta o el que indique <span className="font-mono">plan.diagrama</span>.</EmptyState>
        ))}
      {tab === 'referencia' &&
        (reference ? (
          <img src={assetUrl(dir, reference)} alt="Referencia visual" className="max-w-full rounded-2xl border border-line" />
        ) : (
          <EmptyState icon={<Layers className="size-6" />} title="Sin referencia visual">Si pedís una captura de cómo debería verse la funcionalidad, queda guardada en la carpeta y aparece acá.</EmptyState>
        ))}
      {tab === 'documentos' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">{groups.map((group) => <span key={group.label}>{group.label}: {group.files.length}</span>)}</div>
          <DocViewer key={dir} dir={dir} files={groups.flatMap((group) => group.files)} initial={plan} refreshKey={refreshKey} />
        </div>
      )}
    </TicketFrame>
  );
};

export const Planning = () => {
  const { dir } = useParams();
  const list = useAsync(() => api.get<{ tickets: TicketSummary[] }>('/api/tickets'));
  // "Actualizar" recarga el listado y avisa al ticket abierto para que vuelva a leer todo lo suyo.
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="md:flex md:h-full md:min-h-0 md:flex-col">
      <PageHeader title="Desarrollo" description="Análisis, plan, diagrama de flujo y referencia visual de cada desarrollo." actions={<RefreshButton busy={list.loading} onRefresh={() => (list.reload(), setRefreshKey((value) => value + 1))} />} />
      <div className="grid gap-6 md:min-h-0 md:flex-1 md:grid-rows-[minmax(0,1fr)] md:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="relative min-h-0 md:h-full">
          {list.loading && !list.data ? <Skeleton className="h-96" /> : <TicketList tickets={(list.data?.tickets ?? []).filter((ticket) => ticket.kind !== 'revision')} basePath="/planificacion" />}
        </div>
        <div className="relative min-w-0 md:h-full md:overflow-y-auto md:pr-2">
          {dir ? <Detail key={dir} dir={dir} refreshKey={refreshKey} /> : <EmptyState icon={<Layers className="size-6" />} title="Elegí un desarrollo">Acá vas a entender una funcionalidad sin leer todo el análisis: ticket, rama, plan abreviado, diagrama y cómo debería verse.</EmptyState>}
        </div>
      </div>
    </div>
  );
};

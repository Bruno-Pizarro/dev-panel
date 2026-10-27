import { Layers } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { DocViewer } from '../components/DocViewer';
import { EmptyState } from '../components/EmptyState';
import { Markdown } from '../components/Markdown';
import { Mermaid } from '../components/Mermaid';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { TicketHeader } from '../components/TicketHeader';
import { TicketList } from '../components/TicketList';
import { api } from '../lib/api';
import { assetUrl, classifyDocs, diagramFile, fileUrl, planDoc, referenceImage } from '../lib/tickets';
import type { TicketDetail, TicketSummary } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Tab = 'plan' | 'diagrama' | 'referencia' | 'documentos';

const FileText = ({ dir, file, children }: { dir: string; file: string; children: (content: string) => React.ReactNode }) => {
  const doc = useAsync(() => api.get<{ content: string }>(fileUrl(dir, file)));
  if (doc.loading) return <Skeleton className="h-64" />;
  if (doc.error || !doc.data) return <p className="text-danger">No se pudo leer {file}: {doc.error}</p>;
  return <>{children(doc.data.content)}</>;
};

const Detail = ({ dir }: { dir: string }) => {
  const [tab, setTab] = useState<Tab>('plan');
  const detail = useAsync(() => api.get<TicketDetail>(`/api/tickets/${encodeURIComponent(dir)}`));
  if (detail.loading) return <Skeleton className="h-96" />;
  if (detail.error || !detail.data) return <p className="text-danger">{detail.error}</p>;
  const data = detail.data;
  const plan = planDoc(data);
  const diagram = diagramFile(data);
  const reference = referenceImage(data);
  const groups = classifyDocs(data.files.docs);

  return (
    <>
      <TicketHeader detail={data} />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'plan', label: 'Plan' }, { id: 'diagrama', label: 'Diagrama' }, { id: 'referencia', label: 'Referencia visual' }, { id: 'documentos', label: 'Documentos', count: data.files.docs.length }]} />
      {tab === 'plan' &&
        (plan ? (
          <Card><FileText dir={dir} file={plan}>{(content) => <Markdown source={content} ticket={{ dir, file: plan }} />}</FileText></Card>
        ) : (
          <EmptyState icon={<Layers className="size-6" />} title="Sin plan en esta carpeta">Cuando exista un plan ejecutor, o el campo <span className="font-mono">plan.resumen</span> de ticket.json, se muestra acá.</EmptyState>
        ))}
      {tab === 'diagrama' &&
        (diagram ? (
          <FileText dir={dir} file={diagram}>{(content) => <Mermaid code={content} />}</FileText>
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
          <DocViewer key={dir} dir={dir} files={groups.flatMap((group) => group.files)} initial={plan} />
        </div>
      )}
    </>
  );
};

export const Planning = () => {
  const { dir } = useParams();
  const list = useAsync(() => api.get<{ tickets: TicketSummary[] }>('/api/tickets'));
  return (
    <>
      <PageHeader title="Planificación" description="Análisis, plan, diagrama de flujo y referencia visual de cada desarrollo." />
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-0 lg:max-h-[calc(100vh-11rem)] lg:self-start">
          {list.loading ? <Skeleton className="h-96" /> : <TicketList tickets={list.data?.tickets ?? []} basePath="/planificacion" />}
        </div>
        <div className="min-w-0">
          {dir ? <Detail key={dir} dir={dir} /> : <EmptyState icon={<Layers className="size-6" />} title="Elegí un desarrollo">Acá vas a entender una funcionalidad sin leer todo el análisis: ticket, rama, plan abreviado, diagrama y cómo debería verse.</EmptyState>}
        </div>
      </div>
    </>
  );
};

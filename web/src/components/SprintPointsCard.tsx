import { ExternalLink, Flag } from 'lucide-react';
import { api } from '../lib/api';
import type { SprintPointsReport } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { Tooltip } from './Tooltip';

const STATE_LABEL = { approved: 'Entregado', review: 'En revisión', other: 'En curso' } as const;

/**
 * Los SP de mis tickets del sprint actual, separados: los ya integrados o aprobados (entregados de verdad), los que están en revisión
 * y los que siguen en curso. No toca el promedio semanal de arriba, que se calcula con otro criterio (`redmine.doneStatuses`).
 */
export const SprintPointsCard = () => {
  const report = useAsync(() => api.get<SprintPointsReport>('/api/redmine/sprint-points'));
  if (report.loading) return <Skeleton className="mb-5 h-32" />;
  if (report.error || !report.data) return <p className="mb-5 text-sm text-muted">SP del sprint: {report.error}</p>;
  const { sprint, points } = report.data;
  if (!sprint || !points) return <p className="mb-5 text-sm text-muted">No se encontró el sprint actual: sin él no se pueden separar los SP.</p>;
  const total = Math.max(1, points.planned);
  const segments = [
    { key: 'approved', value: points.approved, className: 'bg-success' },
    { key: 'review', value: points.review, className: 'bg-[rgb(244_114_182)]' },
    { key: 'other', value: points.other, className: 'bg-surface-3' },
  ];

  return (
    <Card
      className="mb-5"
      title={<span className="inline-flex items-center gap-2"><Flag className="size-5 text-accent" aria-hidden />Mi sprint actual</span>}
      action={
        <div className="flex items-center gap-2">
          <Tooltip content={`Entregado = tickets en: ${report.data.approvedStatuses.join(', ')}. En revisión = ${report.data.reviewStatuses.join(', ')}. Es aparte del promedio semanal.`} width={340}><Badge tone="neutral">¿qué cuenta?</Badge></Tooltip>
          <a href={sprint.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-accent hover:underline" aria-label={`Abrir el sprint: ${sprint.subject}`}>Abrir<ExternalLink className="size-4" aria-hidden /></a>
        </div>
      }
    >
      <p className="mb-3 text-sm text-muted">{sprint.subject.replace(/^Sprint\s*/i, 'Sprint ')}</p>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3" data-testid="sprint-points">
        <div><div className="text-3xl font-semibold text-success" data-testid="sprint-approved">{points.approved}</div><div className="text-sm text-muted">SP entregados (integrados o aprobados)</div></div>
        <div><div className="text-3xl font-semibold" style={{ color: 'rgb(244 114 182)' }} data-testid="sprint-review">{points.review}</div><div className="text-sm text-muted">SP en revisión</div></div>
        <div><div className="text-3xl font-semibold">{points.other}</div><div className="text-sm text-muted">SP en curso</div></div>
        <div><div className="text-xl font-semibold text-muted">{points.planned}</div><div className="text-sm text-muted">SP planificados</div></div>
      </div>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${points.approved} entregados, ${points.review} en revisión y ${points.other} en curso de ${points.planned} SP`}>
        {segments.map((segment) => <div key={segment.key} className={segment.className} style={{ width: `${(segment.value / total) * 100}%` }} />)}
      </div>
      {points.withoutSp > 0 && <p className="mt-3 text-sm text-warning">{points.withoutSp} ticket{points.withoutSp === 1 ? '' : 's'} del sprint sin “[N SP]” en el título: no suma{points.withoutSp === 1 ? '' : 'n'}.</p>}
      <ul className="mt-3 space-y-1 text-sm">
        {points.tickets.filter((ticket) => ticket.state !== 'other' || ticket.sp !== null).map((ticket) => (
          <li key={ticket.id} className="flex items-baseline gap-2"><span className="font-mono text-accent">#{ticket.id}</span><span className="min-w-0 flex-1 truncate">{ticket.title}</span><span className="text-muted">{ticket.sp ?? '—'} SP · {STATE_LABEL[ticket.state]} ({ticket.status})</span></li>
        ))}
      </ul>
    </Card>
  );
};

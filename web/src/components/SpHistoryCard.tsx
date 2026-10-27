import { TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import type { SpHistory } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { Tooltip } from './Tooltip';

const weekLabel = (weekStart: string, index: number) => (index === 0 ? 'Esta semana' : index === 1 ? 'Semana pasada' : `Semana del ${new Date(`${weekStart}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`);

/** Story points entregados en las últimas 4 semanas y su promedio. */
export const SpHistoryCard = () => {
  const history = useAsync(() => api.get<SpHistory>('/api/redmine/sp-history'));
  if (history.loading) return <Skeleton className="mb-5 h-32" />;
  if (history.error || !history.data) return <p className="mb-5 text-sm text-muted">Historial de SP: {history.error}</p>;
  const data = history.data;
  const max = Math.max(1, ...data.weeks.map((week) => week.sp));
  const ordered = [...data.weeks].reverse();

  return (
    <Card
      className="mb-5"
      title={<span className="inline-flex items-center gap-2"><TrendingUp className="size-5 text-accent" aria-hidden />Story points por semana</span>}
      action={
        <div className="flex items-center gap-2">
          <Tooltip content={`SP de los tickets que llegaron por primera vez a: ${data.doneStatuses.join(', ')}. Se leen del historial de cambios de Redmine.`} width={340}><Badge tone="neutral">¿qué cuenta?</Badge></Tooltip>
          {data.source === 'saved' && <Badge tone="warning">dato guardado (Redmine no respondió)</Badge>}
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-8">
        <div className="flex h-28 items-end gap-3" role="img" aria-label="SP entregados por semana">
          {ordered.map((week, position) => {
            const index = data.weeks.length - 1 - position;
            return (
              <Tooltip key={week.weekStart} width={300} content={<><div className="mb-1 font-semibold">{weekLabel(week.weekStart, index)} · {week.sp} SP</div>{week.tickets.length === 0 ? <p className="text-muted">Sin entregas.</p> : <ul className="space-y-1">{week.tickets.map((ticket) => <li key={ticket.id}><span className="font-mono text-accent">#{ticket.id}</span> {ticket.title} <span className="text-muted">({ticket.sp === null ? 'sin SP en el título' : `${ticket.sp} SP`})</span></li>)}</ul>}</>}>
                <div className="flex w-20 flex-col items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold">{week.sp}</span>
                  <div className="flex h-20 w-full items-end overflow-hidden rounded-lg bg-surface-3"><div className={cn('w-full rounded-lg transition-all', index === 0 ? 'bg-accent/50' : 'bg-accent-strong')} style={{ height: `${Math.max(week.sp ? 8 : 0, (week.sp / max) * 100)}%` }} /></div>
                  {week.withoutSp > 0 && <span className="rounded-md bg-warning/15 px-1.5 text-sm text-warning">+{week.withoutSp} sin SP</span>}
                  <span className="text-center text-sm leading-tight text-muted">{index === 0 ? 'Esta (en curso)' : weekLabel(week.weekStart, index).replace('Semana del ', '')}</span>
                </div>
              </Tooltip>
            );
          })}
        </div>
        <div className="space-y-3">
          <div><div className="text-3xl font-semibold text-accent">{data.average}</div><div className="text-sm text-muted">SP por semana, promedio de las 4</div></div>
          {data.weeks.some((week) => week.withoutSp > 0) && <p className="max-w-56 text-sm text-warning">Hay tickets entregados sin “[N SP]” en el título: no se pueden sumar. Pasá el mouse por una barra para verlos.</p>}
          {data.averageClosed !== null && <div><div className="text-xl font-semibold">{data.averageClosed}</div><div className="text-sm text-muted">promedio sin la semana en curso</div></div>}
        </div>
      </div>
    </Card>
  );
};

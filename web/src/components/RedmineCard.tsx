import { CalendarClock, ExternalLink, Gauge, Layers3, Timer, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/tickets';
import type { RedmineIssue } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge, toneOf } from './Badge';
import { Card } from './Card';
import { Skeleton } from './Skeleton';

const hours = (value: number | null) => (value === null ? '—' : `${value % 1 === 0 ? value : value.toFixed(1)} h`);
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', ...(value.length > 10 ? {} : { timeZone: 'UTC' }) }) : '—');

const Fact = ({ icon: Icon, label, children }: { icon: typeof Timer; label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <Icon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
    <div className="min-w-0">
      <div className="text-sm text-muted">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  </div>
);

/** Datos en vivo del ticket desde Redmine (solo lectura). Si no hay API key, se oculta sin molestar. */
export const RedmineCard = ({ ticket }: { ticket: string | null }) => {
  const issue = useAsync(() => (ticket ? api.get<RedmineIssue>(`/api/redmine/issues/${ticket}`) : Promise.reject(new Error('sin ticket'))));
  if (!ticket) return null;
  if (issue.loading) return <Skeleton className="mb-6 h-40" />;
  if (issue.error || !issue.data) {
    return <p className="mb-6 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">Redmine: {issue.error}</p>;
  }
  const data = issue.data;
  const progress = data.estimatedHours ? Math.min(100, Math.round(((data.spentHours ?? 0) / data.estimatedHours) * 100)) : null;

  return (
    <Card
      className="mb-6"
      title={<span className="inline-flex items-center gap-3">Redmine <Badge tone={data.statusClosed ? 'neutral' : toneOf(data.status)}>{data.status}</Badge></span>}
      action={<a href={data.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">Abrir #{data.id} <ExternalLink className="size-4" aria-hidden /></a>}
    >
      <p className="mb-4 font-medium leading-snug">{data.title}</p>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <Fact icon={UserRound} label="Asignado a">{data.assignedTo ?? 'Sin asignar'}<span className="block text-sm font-normal text-muted">Autor: {data.author ?? '—'}</span></Fact>
        <Fact icon={Gauge} label="Story points y tipo">{data.storyPoints !== null ? `${data.storyPoints} SP` : 'Sin SP'}<span className="block text-sm font-normal text-muted">{data.tracker} · prioridad {data.priority}</span></Fact>
        <Fact icon={Timer} label="Horas (gastadas / estimadas)">{hours(data.spentHours)} / {hours(data.estimatedHours)}
          {progress !== null && <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-accent" style={{ width: `${progress}%` }} /></span>}
        </Fact>
        <Fact icon={CalendarClock} label="Fechas">Inicio {day(data.startDate)}<span className="block text-sm font-normal text-muted">Actualizado {timeAgo(Date.parse(data.updatedOn))}{data.dueDate ? ` · vence ${day(data.dueDate)}` : ''}</span></Fact>
      </div>
      {(data.module || data.relations > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Layers3 className="size-4" aria-hidden />{data.module && <Badge tone="accent">{data.module}</Badge>}{data.relations > 0 && <Badge>{data.relations} relaciones</Badge>}<Badge>{data.project}</Badge>
        </div>
      )}
      {data.lastNotes.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 text-sm font-medium">Últimos comentarios</div>
          <ul className="space-y-2.5">
            {data.lastNotes.map((note, index) => (
              <li key={index} className="rounded-lg bg-surface-2 px-3.5 py-2.5 text-sm">
                <span className="font-medium">{note.user}</span> <span className="text-muted">· {timeAgo(Date.parse(note.date))}</span>
                <p className="mt-1 whitespace-pre-wrap text-muted">{note.notes}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};

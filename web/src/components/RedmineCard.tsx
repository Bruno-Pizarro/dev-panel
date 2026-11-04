import { CalendarClock, ChevronDown, ExternalLink, FileText, Gauge, Layers3, Timer, UserRound } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { textileToMarkdown } from '../lib/textile';
import { useReloadOn } from '../lib/hooks';
import { activeTicket } from '../lib/qaTicket';
import { timeAgo } from '../lib/tickets';
import type { RedmineIssue } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge, toneOf } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { Linkified } from './Linkified';
import { Markdown } from './Markdown';
import { Modal } from './Modal';
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

/** Datos en vivo de un ticket de Redmine (solo lectura). Si no hay API key, se oculta sin molestar. */
const RedmineIssueCard = ({ ticket, refreshKey = 0, header }: { ticket: string | null; refreshKey?: number; header?: React.ReactNode }) => {
  const [notesOpen, setNotesOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  // Tras "Actualizar" se pide con `fresh=1`: el servidor se salta lo que tenía guardado de Redmine.
  const issue = useAsync(() => (ticket ? api.get<RedmineIssue>(`/api/redmine/issues/${ticket}${refreshKey > 0 ? '?fresh=1' : ''}`) : Promise.reject(new Error('sin ticket'))));
  useReloadOn(refreshKey, issue.reload);
  if (!ticket) return null;
  if (issue.loading && !issue.data) return <Skeleton className="mb-6 h-40" />;
  if (issue.error || !issue.data) {
    return <p className="mb-6 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">Redmine: {issue.error}</p>;
  }
  const data = issue.data;
  const issueBase = data.url.replace(/\/\d+$/, '');
  const progress = data.estimatedHours ? Math.min(100, Math.round(((data.spentHours ?? 0) / data.estimatedHours) * 100)) : null;

  return (
    <Card
      className="mb-6"
      title={<span className="inline-flex items-center gap-3">Redmine <Badge tone={data.statusClosed ? 'neutral' : toneOf(data.status)}>{data.status}</Badge></span>}
      action={<a href={data.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">Abrir #{data.id} <ExternalLink className="size-4" aria-hidden /></a>}
    >
      {header}
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
      {data.description && (
        <div className="mt-5 border-t border-line pt-4">
          <Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => setDescriptionOpen(true)}>Leer la descripción completa</Button>
          <Modal open={descriptionOpen} onClose={() => setDescriptionOpen(false)} size="screen" title={`#${data.id} · ${data.title}`}>
            <div className="min-h-0 flex-1 overflow-y-auto pr-2"><Markdown source={textileToMarkdown(data.description)} /></div>
          </Modal>
        </div>
      )}
      {data.lastNotes.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <button type="button" onClick={() => setNotesOpen(!notesOpen)} aria-expanded={notesOpen} className="flex w-full items-center gap-2 text-left text-sm font-medium hover:text-accent">
            <ChevronDown className={cn('size-4 transition-transform', !notesOpen && '-rotate-90')} aria-hidden />
            Últimos comentarios <span className="text-muted">({data.lastNotes.length})</span>
          </button>
          {notesOpen && <ul className="mt-3 space-y-2.5">
            {data.lastNotes.map((note, index) => (
              <li key={index} className="rounded-lg bg-surface-2 px-3.5 py-2.5 text-sm">
                <span className="font-medium">{note.user}</span> <span className="text-muted">· {timeAgo(Date.parse(note.date))}</span>
                <p className="mt-1 whitespace-pre-wrap text-muted"><Linkified text={note.notes} issueBaseUrl={issueBase} /></p>
              </li>
            ))}
          </ul>}
        </div>
      )}
    </Card>
  );
};

/**
 * El ticket de Redmine con su ticket de QA: si el ticket tiene subtareas de tipo Control QA se puede cambiar entre los dos
 * (cada uno con su descripción y comentarios). En un ticket de solo revisión se abre primero el de QA.
 */
export const RedmineCard = ({ ticket, refreshKey = 0, preferQa = false }: { ticket: string | null; refreshKey?: number; preferQa?: boolean }) => {
  const main = useAsync(() => (ticket ? api.get<RedmineIssue>(`/api/redmine/issues/${ticket}`) : Promise.reject(new Error('sin ticket'))));
  useReloadOn(refreshKey, main.reload);
  const qa = main.data?.qaTickets ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  // La elección del usuario manda; si no eligió, un ticket de solo revisión empieza en su QA.
  const active = activeTicket(ticket, qa.map((item) => item.id), chosen, preferQa);
  const switcher = qa.length > 0 ? (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Ticket de Redmine">
      {[{ id: ticket!, label: `Ticket #${ticket}` }, ...qa.map((item) => ({ id: String(item.id), label: `QA #${item.id}` }))].map((option) => (
        <button key={option.id} type="button" role="tab" aria-selected={active === option.id} onClick={() => setChosen(option.id)} className={cn('h-8 rounded-full border px-3.5 text-sm font-medium transition-colors', active === option.id ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg')}>{option.label}</button>
      ))}
    </div>
  ) : null;
  return <RedmineIssueCard key={active} ticket={active} refreshKey={refreshKey} header={switcher} />;
};

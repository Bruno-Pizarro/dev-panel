import { Bell, CalendarClock, Check, ExternalLink, Flag, GitPullRequest, ListChecks, MessageSquare, PartyPopper, RefreshCw, X, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';
import { useStoredState } from '../lib/hooks';
import type { HomeNoticesState } from '../lib/useHomeNotices';
import type { HomeNotice, NoticeKind } from '../lib/types';
import { Button } from './Button';
import { Card } from './Card';
import { RemindersModal } from './RemindersModal';
import { Skeleton } from './Skeleton';
import { api } from '../lib/api';

const KIND_ICONS: Record<NoticeKind, LucideIcon> = { due: CalendarClock, mr: GitPullRequest, review: MessageSquare, sprint: Flag, holiday: PartyPopper, routine: ListChecks, reminder: Bell };
const KIND_LABELS: Record<NoticeKind, string> = { due: 'Vencimiento', mr: 'Merge request', review: 'Comentario nuevo', sprint: 'Sprint', holiday: 'Feriado', routine: 'Rutina', reminder: 'Recordatorio' };

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

interface Dismissed {
  date: string;
  ids: string[];
}

const Notice = ({ notice, onDismiss, onDone }: { notice: HomeNotice; onDismiss: () => void; onDone: (id: string) => void }) => {
  const Icon = KIND_ICONS[notice.kind];
  const external = notice.link !== null && !notice.link.startsWith('/');
  return (
    <li className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', notice.level === 'important' ? 'border-warning/50 bg-warning/5' : 'border-line bg-surface-2')} data-testid="home-notice" data-level={notice.level}>
      <Icon className={cn('mt-0.5 size-5 shrink-0', notice.level === 'important' ? 'text-warning' : 'text-accent')} aria-label={KIND_LABELS[notice.kind]} />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{notice.title}</p>
        <p className="mt-0.5 break-words text-sm text-muted">{notice.detail}</p>
      </div>
      {notice.reminderId && <Button className="h-8 shrink-0" icon={<Check className="size-4" />} onClick={() => onDone(notice.reminderId!)}>Hecho</Button>}
      {notice.link && (external
        ? <a href={notice.link} target="_blank" rel="noreferrer noopener" className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm text-accent hover:bg-surface-3" aria-label={`Abrir: ${notice.title}`}><ExternalLink className="size-4" aria-hidden />Abrir</a>
        : <Link to={notice.link} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm text-accent hover:bg-surface-3">Ir</Link>)}
      <button type="button" onClick={onDismiss} aria-label="Ocultar por hoy" title="Ocultar por hoy" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-fg"><X className="size-4" aria-hidden /></button>
    </li>
  );
};

/** "Para tener en cuenta": los avisos del día. Se revisan una vez por día en el servidor; abrir el Inicio de nuevo solo lee lo guardado. */
export const HomeNotices = ({ state }: { state: HomeNoticesState }) => {
  const { report, failed, busy, load } = state;
  const [dismissed, setDismissed] = useStoredState<Dismissed>('dev-panel.home.dismissed', { date: today(), ids: [] });

  const [remindersOpen, setRemindersOpen] = useState(false);
  const markDone = (id: string) => void api.put(`/api/reminders/${id}`, { done: true }).catch(() => undefined);
  const hidden = useMemo(() => (dismissed.date === today() ? dismissed.ids : []), [dismissed]);
  const visible = useMemo(() => [...(report?.reminders ?? []), ...(report?.routines ?? []), ...(report?.notices ?? [])].filter((notice) => !hidden.includes(notice.id)).sort((a, b) => (a.level === b.level ? 0 : a.level === 'important' ? -1 : 1)), [report, hidden]);
  const hiddenCount = (report ? report.reminders.length + report.routines.length + report.notices.length : 0) - visible.length;
  const checkedAt = report ? new Date(report.generatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

  return (
    <Card
      className="mb-6"
      title="Para tener en cuenta"
      action={
        <div className="flex items-center gap-3">
          {report && <span className="hidden text-sm text-muted sm:inline">{report.fromCache ? 'Revisado' : 'Recién revisado'} hoy a las {checkedAt}</span>}
          <Button className="h-9" icon={<Bell className="size-4" />} onClick={() => setRemindersOpen(true)} title="Ver y agregar recordatorios">Recordatorios</Button>
          <Button className="h-9" icon={<RefreshCw className={cn('size-4', busy && 'animate-spin')} />} disabled={busy} onClick={() => load(true)} title="Vuelve a consultar Redmine, GitLab y los feriados (se revisan solos una vez por día)">Volver a revisar</Button>
        </div>
      }
    >
      {failed ? <p className="text-danger">{failed}</p> : !report ? <Skeleton className="h-24" /> : (
        <div className="space-y-3">
          {visible.length === 0 ? <p className="text-muted" data-testid="home-notices-empty">Sin avisos por hoy: todo tranquilo.{hiddenCount > 0 ? ` (${hiddenCount} oculto${hiddenCount === 1 ? '' : 's'} por hoy)` : ''}</p> : (
            <ul className="space-y-2">{visible.map((notice) => <Notice key={notice.id} notice={notice} onDone={markDone} onDismiss={() => setDismissed({ date: today(), ids: [...hidden, notice.id] })} />)}</ul>
          )}
          {hiddenCount > 0 && visible.length > 0 && <button type="button" className="text-sm text-muted hover:text-fg hover:underline" onClick={() => setDismissed({ date: today(), ids: [] })}>Mostrar los {hiddenCount} ocultos</button>}
          {report.errors.length > 0 && (
            <ul className="space-y-1 border-t border-line pt-3">{report.errors.map((error) => <li key={error.source} className="text-sm text-warning">No se pudo revisar {error.source}: {error.message}</li>)}</ul>
          )}
        </div>
      )}
      <RemindersModal open={remindersOpen} onClose={() => setRemindersOpen(false)} />
    </Card>
  );
};

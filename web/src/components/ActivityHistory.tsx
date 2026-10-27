import { BookOpenCheck, FileSearch, GitCommitHorizontal, GitMerge, ListChecks, Calculator, UploadCloud, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { pillStyle, serviceColor } from '../lib/colors';
import type { ActivityEvent } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Card } from './Card';
import { Chip } from './Chip';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

const TYPES: Record<ActivityEvent['type'], { label: string; icon: LucideIcon; rgb: string }> = {
  commit: { label: 'Commits', icon: GitCommitHorizontal, rgb: '129 140 248' },
  push: { label: 'Push', icon: UploadCloud, rgb: '45 212 191' },
  mr: { label: 'Merge requests', icon: GitMerge, rgb: '167 139 250' },
  review: { label: 'Revisiones', icon: FileSearch, rgb: '251 146 60' },
  analysis: { label: 'Análisis', icon: BookOpenCheck, rgb: '99 179 237' },
  estimation: { label: 'Estimaciones', icon: Calculator, rgb: '250 204 21' },
  test: { label: 'Pruebas', icon: ListChecks, rgb: '74 222 128' },
};

const dayLabel = (day: string, today: string): string => {
  const date = new Date(`${day}T12:00:00`);
  const name = date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return day === today ? `Hoy · ${name}` : name.charAt(0).toUpperCase() + name.slice(1);
};

/** Qué se hizo en los últimos 5 días, leído de git y de la base de conocimiento. Solo lectura. */
export const ActivityHistory = () => {
  const activity = useAsync(() => api.get<{ keepDays: number; days: Record<string, ActivityEvent[]> }>('/api/activity'));
  const [hidden, setHidden] = useState<Set<ActivityEvent['type']>>(new Set());
  const days = useMemo(() => Object.entries(activity.data?.days ?? {}), [activity.data]);
  const today = days[0]?.[0] ?? '';
  const counts = useMemo(() => {
    const result: Partial<Record<ActivityEvent['type'], number>> = {};
    for (const [, events] of days) for (const event of events) result[event.type] = (result[event.type] ?? 0) + 1;
    return result;
  }, [days]);

  if (activity.loading) return <Skeleton className="h-96" />;
  if (activity.error) return <p className="text-danger">{activity.error}</p>;
  const total = days.reduce((sum, [, events]) => sum + events.length, 0);
  if (!total) return <EmptyState icon={<BookOpenCheck className="size-6" />} title="Sin actividad en los últimos 5 días">Los commits y push se leen de git; análisis, pruebas, reviews y MRs, de las carpetas de la base de conocimiento.</EmptyState>;

  return (
    <div className="space-y-5">
      <p className="text-muted">Solo lectura, de git y de la base de conocimiento. Se guardan {activity.data!.keepDays} días: lo más viejo se borra solo.</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TYPES) as Array<ActivityEvent['type']>).filter((type) => counts[type]).map((type) => (
          <Chip key={type} color={TYPES[type].rgb} selected={!hidden.has(type)} onToggle={() => setHidden((previous) => { const next = new Set(previous); if (next.has(type)) next.delete(type); else next.add(type); return next; })}>{TYPES[type].label} <span className="opacity-70">{counts[type]}</span></Chip>
        ))}
      </div>
      {days.map(([day, events]) => {
        const visible = events.filter((event) => !hidden.has(event.type));
        return (
          <Card key={day} title={dayLabel(day, today)} action={<Badge>{visible.length} {visible.length === 1 ? 'evento' : 'eventos'}</Badge>}>
            {visible.length === 0 ? <p className="text-muted">Sin actividad.</p> : (
              <ul className="divide-y divide-line">
                {visible.map((event) => {
                  const info = TYPES[event.type];
                  return (
                    <li key={event.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border" style={pillStyle(info.rgb, true)}><info.icon className="size-4" aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <div className="break-words">{event.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                          <span>{new Date(event.at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                          {event.repo && <span className="rounded-md border px-1.5 font-mono" style={pillStyle(serviceColor(event.repo))}>{event.repo}</span>}
                          {event.detail && <span className="font-mono">{event.detail}</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
};

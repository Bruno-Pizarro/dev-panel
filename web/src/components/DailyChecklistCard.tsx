import { Check, ExternalLink, ListChecks } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import type { DailyChecklist } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { itemUrgency, URGENCY_RGB } from '../lib/workday';
import { Badge } from './Badge';
import { Card } from './Card';
import { useToast } from './Toast';

/**
 * Tareas que se repiten todos los días (marcar entrada, salida, cargar horas): se tildan por día y arrancan limpias cada mañana.
 * Con horarios configurados, entrada y salida pasan de ámbar a naranja y rojo cuanto más tarde sea; "cargar horas" es rojo
 * apenas marcaste la salida y no cargaste. El enlace de marcación aparece como botón debajo.
 */
export const DailyChecklistCard = () => {
  const toast = useToast();
  const list = useAsync(() => api.get<DailyChecklist>('/api/checklist/daily'));
  // Los colores dependen de la hora: se recalculan cada minuto.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const data = list.data;
  if (!data) return null;
  const done = data.items.filter((item) => item.done).length;
  const workday = data.workday ?? { entry: '', exit: '', punchUrl: '' };

  const toggle = async (id: string, value: boolean) => {
    try {
      await api.put('/api/checklist/daily', { id, done: value, date: data.date });
      list.reload();
    } catch (error) {
      toast('error', (error as Error).message);
    }
  };

  return (
    <Card className="mb-6" title={<span className="inline-flex items-center gap-3"><ListChecks className="size-5 text-accent" aria-hidden />Todos los días</span>} action={<Badge tone={done === data.items.length ? 'success' : 'warning'}>{done}/{data.items.length}</Badge>}>
      <ul className="flex flex-wrap gap-3">
        {data.items.map((item) => {
          const { urgency, note } = itemUrgency(item.id, item.done, data.items, workday, now);
          const rgb = urgency === 'none' ? null : URGENCY_RGB[urgency];
          return (
            <li key={item.id}>
              <label
                title={note ? `${item.label}: ${note}` : undefined}
                style={rgb ? { borderColor: `rgb(${rgb} / 0.6)`, backgroundColor: `rgb(${rgb} / 0.12)`, color: `rgb(${rgb})` } : undefined}
                className={cn('flex h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 transition-colors', item.done ? 'border-success/40 bg-success/10 text-success' : !rgb && 'border-line bg-surface-2 hover:border-accent/40')}
              >
                <input type="checkbox" className="peer sr-only" checked={item.done} onChange={(event) => toggle(item.id, event.target.checked)} />
                <span className="flex size-5 items-center justify-center rounded-md border border-current peer-focus-visible:ring-2 peer-focus-visible:ring-accent/70">{item.done && <Check className="size-4" aria-hidden />}</span>
                <span className={cn('font-medium', item.done && 'line-through opacity-80')}>{item.label}</span>
                {note && <span className="text-sm opacity-90">· {note}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {workday.punchUrl && (
        <a href={workday.punchUrl} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3.5 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent">
          <ExternalLink className="size-4" aria-hidden />Ir a marcar
        </a>
      )}
    </Card>
  );
};

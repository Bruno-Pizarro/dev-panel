import { Check, ListChecks } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import type { DailyChecklist } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Card } from './Card';
import { useToast } from './Toast';

/** Tareas que se repiten todos los días (marcar entrada, salida, cargar horas…): se tildan por día y arrancan limpias cada mañana. */
export const DailyChecklistCard = () => {
  const toast = useToast();
  const list = useAsync(() => api.get<DailyChecklist>('/api/checklist/daily'));
  const data = list.data;
  if (!data) return null;
  const done = data.items.filter((item) => item.done).length;

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
        {data.items.map((item) => (
          <li key={item.id}>
            <label className={cn('flex h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 transition-colors', item.done ? 'border-success/40 bg-success/10 text-success' : 'border-line bg-surface-2 hover:border-accent/40')}>
              <input type="checkbox" className="peer sr-only" checked={item.done} onChange={(event) => toggle(item.id, event.target.checked)} />
              <span className="flex size-5 items-center justify-center rounded-md border border-current peer-focus-visible:ring-2 peer-focus-visible:ring-accent/70">{item.done && <Check className="size-4" aria-hidden />}</span>
              <span className={cn('font-medium', item.done && 'line-through opacity-80')}>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
};

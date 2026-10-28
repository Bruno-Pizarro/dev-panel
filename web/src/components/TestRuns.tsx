import { Check } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { CONCLUSIONS } from '../lib/conclusion';
import { cn } from '../lib/cn';
import type { Conclusion, TestRunState, TicketMeta } from '../lib/types';
import { useReloadOn } from '../lib/hooks';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Card } from './Card';
import { Chip } from './Chip';
import { useToast } from './Toast';

interface StateResponse {
  items: Array<{ id: string; label: string }>;
  runs: Record<string, TestRunState>;
}

/** Cada tanda de pruebas tiene su propio checklist (actualizar ticket, subir comentarios…) y su conclusión. */
export const TestRuns = ({ dir, runs, onChanged, refreshKey = 0 }: { dir: string; runs: NonNullable<TicketMeta['pruebas']>; onChanged?: () => void; refreshKey?: number }) => {
  const toast = useToast();
  const state = useAsync(() => api.get<StateResponse>(`/api/tickets/${encodeURIComponent(dir)}/test-state`));
  const [local, setLocal] = useState<Record<string, TestRunState>>({});
  // "Actualizar": se descarta lo local y se vuelve a leer lo guardado.
  useReloadOn(refreshKey, () => (setLocal({}), state.reload()));
  const data = state.data;
  if (!data) return null;

  const current = (index: number): TestRunState => local[index] ?? data.runs[String(index)] ?? { items: {}, conclusion: null, updatedAt: null };
  const save = async (index: number, patch: { item?: { id: string; done: boolean }; conclusion?: Conclusion }) => {
    try {
      const next = await api.put<TestRunState>(`/api/tickets/${encodeURIComponent(dir)}/test-state/${index}`, patch);
      setLocal((previous) => ({ ...previous, [index]: next }));
      // El listado lateral (conclusión y checklist por ticket) se actualiza al instante, sin recargar la página.
      onChanged?.();
    } catch (error) {
      toast('error', (error as Error).message);
    }
  };

  return (
    <Card title="Pruebas realizadas">
      <ul className="space-y-4">
        {runs.map((run, index) => ({ run, index })).reverse().map(({ run, index }) => {
          const saved = current(index);
          const conclusion: Conclusion = saved.conclusion ?? (CONCLUSIONS.find((item) => item.id === run.conclusion)?.id ?? 'sin-conclusion');
          const done = data.items.filter((item) => saved.items[item.id]).length;
          return (
            <li key={index} className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-mono text-sm text-muted">{run.fecha ?? '—'}</span>
                {run.resultado && <Badge tone="info">{run.resultado}</Badge>}
                <Badge tone={done === data.items.length ? 'success' : 'warning'}>{done}/{data.items.length} pasos</Badge>
                <span className="min-w-0 flex-1" />
                <span className="text-sm text-muted">Tanda {index + 1} de {runs.length}</span>
              </div>
              {run.resumen && <p className="mt-2">{run.resumen}</p>}
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-medium">Checklist de esta tanda</div>
                  <ul className="space-y-1.5">
                    {data.items.map((item) => (
                      <li key={item.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-3">
                          <input type="checkbox" className="peer sr-only" checked={saved.items[item.id] === true} onChange={(event) => save(index, { item: { id: item.id, done: event.target.checked } })} />
                          <span className="flex size-5 items-center justify-center rounded-md border border-line bg-bg peer-checked:border-accent peer-checked:bg-accent-strong peer-focus-visible:ring-2 peer-focus-visible:ring-accent/70 [&>svg]:hidden peer-checked:[&>svg]:block"><Check className="size-4 text-white" aria-hidden /></span>
                          <span className={cn(saved.items[item.id] && 'text-muted line-through')}>{item.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium">Estado de esta tanda</div>
                  <div className="flex flex-wrap gap-2">
                    {CONCLUSIONS.map((item) => <Chip key={item.id} selected={conclusion === item.id} onToggle={() => save(index, { conclusion: item.id })}>{item.label}</Chip>)}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

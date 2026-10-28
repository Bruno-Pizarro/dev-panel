import { Check, ClipboardList, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import type { ManualTests as ManualTestsData } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';

/** Checklist de pruebas manuales: los casos vienen de `pruebasManuales` en ticket.json y se pueden sumar propios; lo tildado vive en el panel. */
export const ManualTests = ({ dir, onChanged }: { dir: string; onChanged?: () => void }) => {
  const toast = useToast();
  const base = `/api/tickets/${encodeURIComponent(dir)}/manual-tests`;
  const state = useAsync(() => api.get<ManualTestsData>(base));
  const [local, setLocal] = useState<ManualTestsData | null>(null);
  const [text, setText] = useState('');
  const [expected, setExpected] = useState('');
  const data = local ?? state.data;

  const run = async (action: () => Promise<ManualTestsData>) => {
    try {
      setLocal(await action());
      onChanged?.();
    } catch (error) {
      toast('error', (error as Error).message);
    }
  };
  const add = () => text.trim() && run(async () => {
    const next = await api.post<ManualTestsData>(base, { caso: text, ...(expected.trim() ? { esperado: expected } : {}) });
    setText('');
    setExpected('');
    return next;
  });

  if (!data) return state.error ? <p className="text-danger">{state.error}</p> : <Skeleton className="h-64" />;

  // Se agrupa por `grupo` conservando el orden; los casos propios van al final, en su propio grupo.
  const groups = new Map<string, typeof data.items>();
  for (const item of data.items) {
    const key = item.source === 'panel' ? 'Agregados por mí' : item.grupo ?? 'Casos a probar';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="space-y-5">
      <Card
        title="Pruebas manuales"
        action={
          <span className="inline-flex items-center gap-3">
            <Badge tone={data.total > 0 && data.done === data.total ? 'success' : 'warning'}>{data.done}/{data.total} probados</Badge>
            {data.done > 0 && <Button className="h-9" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => run(() => api.post<ManualTestsData>(`${base}/reset`, {}))}>Reiniciar</Button>}
          </span>
        }
      >
        {data.total === 0 ? (
          <EmptyState icon={<ClipboardList className="size-6" />} title="Sin casos todavía">Este ticket no trae <span className="font-mono">pruebasManuales</span> en su <span className="font-mono">ticket.json</span>. Podés escribir tus propios casos abajo.</EmptyState>
        ) : (
          <div className="space-y-6">
            {[...groups.entries()].map(([group, items]) => (
              <section key={group}>
                <h3 className="mb-2 text-sm font-medium text-muted">{group}</h3>
                <ul className="space-y-1">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-start gap-1">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                        <input type="checkbox" className="peer sr-only" checked={item.done} onChange={(event) => run(() => api.put<ManualTestsData>(`${base}/${item.id}`, { done: event.target.checked }))} />
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-line bg-bg peer-checked:border-accent peer-checked:bg-accent-strong peer-focus-visible:ring-2 peer-focus-visible:ring-accent/70 [&>svg]:hidden peer-checked:[&>svg]:block"><Check className="size-4 text-white" aria-hidden /></span>
                        <span className="min-w-0">
                          <span className={cn('block', item.done && 'text-muted line-through')}>{item.caso}</span>
                          {item.esperado && <span className="mt-0.5 block text-sm text-muted">Esperado: {item.esperado}</span>}
                        </span>
                      </label>
                      {item.source === 'panel' && (
                        <button type="button" aria-label="Borrar este caso" title="Borrar este caso" onClick={() => run(() => api.del<ManualTestsData>(`${base}/${item.id}`))} className="mt-1.5 rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-danger"><Trash2 className="size-4" aria-hidden /></button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card title="Agregar un caso">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => (event.preventDefault(), add())}>
          <label className="min-w-64 flex-[2]">
            <span className="mb-1 block text-sm text-muted">Qué probar</span>
            <input value={text} maxLength={300} onChange={(event) => setText(event.target.value)} placeholder="Ej.: abrir el perfil desde el celular" className="h-11 w-full rounded-lg border border-line bg-bg px-3.5 text-sm outline-none placeholder:text-muted focus:border-accent/60" />
          </label>
          <label className="min-w-64 flex-[2]">
            <span className="mb-1 block text-sm text-muted">Resultado esperado (opcional)</span>
            <input value={expected} maxLength={300} onChange={(event) => setExpected(event.target.value)} placeholder="Ej.: la lista pasa a tarjetas" className="h-11 w-full rounded-lg border border-line bg-bg px-3.5 text-sm outline-none placeholder:text-muted focus:border-accent/60" />
          </label>
          <Button type="submit" variant="primary" className="h-11" icon={<Plus className="size-4" />} disabled={!text.trim()}>Agregar</Button>
        </form>
        <p className="mt-3 text-sm text-muted">Los casos que agregues acá quedan solo en el panel (no se escriben en <span className="font-mono">ticket.json</span>).</p>
      </Card>
    </div>
  );
};

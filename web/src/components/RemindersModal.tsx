import { Check, Plus, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useServerEvent } from '../lib/hooks';
import type { ReminderItem } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Button } from './Button';
import { Modal } from './Modal';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';

const whenText = (at: string | null): string => {
  if (!at) return 'sin fecha';
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return at.split('-').reverse().join('/');
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Recordatorios del panel: ver, agregar (con fecha u hora, o sin fecha como pendiente), marcar como hechos y borrar. */
export const RemindersModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const toast = useToast();
  const list = useAsync(() => api.get<{ reminders: ReminderItem[] }>('/api/reminders'));
  useServerEvent<unknown>('reminders', list.reload);
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      list.reload();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const add = () =>
    act(async () => {
      // El campo de fecha y hora del navegador da una hora local sin zona: se manda con la zona de este navegador.
      await api.post('/api/reminders', { text, at: when ? new Date(when).toISOString() : null });
      setText('');
      setWhen('');
    });

  const items = list.data?.reminders ?? [];
  return (
    <Modal open={open} title="Recordatorios" onClose={onClose} size="xl" footer={<Button onClick={onClose}>Cerrar</Button>}>
      <div className="space-y-5">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <label className="min-w-64 flex-1">
            <span className="mb-1 block text-sm font-medium">Qué hay que recordar</span>
            <input value={text} onChange={(event) => setText(event.target.value)} maxLength={200} placeholder="Ej.: Probar lo de Mariano en celular" data-testid="reminder-text" className="h-11 w-full rounded-lg border border-line bg-bg px-3.5 text-sm outline-none placeholder:text-muted focus:border-accent/60" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Cuándo (opcional)</span>
            <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} data-testid="reminder-when" className="h-11 rounded-lg border border-line bg-bg px-3.5 text-sm outline-none focus:border-accent/60" />
          </label>
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={busy} disabled={!text.trim()}>Agregar</Button>
        </form>
        <p className="text-sm text-muted">Sin fecha es un pendiente: se muestra en el Inicio hasta que lo marques como hecho. También se los podés pedir a Claude («recordame mañana probar X»).</p>
        {list.loading && !list.data ? <Skeleton className="h-24" /> : items.length === 0 ? <p className="text-muted" data-testid="reminders-empty">No hay recordatorios.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line" data-testid="reminders-list">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className={item.done ? 'min-w-0 flex-1 text-muted line-through' : 'min-w-0 flex-1'}>{item.text}</span>
                <span className="text-sm text-muted">{whenText(item.at)}</span>
                <Button className="h-9" icon={item.done ? <Undo2 className="size-4" /> : <Check className="size-4" />} disabled={busy} onClick={() => void act(() => api.put(`/api/reminders/${item.id}`, { done: !item.done }))}>{item.done ? 'Reabrir' : 'Hecho'}</Button>
                <Button variant="ghost" className="h-9" aria-label="Borrar el recordatorio" icon={<Trash2 className="size-4" />} disabled={busy} onClick={() => void act(() => api.del(`/api/reminders/${item.id}`))} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};

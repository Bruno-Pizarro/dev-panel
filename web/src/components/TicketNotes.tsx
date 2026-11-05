import { Eye, NotebookPen, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Markdown } from './Markdown';
import { Skeleton } from './Skeleton';

interface Note {
  text: string;
  updatedAt: string | null;
}

const MAX_NOTE = 5000;
const SAVE_AFTER_MS = 800;

/** Nota libre del ticket, solo local (pendientes, a quién esperar, qué falta probar). Se guarda sola al dejar de escribir. */
export const TicketNotes = ({ dir }: { dir: string }) => {
  const note = useAsync(() => api.get<Note>(`/api/tickets/${encodeURIComponent(dir)}/notes`));
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [editing, setEditing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!note.data || loaded.current) return;
    loaded.current = true;
    setText(note.data.text);
    setSaved(note.data.text);
    setUpdatedAt(note.data.updatedAt);
    setEditing(note.data.text === '');
  }, [note.data]);

  // Guardado automático: un momento después de la última tecla.
  useEffect(() => {
    if (!loaded.current || text === saved) return;
    const timer = window.setTimeout(() => {
      setState('saving');
      api.put<Note>(`/api/tickets/${encodeURIComponent(dir)}/notes`, { text }).then(
        (result) => (setSaved(text), setUpdatedAt(result.updatedAt), setState('idle')),
        () => setState('error'),
      );
    }, SAVE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [text, saved, dir]);

  if (note.loading && !note.data) return <Skeleton className="h-48" />;
  if (note.error) return <p className="text-danger">{note.error}</p>;
  const status = state === 'saving' ? 'Guardando…' : state === 'error' ? 'No se pudo guardar' : text !== saved ? 'Sin guardar' : updatedAt ? `Guardado ${(() => { const d = new Date(updatedAt); const pad = (n: number) => String(n).padStart(2, '0'); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; })()}` : '';
  return (
    <section className="rounded-2xl border border-line bg-surface" data-testid="ticket-notes">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><NotebookPen className="size-5 text-accent" aria-hidden />Notas del ticket</h2>
        <div className="flex items-center gap-3">
          <span className={state === 'error' ? 'text-sm text-danger' : 'text-sm text-muted'} aria-live="polite" data-testid="note-status">{status}</span>
          <span className="text-sm text-muted">{text.length}/{MAX_NOTE}</span>
          {text && <Button className="h-9" icon={editing ? <Eye className="size-4" /> : <Pencil className="size-4" />} onClick={() => setEditing(!editing)}>{editing ? 'Ver' : 'Editar'}</Button>}
        </div>
      </header>
      <div className="p-5">
        {editing || !text ? (
          <textarea value={text} onChange={(event) => setText(event.target.value.slice(0, MAX_NOTE))} spellCheck={false} placeholder={'Pendientes, a quién esperar, qué falta probar…\n(se guarda solo; admite Markdown)'} className="h-64 w-full resize-y rounded-xl border border-line bg-bg p-4 text-sm leading-6 outline-none placeholder:text-muted focus:border-accent/60" data-testid="note-text" />
        ) : (
          <Markdown source={text} />
        )}
        {!text && !editing && <EmptyState icon={<NotebookPen className="size-6" />} title="Sin notas">Escribí lo que no quieras olvidar de este ticket.</EmptyState>}
        <p className="mt-3 text-sm text-muted">Quedan solo en este panel (no van a Redmine ni a git). Claude las puede leer con la herramienta <span className="font-mono">ticket_notes</span>.</p>
      </div>
    </section>
  );
};

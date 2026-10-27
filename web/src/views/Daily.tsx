import { Bot, CalendarDays, Copy, Eye, FilePlus2, Pencil, Save, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { Markdown } from '../components/Markdown';
import { PageHeader } from '../components/PageHeader';
import { ActivityHistory } from '../components/ActivityHistory';
import { DailyChecklistCard } from '../components/DailyChecklistCard';
import { WeeklyReportCard } from '../components/WeeklyReportCard';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import type { DailyList } from '../lib/types';
import { useAsync } from '../lib/useAsync';

type Since = 'today' | 'yesterday' | 'last';
const sinceLabels: Record<Since, string> = { today: 'Desde hoy', yesterday: 'Desde ayer', last: 'Desde el último daily' };

export const Daily = () => {
  const toast = useToast();
  const list = useAsync(() => api.get<DailyList>('/api/daily'));
  const [date, setDate] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [editing, setEditing] = useState(false);
  const [since, setSince] = useState<Since>('today');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'daily' | 'historial'>('daily');

  const today = list.data?.today ?? null;
  const dates = list.data?.dates ?? [];
  const shown = date ?? today;
  const hasFile = shown ? dates.includes(shown) : false;
  const dirty = content !== saved;

  useEffect(() => {
    if (!shown || !list.data) return;
    if (!dates.includes(shown)) {
      setContent('');
      setSaved('');
      return;
    }
    api.get<{ content: string }>(`/api/daily/${shown}`).then((result) => { setContent(result.content); setSaved(result.content); setEditing(false); }, () => undefined);
    // Se recarga al cambiar de fecha o cuando cambia la lista de archivos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, list.data]);

  const generate = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ markdown: string }>('/api/daily/draft', { since });
      setContent(result.markdown);
      setEditing(true);
      toast('info', 'Borrador generado. Revisalo y guardalo.');
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!shown) return;
    setBusy(true);
    try {
      const result = await api.put<{ deleted: string[] }>(`/api/daily/${shown}`, { content });
      setSaved(content);
      toast('success', result.deleted.length ? `Guardado. Se borró el más viejo (${result.deleted.join(', ')}).` : 'Guardado.');
      list.reload();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Arma el pedido para que Claude redacte el daily: instrucciones + los datos reales de git y de la base de conocimiento. */
  const copyForClaude = async () => {
    setBusy(true);
    try {
      const source = content.trim() ? content : (await api.post<{ markdown: string }>('/api/daily/draft', { since })).markdown;
      const prompt = [
        `Redactá el daily de hoy (${shown}) para dar mi update mañana en la reunión.`,
        '',
        'Pedido:',
        '- Resumí en pocas líneas en qué se estuvo trabajando y cuánto se avanzó (por ticket).',
        '- Listá lo más relevante que se modificó o agregó en el código, por repo, sin enumerar cada archivo.',
        '- Cerrá con pendientes y bloqueos, si los hay.',
        '- Tono directo, en español, pensado para decirlo en voz alta en un minuto o dos.',
        '- Respondé únicamente con el Markdown final, con el mismo formato del borrador, para pegarlo en el panel.',
        '',
        'Datos del día (generados desde git y la base de conocimiento; completá o corregí lo que haga falta):',
        '',
        '```markdown',
        source.trim(),
        '```',
      ].join('\n');
      await navigator.clipboard.writeText(prompt);
      toast('success', 'Pedido copiado. Pegalo en la extensión de Claude y después pegá su respuesta acá (Editar).');
    } catch (error) {
      toast('error', (error as Error).message || 'No se pudo copiar.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast('success', 'Copiado al portapapeles.');
    } catch {
      toast('error', 'No se pudo copiar.');
    }
  };

  if (list.loading) return <Skeleton className="h-96" />;
  const empty = !hasFile && !content;

  return (
    <>
      <PageHeader title="Daily" description={`Resumen del día para dar el update. Se conservan los últimos ${list.data?.maxFiles ?? 5} en ${list.data?.dir ?? ''}.`} />
      <DailyChecklistCard />
      <WeeklyReportCard />
      <Tabs<'daily' | 'historial'> value={view} onChange={setView} items={[{ id: 'daily', label: 'Daily' }, { id: 'historial', label: 'Historial (5 días)' }]} />
      {view === 'historial' ? <ActivityHistory /> : (
        <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[...new Set([today, ...dates])].filter((item): item is string => Boolean(item)).map((item) => (
          <Chip key={item} selected={item === shown} onToggle={() => setDate(item)} hint={item === today ? 'Hoy' : undefined}>{item}{item === today ? ' · hoy' : ''}</Chip>
        ))}
      </div>

      <Card
        title={<span className="inline-flex items-center gap-2"><CalendarDays className="size-5 text-accent" aria-hidden />{shown}</span>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {shown === today && (
              <>
                {(['today', 'yesterday', 'last'] as const).map((value) => <Chip key={value} selected={since === value} onToggle={() => setSince(value)}>{sinceLabels[value]}</Chip>)}
                <Button icon={<Sparkles className="size-4" />} loading={busy} onClick={generate}>Generar borrador</Button>
                <Button icon={<Bot className="size-4" />} loading={busy} onClick={copyForClaude} title="Copia un pedido con los datos del día para pegarlo en la extensión de Claude">Copiar pedido para Claude</Button>
              </>
            )}
            {!empty && <Button icon={editing ? <Eye className="size-4" /> : <Pencil className="size-4" />} onClick={() => setEditing(!editing)}>{editing ? 'Ver' : 'Editar'}</Button>}
            {!empty && <Button icon={<Copy className="size-4" />} onClick={copy}>Copiar</Button>}
            {!empty && <Button variant="primary" icon={<Save className="size-4" />} loading={busy} disabled={!dirty} onClick={save}>Guardar</Button>}
          </div>
        }
      >
        {empty ? (
          <EmptyState icon={<FilePlus2 className="size-6" />} title="Todavía no hay daily para este día">
            {shown === today ? 'Generá un borrador desde tus commits y tu base de conocimiento, y completalo.' : 'No se guardó un daily en esta fecha.'}
          </EmptyState>
        ) : editing ? (
          <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} className="h-[60vh] w-full resize-y rounded-xl border border-line bg-bg p-4 font-mono text-sm leading-6 outline-none focus:border-accent/60" />
        ) : (
          <Markdown source={content} />
        )}
      </Card>
        </>
      )}
    </>
  );
};

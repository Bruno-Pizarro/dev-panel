import { ChevronDown, ClipboardCheck, ExternalLink, RefreshCw, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { writeStored } from '../lib/hooks';
import { timeAgo } from '../lib/tickets';
import type { ReviewComment, ReviewQueue, ReviewQueueItem, StartedReview } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Button } from './Button';
import { Modal } from './Modal';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';

const Comments = ({ title, comments }: { title: string; comments: ReviewComment[] }) => (
  <div>
    <h4 className="mb-1 text-sm font-semibold text-muted">{title}</h4>
    {comments.length === 0 ? <p className="text-sm text-muted">Sin comentarios.</p> : (
      <ul className="space-y-2">
        {comments.map((comment, index) => (
          <li key={index} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <div className="mb-0.5 flex items-center gap-2 text-muted"><span className="font-medium text-fg">{comment.user}</span><span>{timeAgo(Date.parse(comment.at))}</span></div>
            <p className="whitespace-pre-wrap break-words">{comment.notes}</p>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const Item = ({ item, busy, onStart }: { item: ReviewQueueItem; busy: boolean; onStart: (item: ReviewQueueItem) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-line bg-surface-2 p-4" data-testid="review-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a href={item.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-mono text-accent hover:underline">#{item.id}<ExternalLink className="size-3.5" aria-hidden /></a>
            {item.storyPoints !== null && <span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-mono text-sm font-semibold text-accent">{item.storyPoints} SP</span>}
            {item.folder && <Badge tone="info">ya tiene carpeta</Badge>}
            {!item.qa && <Badge tone="warning">sin Control QA</Badge>}
          </div>
          <h3 className="mt-1 font-medium leading-snug">{item.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" aria-hidden />{item.assignedTo ?? 'Sin asignar'}</span>
            {item.qa && <a href={item.qa.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">QA #{item.qa.id} · {item.qa.status}{item.qa.assignedTo ? ` · ${item.qa.assignedTo}` : ''}</a>}
            <span>{item.mrs.length ? `${item.mrs.length} MR${item.mrs.length === 1 ? '' : 's'}` : 'sin MRs en el ticket'}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open} icon={<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />}>{open ? 'Ocultar detalle' : 'Descripción y comentarios'}</Button>
          <Button variant="primary" disabled={busy} onClick={() => onStart(item)} icon={<ClipboardCheck className="size-4" />} title="Crea la carpeta del ticket como revisión (aparece en Pruebas como solo revisión) y copia el pedido para Claude">Hacer esta revisión</Button>
        </div>
      </div>
      {open && (
        <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-2" data-testid="review-detail">
          <div className="space-y-3">
            <div><h4 className="mb-1 text-sm font-semibold text-muted">Descripción</h4><p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">{item.description || 'Sin descripción.'}</p></div>
            <Comments title="Últimos comentarios del ticket" comments={item.comments} />
          </div>
          <div className="space-y-3">
            {item.qa ? (
              <>
                <div><h4 className="mb-1 text-sm font-semibold text-muted">Plan de pruebas (Control QA)</h4><p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">{item.qa.description || 'Sin descripción.'}</p></div>
                <Comments title="Últimos comentarios del QA" comments={item.qa.comments} />
              </>
            ) : <p className="text-sm text-muted">Este ticket todavía no tiene Control QA.</p>}
            {item.mrs.length > 0 && <div><h4 className="mb-1 text-sm font-semibold text-muted">Merge requests</h4><ul className="text-sm">{item.mrs.map((mr) => <li key={mr.url}><a href={mr.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">{mr.repo ?? 'repo'} !{mr.iid}</a></li>)}</ul></div>}
          </div>
        </div>
      )}
    </li>
  );
};

/**
 * Tickets en Revisión del sprint actual cuyo Control QA nadie tomó (ningún comentario de un revisor). «Hacer esta revisión» crea la
 * carpeta del ticket como revisión, deja la lista de Pruebas en «solo revisión», copia el pedido para Claude y abre el ticket.
 */
export const ReviewQueueModal = ({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) =>
  // Solo se monta (y pide la lista a Redmine) con el modal abierto: abrir Pruebas no consulta nada.
  open ? <ReviewQueueContent onClose={onClose} onChanged={onChanged} /> : null;

const ReviewQueueContent = ({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<number | null>(null);
  // La primera carga usa lo guardado por el servidor (10 min); «Actualizar» fuerza una consulta nueva.
  const force = useRef(false);
  const queue = useAsync(() => api.get<ReviewQueue>(`/api/review-queue${force.current ? '?refresh=1' : ''}`));
  const refresh = () => {
    force.current = true;
    queue.reload();
  };

  const start = async (item: ReviewQueueItem) => {
    setBusyId(item.id);
    try {
      const started = await api.post<StartedReview>(`/api/review-queue/${item.id}/start`, {});
      let copied = true;
      try {
        await navigator.clipboard.writeText(started.prompt);
      } catch {
        copied = false;
      }
      // La lista de Pruebas queda en «solo revisión» para que el ticket aparezca de una
      writeStored('devpanel.tickets.origins', ['revision']);
      toast(copied ? 'success' : 'info', copied ? `Carpeta lista. Pedido copiado: pegalo en Claude.` : 'Carpeta lista, pero no pude copiar el pedido: copialo desde acá.');
      onChanged();
      onClose();
      navigate(`/pruebas/${encodeURIComponent(started.dir)}`);
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const data = queue.data;
  return (
    <Modal open onClose={onClose} title="Tickets para revisión" size="xl" footer={<Button icon={<RefreshCw className={cn('size-4', queue.loading && 'animate-spin')} />} disabled={queue.loading} onClick={refresh} title="Vuelve a consultar Redmine (se guarda 10 minutos para no hacer pedidos de más)">Actualizar</Button>}>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        {queue.loading && !data ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : queue.error || !data ? <p className="text-danger">{queue.error}</p> : (
          <>
            <p className="mb-3 text-sm text-muted">
              {data.sprint ? `${data.sprint.subject.replace(/^Sprint\s*/i, 'Sprint ')} · ` : ''}Tickets de otras personas en Revisión que no tienen Control QA, o cuyo QA está asignado a vos o a Backlog e-sueldos y no tiene comentarios de {data.reviewerRole === 'Desarrollador' ? 'desarrolladores' : `usuarios con el rol «${data.reviewerRole}»`} (aparte de quien armó el QA). Si el QA ya está asignado a otra persona, es una revisión para ella.
            </p>
            {!data.rolesKnown && <p className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">No pude leer qué usuarios tienen el rol «{data.reviewerRole}» en Redmine: se muestran todos los de Revisión, incluso los que alguien ya tomó.</p>}
            {!data.sprint ? <p className="py-8 text-center text-muted">No se encontró el sprint actual.</p> : data.items.length === 0 ? <p className="py-8 text-center text-muted" data-testid="review-empty">No hay tickets esperando revisión: todos los de Revisión del sprint ya los tomó alguien.</p> : (
              <ul className="space-y-3">{data.items.map((item) => <Item key={item.id} item={item} busy={busyId !== null} onStart={start} />)}</ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

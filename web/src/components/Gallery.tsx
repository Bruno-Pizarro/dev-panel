import { ChevronLeft, ChevronRight, Trash2, X, ZoomIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { assetUrl } from '../lib/tickets';
import { cn } from '../lib/cn';
import { ConfirmModal } from './ConfirmModal';
import { Portal } from './Portal';
import { useToast } from './Toast';

/** Cuadrícula de capturas con visor a pantalla completa (←/→ navegan, Esc o clic afuera cierran, clic en la imagen alterna el zoom). */
export const Gallery = ({ dir, images, onChanged }: { dir: string; images: string[]; onChanged?: () => void }) => {
  const toast = useToast();
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const open = index !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIndex(null);
      if (event.key === 'ArrowRight') (setIndex((current) => ((current ?? 0) + 1) % images.length), setZoomed(false));
      if (event.key === 'ArrowLeft') (setIndex((current) => ((current ?? 0) - 1 + images.length) % images.length), setZoomed(false));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, images.length]);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.del(`/api/tickets/${encodeURIComponent(dir)}/captures`, { path: toDelete, confirm: true });
      toast('success', 'Captura eliminada (quedó en .papelera/capturas).');
      setToDelete(null);
      setIndex(null);
      onChanged?.();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'No se pudo eliminar');
    } finally {
      setDeleting(false);
    }
  };
  const confirm = (
    <ConfirmModal open={toDelete !== null} title="Eliminar captura" confirmLabel="Eliminar" danger loading={deleting} onConfirm={() => void remove()} onCancel={() => setToDelete(null)}>
      <p>¿Eliminar <span className="font-mono">{toDelete}</span>? Se mueve a <span className="font-mono">.papelera/capturas</span> de la base de conocimiento y se puede recuperar a mano.</p>
    </ConfirmModal>
  );

  if (!images.length) return <p className="text-muted">Sin capturas en esta carpeta.</p>;
  const move = (delta: number) => (setIndex(((index ?? 0) + delta + images.length) % images.length), setZoomed(false));
  const current = index !== null ? images[index] : null;
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {images.map((image, position) => (
          <div key={image} className="group relative overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-accent/60">
          <button type="button" onClick={() => (setIndex(position), setZoomed(false))} className="block w-full text-left">
            <div className="relative aspect-video overflow-hidden bg-bg">
              <img src={assetUrl(dir, image)} alt={image} loading="lazy" className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]" />
              <ZoomIn className="absolute right-2 top-2 size-5 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </div>
            <div className="truncate px-3 py-2 font-mono text-sm text-muted">{image.split('/').pop()}</div>
          </button>
          <button type="button" onClick={() => setToDelete(image)} aria-label={`Eliminar ${image}`} title="Eliminar captura" className="absolute left-2 top-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-danger focus-visible:opacity-100 group-hover:opacity-100"><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
      </div>

      {current && (
        <Portal>
          {/* Todo el overlay es "afuera": un clic en cualquier parte que no sea la imagen o un control cierra el visor. */}
          <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Visor de capturas" onClick={() => setIndex(null)}>
            <div className="flex items-center justify-between px-6 py-4" onClick={stop}>
              <div className="font-mono text-sm text-muted">{index! + 1} / {images.length} · {current}</div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => (setIndex(null), setToDelete(current))} className="rounded-lg p-2 text-muted hover:bg-white/10 hover:text-danger" aria-label="Eliminar captura" title="Eliminar captura"><Trash2 className="size-6" /></button>
                <button type="button" onClick={() => setIndex(null)} className="rounded-lg p-2 text-muted hover:bg-white/10 hover:text-white" aria-label="Cerrar"><X className="size-6" /></button>
              </div>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-20 pb-6">
              <button type="button" onClick={(event) => (stop(event), move(-1))} className="absolute left-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Anterior"><ChevronLeft className="size-6" /></button>
              <div className={cn('max-h-full max-w-full overflow-auto', zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in')} onClick={(event) => (stop(event), setZoomed(!zoomed))}>
                <img src={assetUrl(dir, current)} alt={current} className={cn('rounded-lg', zoomed ? 'max-w-none' : 'max-h-[calc(100vh-8rem)] max-w-full object-contain')} />
              </div>
              <button type="button" onClick={(event) => (stop(event), move(1))} className="absolute right-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Siguiente"><ChevronRight className="size-6" /></button>
            </div>
          </div>
        </Portal>
      )}
      {confirm}
    </>
  );
};

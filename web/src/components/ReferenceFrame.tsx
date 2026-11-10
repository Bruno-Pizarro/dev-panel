import { ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

/**
 * Muestra una referencia visual en HTML (un demo) dentro de un iframe aislado: `sandbox="allow-scripts"` sin `allow-same-origin` (el demo no puede
 * tocar el panel ni su API) y, además, el servidor la entrega con una CSP sin red. Se puede ver más grande o abrir en una pestaña.
 */
export const ReferenceFrame = ({ src, name }: { src: string; name: string }) => {
  const [big, setBig] = useState(false);
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-line bg-surface', big && 'fixed inset-x-0 bottom-[var(--footer-h,0px)] top-16 z-[26] rounded-none border-0')} aria-label="Referencia visual en HTML" data-testid="reference-frame">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
        <p className="min-w-0 truncate font-mono text-sm text-muted" title={name}>{name}</p>
        <div className="flex gap-2">
          <a href={src} target="_blank" rel="noreferrer noopener"><Button icon={<ExternalLink className="size-4" />}>Abrir en una pestaña</Button></a>
          <Button icon={big ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} onClick={() => setBig(!big)}>{big ? 'Achicar' : 'Agrandar'}</Button>
        </div>
      </header>
      <iframe src={src} title="Referencia visual" sandbox="allow-scripts" referrerPolicy="no-referrer" className={cn('block w-full bg-white', big ? 'h-[calc(100%-3.25rem)]' : 'h-[75vh]')} />
    </section>
  );
};

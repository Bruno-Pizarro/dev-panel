import { Maximize2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * Tabla de un Markdown: conserva su ancho natural y se desplaza a los costados dentro de su marco (nunca se sale de la
 * columna ni se comprime hasta partir las palabras). Si no entra, ofrece "Ver tabla completa" en un panel grande.
 */
export const MarkdownTable = ({ children }: { children: ReactNode }) => {
  const scroller = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="my-4 min-w-0">
      {overflowing && (
        <div className="mb-2 flex justify-end">
          <Button variant="secondary" className="h-9" icon={<Maximize2 className="size-4" />} onClick={() => setOpen(true)}>
            Ver tabla completa
          </Button>
        </div>
      )}
      <div ref={scroller} className="overflow-x-auto rounded-xl border border-line">
        <table>{children}</table>
      </div>
      <Modal open={open} title="Tabla completa" onClose={() => setOpen(false)} size="screen">
        <div className="prose-panel min-h-0 flex-1 overflow-auto rounded-xl border border-line">
          <table>{children}</table>
        </div>
      </Modal>
    </div>
  );
};

import { Expand, Minimize2, Minus, Plus, ScanSearch } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { Portal } from './Portal';
import { Skeleton } from './Skeleton';

interface View {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 6;
const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/** Lienzo con zoom y arrastre: el diagrama nunca se recorta, siempre se puede mover y acercar. */
const PanZoom = ({ svg, tall }: { svg: string; tall: boolean }) => {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);

  /** Tamaño natural del SVG (viewBox o atributos): el CSS no lo achica. */
  const naturalSize = useCallback(() => {
    const element = content.current?.querySelector('svg');
    if (!element) return null;
    const box = element.viewBox.baseVal;
    const width = box && box.width ? box.width : element.getBoundingClientRect().width;
    const height = box && box.height ? box.height : element.getBoundingClientRect().height;
    return { width, height };
  }, []);

  const fit = useCallback(() => {
    const area = frame.current?.getBoundingClientRect();
    const size = naturalSize();
    if (!area || !size || !size.width || !size.height) return;
    const scale = clamp(Math.min((area.width - 48) / size.width, (area.height - 48) / size.height, 1.6));
    setView({ scale, x: (area.width - size.width * scale) / 2, y: (area.height - size.height * scale) / 2 });
  }, [naturalSize]);

  useLayoutEffect(() => {
    const element = content.current?.querySelector('svg');
    if (element) {
      const size = naturalSize();
      // Tamaño explícito: sin él, Mermaid lo ajusta al ancho del contenedor y lo recorta.
      if (size) {
        element.setAttribute('width', String(size.width));
        element.setAttribute('height', String(size.height));
        element.style.maxWidth = 'none';
      }
    }
    fit();
  }, [svg, tall, fit, naturalSize]);

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const area = frame.current?.getBoundingClientRect();
    if (!area) return;
    const px = cx ?? area.width / 2;
    const py = cy ?? area.height / 2;
    setView((current) => {
      const scale = clamp(current.scale * factor);
      const ratio = scale / current.scale;
      return { scale, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
    });
  };

  // La rueda se registra a mano (no pasiva) para poder impedir que la página se desplace mientras se hace zoom.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-line bg-surface', tall ? 'h-full' : 'h-[78vh] min-h-[24rem]')}>
      <div
        ref={frame}
        className={cn('absolute inset-0 touch-none select-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
        onPointerDown={(event) => {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, view };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const { x, y, view: start } = drag.current;
          setView({ ...start, x: start.x + event.clientX - x, y: start.y + event.clientY - y });
        }}
        onPointerUp={() => ((drag.current = null), setDragging(false))}
        onPointerCancel={() => ((drag.current = null), setDragging(false))}
        onDoubleClick={fit}
      >
        <div ref={content} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }} className="absolute left-0 top-0" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-xl border border-line bg-surface-2/95 p-1.5 shadow-pop">
        <Button variant="ghost" className="size-9 !px-0" aria-label="Alejar" onClick={() => zoomAt(1 / 1.25)} icon={<Minus className="size-4" />} />
        <span className="w-14 text-center font-mono text-sm text-muted">{Math.round(view.scale * 100)}%</span>
        <Button variant="ghost" className="size-9 !px-0" aria-label="Acercar" onClick={() => zoomAt(1.25)} icon={<Plus className="size-4" />} />
        <Button variant="ghost" className="size-9 !px-0" aria-label="Ajustar a la pantalla" title="Ajustar (doble clic en el diagrama)" onClick={fit} icon={<ScanSearch className="size-4" />} />
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-surface-2/90 px-2.5 py-1 text-sm text-muted">Arrastrá para mover · rueda para zoom · doble clic para ajustar</p>
    </div>
  );
};

/** Diagrama Mermaid con el tema oscuro del panel, con zoom, arrastre y pantalla completa. La librería se carga solo cuando hace falta. */
export const Mermaid = ({ code }: { code: string }) => {
  const id = `mmd-${useId().replace(/:/g, '')}`;
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let active = true;
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        flowchart: { useMaxWidth: false, htmlLabels: true },
        sequence: { useMaxWidth: false },
        er: { useMaxWidth: false },
        gantt: { useMaxWidth: false },
        themeVariables: {
          darkMode: true, background: '#161b22', primaryColor: '#242d3d', primaryTextColor: '#e6edf3', primaryBorderColor: '#8a97ff',
          lineColor: '#8b98a9', secondaryColor: '#1c2330', tertiaryColor: '#161b22', edgeLabelBackground: '#161b22', textColor: '#e6edf3', fontFamily: 'Inter Variable, sans-serif', fontSize: '15px',
        },
      });
      try {
        const result = await mermaid.render(id, code);
        if (active) (setSvg(result.svg), setError(null));
      } catch (reason) {
        if (active) setError((reason as Error).message);
      }
    });
    return () => {
      active = false;
    };
  }, [code, id]);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  if (error) return <pre className="overflow-auto rounded-xl border border-danger/40 bg-danger/10 p-4 font-mono text-sm text-danger">No se pudo dibujar el diagrama: {error}</pre>;
  if (!svg) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <>
      <div className="relative">
        <PanZoom key={svg} svg={svg} tall={false} />
        <Button className="absolute right-3 top-3 h-9" icon={<Expand className="size-4" />} onClick={() => setFull(true)}>Pantalla completa</Button>
      </div>
      {full && (
        <Portal>
          <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Diagrama a pantalla completa">
            <div className="mb-3 flex justify-end">
              <Button icon={<Minimize2 className="size-4" />} onClick={() => setFull(false)}>Cerrar</Button>
            </div>
            <div className="min-h-0 flex-1"><PanZoom key={`full-${svg}`} svg={svg} tall /></div>
          </div>
        </Portal>
      )}
    </>
  );
};

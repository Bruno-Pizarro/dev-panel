import { Expand, Minimize2, Minus, Plus, ScanSearch } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { FRAME_PADDING, MIN_FRAME_PX, NARROW_FRAME_PX, OVERLAY_RESERVE, fitFrame } from '../lib/mermaidFrame';
import { repairMermaid } from '../lib/mermaidRepair';
import { themeColor, useTheme } from '../lib/theme';
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
const PanZoom = ({ svg, tall, onFull }: { svg: string; tall: boolean; onFull?: () => void }) => {
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; view: View; moved: number } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  // En un documento el marco se ajusta al diagrama (en pantalla completa ocupa todo el lugar) y avisa si es angosto.
  const [frameHeight, setFrameHeight] = useState(MIN_FRAME_PX);
  const [narrow, setNarrow] = useState(false);
  // Mientras el usuario no mueva ni haga zoom, el diagrama se re-ajusta solo cuando cambia el tamaño del marco (menú lateral, ventana).
  const touched = useRef(false);

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
    setNarrow(area.width < NARROW_FRAME_PX);
    if (!tall) {
      const { height, scale: fitted } = fitFrame(size, area.width, window.innerHeight);
      const scale = clamp(fitted);
      setFrameHeight(height);
      setView({ scale, x: (area.width - size.width * scale) / 2, y: (height - OVERLAY_RESERVE - size.height * scale) / 2 });
      return;
    }
    const scale = clamp(Math.min((area.width - FRAME_PADDING) / size.width, (area.height - FRAME_PADDING - OVERLAY_RESERVE) / size.height, 1.6));
    setView({ scale, x: (area.width - size.width * scale) / 2, y: (area.height - OVERLAY_RESERVE - size.height * scale) / 2 });
  }, [naturalSize, tall]);

  useLayoutEffect(() => {
    const element = content.current?.querySelector('svg');
    if (element) {
      const size = naturalSize();
      // Tamaño explícito: sin él, Mermaid lo ajusta al ancho del contenedor y lo recorta.
      if (size) {
        element.setAttribute('width', String(size.width));
        element.setAttribute('height', String(size.height));
        element.style.maxWidth = 'none';
        // Por si Mermaid calculó el recuadro con otra tipografía: que el contenido nunca se recorte en el borde del SVG.
        element.style.overflow = 'visible';
      }
    }
    fit();
  }, [svg, tall, fit, naturalSize]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (!touched.current) fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    touched.current = true;
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

  // La rueda se registra a mano (no pasiva) para poder impedir que la página se desplace mientras se hace zoom. Solo con
  // Ctrl o ⌘ (el pellizco del trackpad también los manda): sin modificador la rueda desplaza la página, que es lo que se
  // espera al bajar por un documento; antes hacía zoom y el diagrama quedaba acercado y cortado.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-line bg-surface', tall && 'h-full')} style={tall ? undefined : { height: frameHeight }}>
      <div
        ref={frame}
        className={cn('absolute inset-0 touch-none select-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
        onPointerDown={(event) => {
          touched.current = true;
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, view, moved: 0 };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const { x, y, view: start } = drag.current;
          drag.current.moved = Math.max(drag.current.moved, Math.abs(event.clientX - x) + Math.abs(event.clientY - y));
          setView({ ...start, x: start.x + event.clientX - x, y: start.y + event.clientY - y });
        }}
        onPointerUp={() => {
          // En un marco angosto el diagrama es ilegible: un toque (sin arrastrar) lo abre en grande.
          const tapped = narrow && onFull && drag.current !== null && drag.current.moved < 5;
          drag.current = null;
          setDragging(false);
          if (tapped) onFull();
        }}
        onPointerCancel={() => ((drag.current = null), setDragging(false))}
        onDoubleClick={() => ((touched.current = false), fit())}
      >
        <div ref={content} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }} className="absolute left-0 top-0" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <div className="absolute bottom-3 right-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-1.5 rounded-xl border border-line bg-surface-2/95 p-1.5 shadow-pop">
        <Button variant="ghost" className="size-9 !px-0" aria-label="Alejar" onClick={() => zoomAt(1 / 1.25)} icon={<Minus className="size-4" />} />
        <span className="w-14 text-center font-mono text-sm text-muted">{Math.round(view.scale * 100)}%</span>
        <Button variant="ghost" className="size-9 !px-0" aria-label="Acercar" onClick={() => zoomAt(1.25)} icon={<Plus className="size-4" />} />
        <Button variant="ghost" className="size-9 !px-0" aria-label="Ajustar a la pantalla" title="Ajustar (doble clic en el diagrama)" onClick={() => ((touched.current = false), fit())} icon={<ScanSearch className="size-4" />} />
        {onFull && <Button variant="ghost" className="size-9 !px-0" aria-label="Pantalla completa" title="Pantalla completa" onClick={onFull} icon={<Expand className="size-4" />} />}
      </div>
      <p className={cn('pointer-events-none absolute left-3 rounded-lg bg-surface-2/90 px-2.5 py-1 text-sm text-muted', narrow ? 'top-3' : 'bottom-3')}>
        {narrow && onFull ? 'Tocá el diagrama para verlo en grande' : 'Arrastrá para mover · Ctrl + rueda para zoom · doble clic para ajustar'}
      </p>
    </div>
  );
};

/** Diagrama Mermaid con el tema oscuro del panel, con zoom, arrastre y pantalla completa. La librería se carga solo cuando hace falta. */
export const Mermaid = ({ code }: { code: string }) => {
  const id = `mmd-${useId().replace(/:/g, '')}`;
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [repaired, setRepaired] = useState(false);
  const [theme] = useTheme();

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
          darkMode: theme !== 'claro', background: themeColor('surface'), primaryColor: themeColor('surface-3'), primaryTextColor: themeColor('fg'), primaryBorderColor: themeColor('accent'),
          lineColor: themeColor('muted'), secondaryColor: themeColor('surface-2'), tertiaryColor: themeColor('surface'), edgeLabelBackground: themeColor('surface'), textColor: themeColor('fg'), fontFamily: 'Inter Variable, sans-serif', fontSize: '15px',
        },
      });
      try {
        const result = await mermaid.render(id, code);
        if (active) (setSvg(result.svg), setError(null));
      } catch (reason) {
        // Un error típico de los .md: comillas dentro de una etiqueta. Se reintenta con las etiquetas reparadas.
        const fixed = repairMermaid(code);
        if (fixed !== code) {
          try {
            const result = await mermaid.render(`${id}r`, fixed);
            if (active) (setSvg(result.svg), setError(null), setRepaired(true));
            return;
          } catch {
            /* sigue el error original */
          }
        }
        if (active) setError((reason as Error).message);
      }
    });
    return () => {
      active = false;
    };
  }, [code, id, theme]);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  if (error) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-4">
        <p className="font-medium text-danger">El diagrama tiene un error de sintaxis en el propio Markdown, por eso no se dibuja.</p>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-sm text-danger">{error}</pre>
        <details className="mt-3"><summary className="cursor-pointer text-sm text-muted hover:text-fg">Ver el código del diagrama</summary><pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-sm">{code}</pre></details>
      </div>
    );
  }
  if (!svg) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <>
      {repaired && <p className="mb-2 text-sm text-warning">Se corrigieron comillas dentro de etiquetas para poder dibujarlo; conviene arreglarlas en el Markdown (usá <span className="font-mono">#quot;</span> o comillas simples).</p>}
      <PanZoom key={svg} svg={svg} tall={false} onFull={() => setFull(true)} />
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

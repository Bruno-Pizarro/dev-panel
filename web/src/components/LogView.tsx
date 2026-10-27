import { ArrowDownToLine } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hasAnsi, parseAnsi } from '../lib/ansi';
import { cn } from '../lib/cn';

export interface LogLine {
  text: string;
  level?: 'info' | 'warn' | 'error' | 'ok';
}

const colors = { info: 'text-fg', warn: 'text-warning', error: 'text-danger', ok: 'text-success' };
const NEAR_BOTTOM_PX = 48;

const Line = ({ line }: { line: LogLine }) => {
  if (!hasAnsi(line.text)) return <div className={cn('whitespace-pre-wrap break-all', colors[line.level ?? 'info'])}>{line.text || ' '}</div>;
  // Los colores de la consola de Docker (ANSI) se respetan tal cual vienen del servicio.
  return (
    <div className="whitespace-pre-wrap break-all text-fg">
      {parseAnsi(line.text).map((segment, index) => (
        <span
          key={index}
          style={{
            color: segment.style.color,
            backgroundColor: segment.style.background,
            fontWeight: segment.style.bold ? 700 : undefined,
            opacity: segment.style.dim ? 0.65 : undefined,
            fontStyle: segment.style.italic ? 'italic' : undefined,
            textDecoration: segment.style.underline ? 'underline' : undefined,
          }}
        >
          {segment.text}
        </span>
      ))}
    </div>
  );
};

/** Terminal de logs: arranca en el final y lo sigue mientras no subas; si subís, aparece "Ir al final". */
export const LogView = ({ lines, className }: { lines: LogLine[]; className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [away, setAway] = useState(false);

  const toBottom = useCallback(() => {
    const element = ref.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    if (stick.current) toBottom();
  }, [lines, toBottom]);

  // El contenido tarda un instante en tener su altura final: se reafirma el final en el siguiente cuadro.
  useEffect(() => {
    if (!stick.current) return;
    const frame = requestAnimationFrame(toBottom);
    return () => cancelAnimationFrame(frame);
  }, [lines, toBottom]);

  const onScroll = () => {
    const element = ref.current;
    if (!element) return;
    const near = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
    stick.current = near;
    setAway(!near);
  };

  return (
    <div className={cn('relative', className)}>
      <div ref={ref} onScroll={onScroll} className="size-full overflow-auto rounded-xl border border-line bg-bg p-4 font-mono text-sm leading-6" role="log">
        {lines.length === 0 && <span className="text-muted">Sin salida todavía.</span>}
        {lines.map((line, index) => (
          <Line key={index} line={line} />
        ))}
      </div>
      {away && (
        <button
          type="button"
          onClick={() => ((stick.current = true), setAway(false), toBottom())}
          className="absolute bottom-4 right-6 inline-flex h-9 items-center gap-2 rounded-full border border-accent/40 bg-surface-2 px-3.5 text-sm font-medium text-accent shadow-pop hover:bg-surface-3"
        >
          <ArrowDownToLine className="size-4" aria-hidden /> Ir al final
        </button>
      )}
    </div>
  );
};

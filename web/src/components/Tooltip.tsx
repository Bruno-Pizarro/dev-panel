import { useRef, useState, type ReactNode } from 'react';
import { Portal } from './Portal';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** Ancho del globo en px. */
  width?: number;
}

/** Globo de ayuda al pasar el mouse o enfocar con el teclado. Se dibuja fuera del layout para que ninguna tabla lo recorte. */
export const Tooltip = ({ content, children, width = 320 }: TooltipProps) => {
  const anchor = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.top > window.innerHeight / 2;
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
    setBox({ left, top: above ? rect.top - 8 : rect.bottom + 8, above });
  };

  return (
    <>
      <span ref={anchor} onMouseEnter={show} onMouseLeave={() => setBox(null)} onFocus={show} onBlur={() => setBox(null)} className="inline-flex max-w-full min-w-0">
        {children}
      </span>
      {box && (
        <Portal>
          <div
            role="tooltip"
            style={{ left: box.left, top: box.top, width, transform: box.above ? 'translateY(-100%)' : undefined }}
            className="pointer-events-none fixed z-[70] animate-fade-in rounded-xl border border-line bg-surface-3 p-3.5 text-sm leading-5 text-fg shadow-pop"
          >
            {content}
          </div>
        </Portal>
      )}
    </>
  );
};

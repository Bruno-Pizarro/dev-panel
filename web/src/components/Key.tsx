import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useKeyFor, useShortcutSettings } from '../lib/useShortcuts';

// La fuente monoespaciada no trae las flechas: se dibujan como íconos.
const ARROW_ICONS: Record<string, ReactNode> = {
  '←': <ArrowLeft className="size-3.5" aria-label="flecha izquierda" />,
  '→': <ArrowRight className="size-3.5" aria-label="flecha derecha" />,
  '↑': <ArrowUp className="size-3.5" aria-label="flecha arriba" />,
  '↓': <ArrowDown className="size-3.5" aria-label="flecha abajo" />,
};

/** La tecla dibujada como una tecla de teclado (borde inferior más grueso). */
export const Key = ({ children, className, ...rest }: { children: ReactNode; className?: string; 'aria-hidden'?: boolean }) => (
  <kbd {...rest} className={cn('inline-flex h-6 min-w-6 select-none items-center justify-center rounded-md border border-b-2 border-line bg-surface-2 px-1.5 font-mono text-sm font-medium leading-none text-muted', className)}>{typeof children === 'string' ? (ARROW_ICONS[children] ?? children) : children}</kbd>
);

/** La tecla configurada de una acción; no se dibuja si el usuario apagó las teclas a la vista en Configuración. */
export const ShortcutKey = ({ id, className }: { id: string; className?: string }) => {
  const { showKeys } = useShortcutSettings();
  const key = useKeyFor(id);
  return showKeys && key ? <Key className={className}>{key}</Key> : null;
};

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { pillStyle, tint } from '../lib/colors';

interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  locked?: boolean;
  onToggle?: () => void;
  hint?: string;
  /** Canales RGB ("99 179 237"): identifica al servicio; activo se tiñe de ese color. */
  color?: string;
}

/** Chip seleccionable. `locked` = obligatorio: se ve activo y no se puede quitar. */
export const Chip = ({ children, selected = false, locked = false, onToggle, hint, color }: ChipProps) => {
  const active = selected || locked;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      disabled={locked}
      title={hint}
      onClick={onToggle}
      style={color && active ? pillStyle(color, true) : undefined}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-all',
        active ? (color ? '' : 'border-accent/50 bg-accent/15 text-accent') : 'border-line bg-surface-2 text-muted hover:border-accent/30 hover:text-fg',
        locked && 'cursor-default opacity-90',
      )}
    >
      {color && !active && <span className="size-2.5 rounded-full" style={{ backgroundColor: tint(color, 0.9) }} aria-hidden />}
      {active && <Check className="size-4" aria-hidden />}
      {children}
    </button>
  );
};

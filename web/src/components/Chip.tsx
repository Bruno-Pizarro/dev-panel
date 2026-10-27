import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  locked?: boolean;
  onToggle?: () => void;
  hint?: string;
}

/** Chip seleccionable. `locked` = obligatorio: se ve activo y no se puede quitar. */
export const Chip = ({ children, selected = false, locked = false, onToggle, hint }: ChipProps) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={selected || locked}
    disabled={locked}
    title={hint}
    onClick={onToggle}
    className={cn(
      'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-all',
      selected || locked
        ? 'border-accent/50 bg-accent/15 text-accent'
        : 'border-line bg-surface-2 text-muted hover:border-accent/30 hover:text-fg',
      locked && 'cursor-default opacity-80',
    )}
  >
    {(selected || locked) && <Check className="size-4" aria-hidden />}
    {children}
  </button>
);

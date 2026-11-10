import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';

/**
 * Barra que se llena con una animación (arranca vacía y crece hasta su valor). Cerca del final dice que falta poco y, completa, se pone verde.
 * `label` va a la izquierda y el número (`value/max`) a la derecha, salvo que se pase `valueLabel`.
 */
export const FillBar = ({ value, max, label, valueLabel, className, compact = false }: { value: number; max: number; label?: string; valueLabel?: string; className?: string; compact?: boolean }) => {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setGrown(true), 60);
    return () => window.clearTimeout(timer);
  }, []);
  const safeMax = Math.max(1, max);
  const ratio = Math.min(1, Math.max(0, value / safeMax));
  const complete = max > 0 && value >= max;
  const almost = !complete && ratio >= 0.75;
  return (
    <div className={cn('min-w-0', className)} data-testid="fill-bar">
      {(label || !compact) && (
        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{label}</span>
          <span className={cn('font-mono tabular-nums', complete ? 'text-success' : almost ? 'text-warning' : 'text-muted')}>
            {valueLabel ?? `${value}/${max}`}{almost ? ' · ¡falta poquito!' : ''}{complete ? ' · ¡completo!' : ''}
          </span>
        </div>
      )}
      <div className={cn('overflow-hidden rounded-full bg-surface-3', compact ? 'h-1.5' : 'h-2')} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label ?? 'Progreso'}>
        <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', complete ? 'bg-success' : almost ? 'bg-warning' : 'bg-accent', complete && 'animate-pulse')} style={{ width: `${grown ? ratio * 100 : 0}%` }} />
      </div>
    </div>
  );
};

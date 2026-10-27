import { cn } from '../lib/cn';

/**
 * Marcador de carga: aparece recién a los 350 ms (si los datos llegan antes, no se ve nada y se evita el destello)
 * y un brillo lento cruza de lado a lado.
 */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('relative animate-skeleton-in overflow-hidden rounded-lg bg-surface-2', className)} aria-hidden>
    <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
  </div>
);

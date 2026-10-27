import { cn } from '../lib/cn';

/** Marcador de carga: un brillo suave que cruza de lado a lado (en vez de parpadear). */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('relative overflow-hidden rounded-lg bg-surface-2', className)} aria-hidden>
    <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
  </div>
);

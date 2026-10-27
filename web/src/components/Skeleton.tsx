import { cn } from '../lib/cn';

/** Marcador de carga: bloque quieto con un círculo que gira en el centro (sin brillo ni fundidos). */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('flex items-center justify-center rounded-lg bg-surface-2', className)} role="status" aria-label="Cargando">
    <span className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
  </div>
);

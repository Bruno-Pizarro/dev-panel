import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useStoredState } from '../lib/hooks';

interface CollapsibleCardProps {
  title: ReactNode;
  /** Botones o etiquetas del encabezado, a la izquierda del botón de contraer. */
  action?: ReactNode;
  /** La vista compacta (colapsada): los números que importan, en una línea o dos. */
  summary: ReactNode;
  /** Dónde se recuerda si quedó abierta o cerrada (`localStorage`). Arranca colapsada. */
  storageKey: string;
  className?: string;
  testId?: string;
  /** La vista completa. */
  children: ReactNode;
}

/**
 * Tarjeta que se contrae a una vista compacta (no desaparece): colapsada muestra `summary`, expandida la vista completa.
 * Arranca colapsada y recuerda lo último que elegiste.
 */
export const CollapsibleCard = ({ title, action, summary, storageKey, className, testId, children }: CollapsibleCardProps) => {
  const [collapsed, setCollapsed] = useStoredState<boolean>(storageKey, true);
  const Icon = collapsed ? ChevronDown : ChevronUp;
  return (
    <section className={cn('rounded-2xl border border-line bg-surface', className)} data-testid={testId} data-collapsed={collapsed}>
      <header className={cn('flex items-center justify-between gap-3 px-5 py-3', !collapsed && 'border-b border-line')}>
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expandir' : 'Contraer'}
            title={collapsed ? 'Ver completo' : 'Ver compacto'}
            className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <Icon className="size-5" aria-hidden />
          </button>
        </div>
      </header>
      {collapsed ? <div className="px-5 pb-4 pt-1" data-testid={testId ? `${testId}-compact` : undefined}>{summary}</div> : <div className="p-5">{children}</div>}
    </section>
  );
};

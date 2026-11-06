import { ChevronDown } from 'lucide-react';
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
/** Una de las dos vistas: la que no se ve se pliega a alto 0 y se desvanece (grid 0fr → 1fr); `inert` la saca del foco y de los lectores. */
const Pane = ({ visible, className, testId, children }: { visible: boolean; className?: string; testId?: string | undefined; children: ReactNode }) => {
  const hidden = visible ? {} : ({ inert: '' } as Record<string, string>);
  return (
    <div
      className={cn('grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none', visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
      aria-hidden={!visible}
      data-testid={testId}
      {...hidden}
    >
      <div className="min-h-0 overflow-hidden"><div className={className}>{children}</div></div>
    </div>
  );
};

export const CollapsibleCard = ({ title, action, summary, storageKey, className, testId, children }: CollapsibleCardProps) => {
  const [collapsed, setCollapsed] = useStoredState<boolean>(storageKey, true);
  return (
    <section className={cn('rounded-2xl border border-line bg-surface', className)} data-testid={testId} data-collapsed={collapsed}>
      <header className={cn('flex items-center justify-between gap-3 border-b px-5 py-3 transition-colors duration-300', collapsed ? 'border-transparent' : 'border-line')}>
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
            <ChevronDown className={cn('size-5 transition-transform duration-300 motion-reduce:transition-none', !collapsed && 'rotate-180')} aria-hidden />
          </button>
        </div>
      </header>
      <Pane visible={collapsed} testId={testId ? `${testId}-compact` : undefined} className="px-5 pb-4 pt-1">{summary}</Pane>
      <Pane visible={!collapsed} className="p-5">{children}</Pane>
    </section>
  );
};

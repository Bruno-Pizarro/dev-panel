import { Menu } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { useStoredState } from '../lib/hooks';
import { cn } from '../lib/cn';
import { ClaudeUsageBar } from './ClaudeUsageBar';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { StatusDot } from './StatusDot';
import { useHealth } from '../lib/useHealth';

export const Layout = () => {
  const health = useHealth();
  const [collapsed, setCollapsed] = useStoredState<boolean>('devpanel.sidebar.collapsed', false);
  const { pathname } = useLocation();
  // Las vistas de lectura (pruebas y desarrollo) usan todo el ancho disponible.
  const wide = ['/pruebas', '/planificacion', '/kanban'].some((prefix) => pathname.startsWith(prefix));
  // Pruebas y Desarrollo son dos paneles con scroll propio: la página no debe tener un tercero.
  const split = ['/pruebas', '/planificacion'].some((prefix) => pathname.startsWith(prefix));
  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface/60 px-8 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir el menú' : 'Colapsar el menú'} aria-expanded={!collapsed} title={collapsed ? 'Expandir el menú' : 'Colapsar el menú'} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg">
              <Menu className="size-5" aria-hidden />
            </button>
            <CommandPalette />
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <ClaudeUsageBar />
          <StatusDot labelClassName="hidden whitespace-nowrap xl:inline" status={health === 'ok' ? 'ok' : health === 'down' ? 'error' : 'busy'} label={health === 'ok' ? 'Servidor conectado' : health === 'down' ? 'Servidor sin respuesta' : 'Conectando…'} />
          </div>
        </header>
        <main className={cn('min-h-0 flex-1 overflow-y-auto px-8 py-8', split && 'md:overflow-hidden')}>
          <div className={cn('mx-auto animate-fade-in', wide ? 'max-w-none' : 'max-w-6xl', split && 'md:h-full')}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

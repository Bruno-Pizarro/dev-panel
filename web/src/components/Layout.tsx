import { Menu } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStoredState } from '../lib/hooks';
import { cn } from '../lib/cn';
import { ClaudeUsageBar } from './ClaudeUsageBar';
import { Clock } from './Clock';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { ThemePicker } from './ThemePicker';
import { StatusDot } from './StatusDot';
import { useHealth } from '../lib/useHealth';
import { allNavItems } from '../lib/nav';
import { GOTO_PREFIX, useShortcutMap } from '../lib/useShortcuts';
import { ShortcutHelp } from './ShortcutHelp';
import { AgentToast } from './AgentToast';
import { NudgeHost } from './NudgeHost';
import { ActivityBar } from './ActivityBar';
import { RewardHost } from './RewardHost';
import { DayWrap } from './DayWrap';

export const Layout = ({ userName }: { userName: string }) => {
  const health = useHealth();
  const [collapsed, setCollapsed] = useStoredState<boolean>('devpanel.sidebar.collapsed', false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // "Ir a…": una letra por cada destino del menú (después de la tecla de ir a…).
  useShortcutMap(Object.fromEntries(allNavItems.map((item) => [`${GOTO_PREFIX}${item.path}`, () => navigate(item.path)])));
  // Las vistas de lectura (pruebas y desarrollo) usan todo el ancho disponible.
  const wide = ['/pruebas', '/planificacion', '/kanban'].some((prefix) => pathname.startsWith(prefix));
  // Pruebas y Desarrollo son dos paneles con scroll propio: la página no debe tener un tercero.
  const split = ['/pruebas', '/planificacion'].some((prefix) => pathname.startsWith(prefix));
  return (
    <div className="flex h-full">
      <ShortcutHelp />
      <AgentToast />
      <NudgeHost userName={userName} />
      <RewardHost />
      <DayWrap />
      <Sidebar collapsed={collapsed} userName={userName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface/60 px-8 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir el menú' : 'Colapsar el menú'} aria-expanded={!collapsed} title={collapsed ? 'Expandir el menú' : 'Colapsar el menú'} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg">
              <Menu className="size-5" aria-hidden />
            </button>
            <CommandPalette />
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <ClaudeUsageBar />
            <ThemePicker />
            <Clock />
          <StatusDot labelClassName="hidden whitespace-nowrap xl:inline" status={health === 'ok' ? 'ok' : health === 'down' ? 'error' : 'busy'} label={health === 'ok' ? 'Servidor conectado' : health === 'down' ? 'Servidor sin respuesta' : 'Conectando…'} />
          </div>
        </header>
        <main className={cn('min-h-0 flex-1 overflow-y-auto px-8 py-8', split && 'md:overflow-hidden')}>
          <div className={cn('mx-auto animate-fade-in', wide ? 'max-w-none' : 'max-w-6xl', split && 'md:h-full')}>
            <Outlet />
          </div>
        </main>
        <ActivityBar />
      </div>
    </div>
  );
};

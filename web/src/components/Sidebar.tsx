import { BellOff, Bell, Terminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { HIDDEN_NAV_KEY, visibleNavGroups } from '../lib/nav';
import { useStoredState } from '../lib/hooks';
import { cn } from '../lib/cn';
import { GOTO_PREFIX_ID } from '../lib/shortcuts';
import { GOTO_PREFIX, useKeyFor, useShortcutSettings } from '../lib/useShortcuts';
import { Key, ShortcutKey } from './Key';
import { setDnd, untilTomorrow, useDnd } from '../lib/dnd';
import { useShortcut } from '../lib/useShortcuts';

/** La combinación "ir a…" de un destino del menú (por ejemplo G I), a la vista junto a su nombre. */
const GotoKeys = ({ path }: { path: string }) => {
  const { showKeys } = useShortcutSettings();
  const prefix = useKeyFor(GOTO_PREFIX_ID);
  const letter = useKeyFor(`${GOTO_PREFIX}${path}`);
  if (!showKeys || !letter) return null;
  return <Key className="h-5 min-w-5 shrink-0 gap-1.5 px-1.5" aria-hidden><span>{prefix}</span><span>{letter}</span></Key>;
};

const HOUR_MS = 3_600_000;

/** Pie del menú: "No molestar" silencia el aviso de agentes y los avisos del Inicio por una hora, hasta mañana o hasta apagarlo. */
const DoNotDisturb = ({ collapsed }: { collapsed: boolean }) => {
  const dnd = useDnd();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Clic afuera o Escape cierran el menú de opciones.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  // Z: enciende (una hora) o apaga.
  useShortcut('dnd.toggle', () => (dnd.active ? setDnd(null) : setDnd({ until: Date.now() + HOUR_MS })));
  const choose = (state: Parameters<typeof setDnd>[0]) => (setDnd(state), setOpen(false));
  return (
    <div ref={box} className={cn('relative border-t border-line', collapsed ? 'p-1.5' : 'px-3 py-1.5')}>
      {open && (
        <div className="absolute bottom-full left-3 right-3 z-20 mb-1 space-y-1 rounded-xl border border-line bg-surface p-2 shadow-pop" role="menu" aria-label="No molestar">
          {[{ label: 'Una hora', state: { until: Date.now() + HOUR_MS } }, { label: 'Hasta mañana', state: { until: untilTomorrow() } }, { label: 'Hasta que lo apague', state: { forever: true as const } }].map((option) => (
            <button key={option.label} type="button" role="menuitem" onClick={() => choose(option.state)} className="flex h-9 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-surface-2">{option.label}</button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => (dnd.active ? setDnd(null) : setOpen(!open))}
        aria-label={dnd.active ? `No molestar activo ${dnd.label}: tocá para apagarlo` : 'Activar No molestar'}
        aria-pressed={dnd.active}
        title={dnd.active ? `No molestar ${dnd.label}: tocá para apagarlo` : 'No molestar: silencia el aviso de agentes y los avisos del Inicio'}
        data-testid="dnd-button"
        className={cn('flex h-8 w-full items-center rounded-lg text-sm font-medium transition-colors', collapsed ? 'justify-center' : 'gap-2 px-2', dnd.active ? 'bg-warning/15 text-warning' : 'text-muted hover:bg-surface-2 hover:text-fg')}
      >
        {dnd.active ? <BellOff className="size-4 shrink-0" aria-hidden /> : <Bell className="size-4 shrink-0" aria-hidden />}
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{dnd.active ? `No molestar · ${dnd.label}` : 'No molestar'}</span>}
        {!collapsed && <ShortcutKey id="dnd.toggle" />}
      </button>
    </div>
  );
};

export const Sidebar = ({ collapsed, userName }: { collapsed: boolean; userName: string }) => {
  const [hidden] = useStoredState<string[]>(HIDDEN_NAV_KEY, []);
  return (
  <aside className={cn('flex h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200', collapsed ? 'w-[4.5rem]' : 'w-64')}>
    <div className={cn('flex h-16 items-center gap-3 border-b border-line', collapsed ? 'justify-center px-0' : 'px-5')}>
      <div className="flex size-9 items-center justify-center rounded-lg bg-accent-strong/20 text-accent">
        <Terminal className="size-5" aria-hidden />
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <div className="font-semibold">Dev Panel</div>
          {userName && <div className="max-w-40 truncate text-sm text-muted" title={userName}>{userName}</div>}
        </div>
      )}
    </div>
    <nav className={cn('flex-1 space-y-3 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')} aria-label="Principal">
      {visibleNavGroups(hidden).map((group) => (
        <div key={group.label}>
          {collapsed ? <div className="mx-3 mb-1 border-t border-line" aria-hidden /> : <div className="mb-0.5 px-3 text-sm font-medium uppercase leading-5 tracking-wider text-muted/70">{group.label}</div>}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 items-center rounded-lg text-sm font-medium transition-colors',
                      collapsed ? 'justify-center' : 'gap-3 px-3',
                      isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  <item.icon className="size-5 shrink-0" aria-hidden />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && <GotoKeys path={item.path} />}
                  {!collapsed && item.phase !== null && <span className="rounded-md bg-surface-3 px-1.5 text-sm text-muted">F{item.phase}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
    <DoNotDisturb collapsed={collapsed} />
  </aside>
  );
};

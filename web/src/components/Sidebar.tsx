import { Terminal } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { navGroups } from '../lib/nav';
import { cn } from '../lib/cn';

export const Sidebar = ({ collapsed, userName }: { collapsed: boolean; userName: string }) => (
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
    <nav className={cn('flex-1 space-y-6 overflow-y-auto py-5', collapsed ? 'px-2' : 'px-3')} aria-label="Principal">
      {navGroups.map((group) => (
        <div key={group.label}>
          {collapsed ? <div className="mx-3 mb-2 border-t border-line" aria-hidden /> : <div className="mb-2 px-3 text-sm font-medium uppercase tracking-wider text-muted/70">{group.label}</div>}
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 items-center rounded-lg text-sm font-medium transition-colors',
                      collapsed ? 'justify-center' : 'gap-3 px-3',
                      isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  <item.icon className="size-5 shrink-0" aria-hidden />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && item.phase !== null && <span className="rounded-md bg-surface-3 px-1.5 text-sm text-muted">F{item.phase}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  </aside>
);

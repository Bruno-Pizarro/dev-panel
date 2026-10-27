import { Terminal } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { navGroups } from '../lib/nav';
import { cn } from '../lib/cn';

export const Sidebar = () => (
  <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface">
    <div className="flex h-16 items-center gap-3 border-b border-line px-5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-accent-strong/20 text-accent">
        <Terminal className="size-5" aria-hidden />
      </div>
      <div className="leading-tight">
        <div className="font-semibold">Dev Panel</div>
        <div className="text-sm text-muted">e-sueldos</div>
      </div>
    </div>
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Principal">
      {navGroups.map((group) => (
        <div key={group.label}>
          <div className="mb-2 px-3 text-sm font-medium uppercase tracking-wider text-muted/70">{group.label}</div>
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                      isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  <item.icon className="size-5 shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.phase !== null && <span className="rounded-md bg-surface-3 px-1.5 text-sm text-muted">F{item.phase}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  </aside>
);

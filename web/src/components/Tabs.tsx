import { cn } from '../lib/cn';
import { NUMBER_TABS_ID } from '../lib/shortcuts';
import { useShortcut, useShortcutSettings } from '../lib/useShortcuts';
import { ShortcutKey } from './Key';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/**
 * Pestañas. Con el teclado: A / D (o las flechas) pasan a la anterior y a la siguiente (se quedan en los extremos) y 1–9 saltan a
 * la que tiene ese número. Las teclas se dibujan a los costados cuando están a la vista (Configuración → Atajos de teclado).
 */
export const Tabs = <T extends string>({ items, value, onChange }: { items: Array<TabItem<T>>; value: T; onChange: (id: T) => void }) => {
  const { showKeys } = useShortcutSettings();
  const index = items.findIndex((item) => item.id === value);
  const go = (target: number) => {
    const next = items[Math.min(items.length - 1, Math.max(0, target))];
    if (next && next.id !== value) onChange(next.id);
  };
  useShortcut('tabs.prev', () => go(index - 1));
  useShortcut('tabs.next', () => go(index + 1));
  useShortcut(NUMBER_TABS_ID, (position) => position !== undefined && position <= items.length && go(position - 1));

  return (
    <div className="mb-6 flex items-center gap-3 border-b border-line">
      <ShortcutKey id="tabs.prev" className="mb-1 shrink-0" />
      <div role="tablist" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {items.map((item, position) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={value === item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn('-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors', value === item.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg')}
          >
            {showKeys && position < 9 && <span className="font-mono text-sm text-muted/50" aria-hidden>{position + 1}</span>}
            {item.label}
            {item.count !== undefined && <span className="rounded-md bg-surface-3 px-1.5 text-sm text-muted">{item.count}</span>}
          </button>
        ))}
      </div>
      <ShortcutKey id="tabs.next" className="mb-1 shrink-0" />
    </div>
  );
};

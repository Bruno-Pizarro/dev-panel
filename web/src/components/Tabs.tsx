import { cn } from '../lib/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export const Tabs = <T extends string>({ items, value, onChange }: { items: Array<TabItem<T>>; value: T; onChange: (id: T) => void }) => (
  <div role="tablist" className="mb-6 flex gap-1 border-b border-line">
    {items.map((item) => (
      <button
        key={item.id}
        role="tab"
        aria-selected={value === item.id}
        type="button"
        onClick={() => onChange(item.id)}
        className={cn('-mb-px flex h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors', value === item.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg')}
      >
        {item.label}
        {item.count !== undefined && <span className="rounded-md bg-surface-3 px-1.5 text-sm text-muted">{item.count}</span>}
      </button>
    ))}
  </div>
);

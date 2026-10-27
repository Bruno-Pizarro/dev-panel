import type { ReactNode } from 'react';

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-surface-2 px-1.5 font-mono text-sm text-muted">
    {children}
  </kbd>
);

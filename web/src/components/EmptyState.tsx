import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}

export const EmptyState = ({ icon, title, children }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-surface-2 text-accent">{icon}</div>
    <h2 className="text-lg font-semibold">{title}</h2>
    {children && <p className="mt-2 max-w-md text-muted">{children}</p>}
  </div>
);

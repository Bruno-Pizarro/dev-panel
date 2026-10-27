import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  action?: ReactNode;
}

export const Card = ({ title, action, className, children, ...rest }: CardProps) => (
  <section className={cn('rounded-2xl border border-line bg-surface', className)} {...rest}>
    {(title || action) && (
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </header>
    )}
    <div className="p-5">{children}</div>
  </section>
);

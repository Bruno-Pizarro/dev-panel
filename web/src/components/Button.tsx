import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-strong text-white hover:bg-accent-strong/90 shadow-sm',
  secondary: 'border border-line bg-surface-2 text-fg hover:bg-surface-3',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = ({ variant = 'secondary', icon, loading, className, children, disabled, ...rest }: ButtonProps) => (
  <button
    className={cn(
      'inline-flex h-10 select-none items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors',
      'disabled:cursor-not-allowed disabled:opacity-50',
      variants[variant],
      className,
    )}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
    {children}
  </button>
);

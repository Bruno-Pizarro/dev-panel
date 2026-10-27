import { cn } from '../lib/cn';

export type Status = 'ok' | 'warn' | 'error' | 'busy' | 'idle';

const colors: Record<Status, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-danger',
  busy: 'bg-info animate-pulse-dot',
  idle: 'bg-muted/50',
};

export const StatusDot = ({ status, label, labelClassName }: { status: Status; label?: string; labelClassName?: string }) => (
  <span className="inline-flex items-start gap-2" role="status" title={label}>
    <span className={cn('mt-[0.4rem] size-2.5 shrink-0 rounded-full', colors[status])} aria-hidden />
    {label && <span className={cn('min-w-0 text-sm text-muted', labelClassName)}>{label}</span>}
  </span>
);

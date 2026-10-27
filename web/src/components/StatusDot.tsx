import { cn } from '../lib/cn';

export type Status = 'ok' | 'warn' | 'error' | 'busy' | 'idle';

const colors: Record<Status, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-danger',
  busy: 'bg-info animate-pulse-dot',
  idle: 'bg-muted/50',
};

export const StatusDot = ({ status, label }: { status: Status; label?: string }) => (
  <span className="inline-flex items-center gap-2 whitespace-nowrap" role="status">
    <span className={cn('size-2.5 rounded-full', colors[status])} aria-hidden />
    {label && <span className="text-sm text-muted">{label}</span>}
  </span>
);

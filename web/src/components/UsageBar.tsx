import { cn } from '../lib/cn';
import type { ClaudeUsageWindow } from '../lib/types';

/** "en 2 h 10 min" hasta una hora de reinicio (epoch en segundos). */
export const untilReset = (resetsAt: number, now = Date.now()): string => {
  const minutes = Math.max(0, Math.round((resetsAt * 1000 - now) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
};

const toneOf = (percentage: number) => (percentage >= 90 ? 'bg-danger' : percentage >= 70 ? 'bg-warning' : 'bg-success');

/** Barra de uso de una ventana (sesión de 5 h o semana). `compact` es la versión del navbar. */
export const UsageBar = ({ label, window, compact = false }: { label: string; window: ClaudeUsageWindow | null; compact?: boolean }) => {
  const percentage = window ? Math.min(100, Math.round(window.usedPercentage)) : null;
  return (
    <div className={cn('min-w-0', compact ? 'w-28' : 'w-full')} title={window ? `${label}: ${percentage}% usado · se reinicia en ${untilReset(window.resetsAt)}` : `${label}: sin dato`}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-medium">{percentage === null ? '—' : `${percentage}%`}</span>
      </div>
      <div className={cn('overflow-hidden rounded-full bg-surface-3', compact ? 'h-1.5' : 'h-2.5')} role="progressbar" aria-valuenow={percentage ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-full rounded-full transition-all', percentage === null ? 'w-0' : toneOf(percentage))} style={{ width: `${percentage ?? 0}%` }} />
      </div>
      {!compact && window && <div className="mt-1 text-sm text-muted">se reinicia en {untilReset(window.resetsAt)}</div>}
    </div>
  );
};

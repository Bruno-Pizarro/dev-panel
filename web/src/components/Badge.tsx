import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  accent: 'bg-accent/15 text-accent',
};

export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={cn('inline-flex h-7 items-center whitespace-nowrap rounded-full px-2.5 text-sm font-medium', tones[tone])}>{children}</span>
);

/** Color según el texto del estado o del veredicto (aprobado, con cambios, revisión…). */
export const toneOf = (text: string | null | undefined): Tone => {
  const value = (text ?? '').toLowerCase();
  if (/aprob|ok|merg|cerrad|complet|pas[oó]/.test(value)) return 'success';
  if (/rechaz|error|fall|bloque/.test(value)) return 'danger';
  if (/cambio|revis|pendiente|progreso|abiert/.test(value)) return 'warning';
  return 'neutral';
};

import { Check, CircleHelp } from 'lucide-react';
import { cn } from '../lib/cn';
import { modelFamily, type AgentStatus } from '../lib/orchestration';

export const STATUS_LABEL: Record<AgentStatus, string> = { running: 'Trabajando', done: 'Terminó', lost: 'Interrumpido' };
const MODEL_TONE: Record<string, string> = { opus: 'bg-accent/15 text-accent', sonnet: 'bg-info/15 text-info', haiku: 'bg-success/15 text-success', fable: 'bg-warning/15 text-warning' };

export const StatusIcon = ({ status, small = false }: { status: AgentStatus; small?: boolean }) => {
  const size = small ? 'size-5' : 'size-6';
  return status === 'running' ? <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-accent/15', size)} title={STATUS_LABEL.running}><span className="size-2 animate-pulse-dot rounded-full bg-accent" /></span>
  : status === 'done' ? <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-success/15 text-success', size)} title={STATUS_LABEL.done}><Check className="size-3.5" aria-hidden /></span>
  : <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted', size)} title="Se cortó sin terminar (la sesión se cerró o Claude lo interrumpió)"><CircleHelp className="size-3.5" aria-hidden /></span>;
};

export const ModelTag = ({ model }: { model: string | null }) => {
  const family = modelFamily(model);
  return family ? <span className={cn('rounded-md px-2 py-0.5 text-sm font-medium', MODEL_TONE[family] ?? 'bg-surface-3 text-muted')} title={model ?? undefined}>{family}</span> : null;
};

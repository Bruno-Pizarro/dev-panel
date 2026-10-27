import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { JobState } from '../lib/hooks';
import { LogView, type LogLine } from './LogView';

const levelOf = (text: string): LogLine['level'] => (text.startsWith('ERROR') || text.startsWith('✗') ? 'error' : text.startsWith('✓') ? 'ok' : 'info');

/** Salida de un trabajo en curso o terminado, con su estado. No se muestra si todavía no hay trabajo. */
export const JobOutput = ({ job }: { job: JobState }) => {
  if (!job.id) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {!job.done && <><Loader2 className="size-4 animate-spin text-info" aria-hidden /> En curso…</>}
        {job.done && job.ok && <><CheckCircle2 className="size-4 text-success" aria-hidden /> Terminó bien</>}
        {job.done && !job.ok && <><XCircle className="size-4 text-danger" aria-hidden /> Terminó con errores</>}
      </div>
      <LogView lines={job.lines.map((text) => ({ text, level: levelOf(text) }))} className="h-56" />
    </div>
  );
};

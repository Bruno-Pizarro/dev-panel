import { useEffect, useRef } from 'react';
import { cn } from '../lib/cn';

export interface LogLine {
  text: string;
  level?: 'info' | 'warn' | 'error' | 'ok';
}

const colors = { info: 'text-fg', warn: 'text-warning', error: 'text-danger', ok: 'text-success' };

/** Terminal de logs: monoespaciada, con auto-scroll al final salvo que el usuario haya subido. */
export const LogView = ({ lines, className }: { lines: LogLine[]; className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    if (nearBottom) element.scrollTop = element.scrollHeight;
  }, [lines]);

  return (
    <div ref={ref} className={cn('h-72 overflow-auto rounded-xl border border-line bg-bg p-4 font-mono text-sm leading-6', className)} role="log">
      {lines.length === 0 && <span className="text-muted">Sin salida todavía.</span>}
      {lines.map((line, index) => (
        <div key={index} className={cn('whitespace-pre-wrap break-all', colors[line.level ?? 'info'])}>
          {line.text}
        </div>
      ))}
    </div>
  );
};

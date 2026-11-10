import { Bot, Check, ChevronLeft, ChevronRight, EyeOff, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatDuration } from '../lib/agentTree';
import { useDnd } from '../lib/dnd';
import { AGENT_DEMO_EVENT, AGENT_DEMO_MS, demoRuns, isDemoRun } from '../lib/agentDemo';
import { cn } from '../lib/cn';
import { useServerEvent, useStoredState } from '../lib/hooks';
import type { AgentRun } from '../lib/types';
import { useShortcut } from '../lib/useShortcuts';
import { ShortcutKey } from './Key';

/** Cuánto sigue a la vista un agente que ya terminó. */
const DONE_VISIBLE_MS = 12_000;

/**
 * Aviso en la esquina inferior derecha de los agentes que Claude delega mientras trabajan (los avisan los hooks de Claude Code,
 * ver el servidor). Muestra uno a la vez; con varios se recorren con las flechas, como un carrusel. Se puede ocultar y queda una
 * etiqueta chica con la cantidad para volver a abrirlo.
 */
export const AgentToast = () => {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [hidden, setHidden] = useStoredState<boolean>('dev-panel.agents.hidden', false);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef(new Set<string>());
  // Vista previa pedida desde Configuración: agentes de ejemplo que se muestran unos segundos, aunque el aviso esté oculto.
  const dnd = useDnd();
  const [demoUntil, setDemoUntil] = useState(0);
  const [demoStart, setDemoStart] = useState(0);
  const [removedDemo, setRemovedDemo] = useState<string[]>([]);

  useEffect(() => {
    api.get<{ agents: AgentRun[] }>('/api/agents').then((result) => setRuns(result.agents), () => undefined);
  }, []);
  useServerEvent<AgentRun[]>('agents', setRuns);
  useEffect(() => {
    const start = () => {
      // Pedir la vista previa es pedir ver el aviso: si estaba oculto, vuelve a mostrarse (y se puede volver a ocultar).
      setHidden(false);
      known.current.clear();
      setRemovedDemo([]);
      setDemoStart(Date.now());
      setDemoUntil(Date.now() + AGENT_DEMO_MS);
    };
    window.addEventListener(AGENT_DEMO_EVENT, start);
    return () => window.removeEventListener(AGENT_DEMO_EVENT, start);
  }, [setHidden]);
  const demoActive = demoUntil > now;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Los terminados se retiran solos pasados unos segundos.
  const visible = useMemo(() => [...runs, ...(demoActive ? demoRuns(demoStart).filter((run) => !removedDemo.includes(run.id)) : [])].filter((run) => run.status === 'running' || (run.status === 'done' && now - Date.parse(run.endedAt ?? run.startedAt) < (isDemoRun(run) ? AGENT_DEMO_MS : DONE_VISIBLE_MS))), [runs, now, demoActive, demoStart, removedDemo]);
  const running = visible.filter((run) => run.status === 'running').length;

  // Cuando llega uno nuevo, el carrusel salta a él.
  useEffect(() => {
    const fresh = visible.findIndex((run) => !known.current.has(run.id));
    visible.forEach((run) => known.current.add(run.id));
    if (fresh >= 0) setIndex(fresh);
  }, [visible]);
  const position = Math.min(index, Math.max(0, visible.length - 1));
  const current = visible[position];

  useShortcut('agents.toggle', () => setHidden(!hidden), visible.length > 0);

  // No molestar silencia el aviso (la vista previa de Configuración se muestra igual: es lo que se pidió ver).
  if (visible.length === 0 || !current || (dnd.active && !demoActive)) return null;

  if (hidden) {
    return (
      <button type="button" onClick={() => setHidden(false)} data-agent-ui className="fixed bottom-4 right-4 z-40 flex h-10 animate-fade-in items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium shadow-pop transition-colors hover:border-accent/50" aria-label={`Mostrar los agentes (${visible.length})`}>
        <Bot className={cn('size-4', running > 0 ? 'text-accent' : 'text-success')} aria-hidden />
        {running > 0 ? `${running} agente${running === 1 ? '' : 's'} trabajando` : 'Agentes terminaron'}
        {running > 0 && <span className="size-2 animate-pulse-dot rounded-full bg-accent" aria-hidden />}
      </button>
    );
  }

  const done = current.status === 'done';
  const elapsed = (done ? Date.parse(current.endedAt ?? current.startedAt) : now) - Date.parse(current.startedAt);
  const move = (delta: number) => setIndex((position + delta + visible.length) % visible.length);
  return (
    <section data-agent-ui className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] animate-fade-in rounded-2xl border border-line bg-surface shadow-pop" aria-label="Agentes de Claude" data-testid="agent-toast">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', done ? 'bg-success/15 text-success' : 'bg-accent/15 text-accent')}>
          {done ? <Check className="size-4" aria-hidden /> : <Bot className="size-4" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{done ? 'Agente terminó' : 'Agente trabajando'}</span>
        <ShortcutKey id="agents.toggle" />
        <button type="button" onClick={() => setHidden(true)} aria-label="Ocultar los agentes" title="Ocultar" className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"><EyeOff className="size-4" aria-hidden /></button>
      </header>
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-sm text-muted">{current.type}</span>
          {isDemoRun(current) && <span className="rounded-md bg-warning/15 px-2 py-0.5 text-sm font-medium text-warning">Vista previa</span>}
          <span className={cn('ml-auto font-mono text-sm tabular-nums', done ? 'text-success' : 'text-accent')}>{formatDuration(elapsed)}</span>
        </div>
        <p className="line-clamp-3 break-words text-sm leading-snug" title={current.description}>{current.description}</p>
        {!done && <div className="h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full w-1/3 animate-shimmer rounded-full bg-accent/70" /></div>}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} disabled={visible.length < 2} aria-label="Agente anterior" className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-30"><ChevronLeft className="size-4" aria-hidden /></button>
          <span className="min-w-12 text-center text-sm tabular-nums text-muted" aria-live="polite">{position + 1} / {visible.length}</span>
          <button type="button" onClick={() => move(1)} disabled={visible.length < 2} aria-label="Agente siguiente" className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-30"><ChevronRight className="size-4" aria-hidden /></button>
        </div>
        <button type="button" onClick={() => (isDemoRun(current) ? setRemovedDemo((list) => [...list, current.id]) : void api.del(`/api/agents/${encodeURIComponent(current.id)}`))} aria-label="Quitar de la lista" title="Quitar de la lista (por si quedó colgado)" className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"><X className="size-4" aria-hidden />Quitar</button>
      </footer>
    </section>
  );
};

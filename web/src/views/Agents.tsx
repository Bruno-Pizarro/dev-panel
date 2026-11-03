import { Bot, Check, ChevronDown, ChevronRight, CircleHelp, FolderGit2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { formatDuration, groupSessions, type AgentSession } from '../lib/agentTree';
import { cn } from '../lib/cn';
import { useServerEvent } from '../lib/hooks';
import type { AgentRun, TicketSummary } from '../lib/types';

const hour = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const day = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? 'hoy' : date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
};

const StatusIcon = ({ status }: { status: AgentRun['status'] }) =>
  status === 'running' ? <span className="flex size-6 items-center justify-center rounded-full bg-accent/15"><span className="size-2.5 animate-pulse-dot rounded-full bg-accent" /></span>
  : status === 'done' ? <span className="flex size-6 items-center justify-center rounded-full bg-success/15 text-success"><Check className="size-4" aria-hidden /></span>
  : <span className="flex size-6 items-center justify-center rounded-full bg-surface-3 text-muted" title="Nunca avisó que terminó"><CircleHelp className="size-4" aria-hidden /></span>;

const AgentNode = ({ run, now }: { run: AgentRun; now: number }) => {
  const end = run.status === 'running' ? now : run.endedAt ? Date.parse(run.endedAt) : null;
  return (
    <li className="relative pl-6 before:absolute before:left-0 before:top-5 before:h-px before:w-5 before:bg-line" data-testid="agent-node">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-4 py-2.5">
        <StatusIcon status={run.status} />
        <Badge>{run.type}</Badge>
        <span className="min-w-0 flex-1 break-words">{run.description}</span>
        <span className="flex items-center gap-3 text-sm text-muted">
          {run.status === 'lost' ? <span>sin aviso de fin</span> : end !== null && <span className={cn('font-mono tabular-nums', run.status === 'running' ? 'text-accent' : 'text-success')}>{formatDuration(end - Date.parse(run.startedAt))}</span>}
          <span title={new Date(run.startedAt).toLocaleString('es-AR')}>{hour(run.startedAt)}</span>
        </span>
      </div>
    </li>
  );
};

const SessionNode = ({ session, now, ticketLink }: { session: AgentSession; now: number; ticketLink: (ticket: string) => string | null }) => {
  const [open, setOpen] = useState(true);
  const link = session.ticket ? ticketLink(session.ticket) : null;
  return (
    <li data-testid="agent-session">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {open ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
          <Bot className="size-5 shrink-0 text-accent" aria-hidden />
          <span className="font-semibold">Sesión</span>
          {session.project && <span className="flex items-center gap-1.5 font-mono text-sm text-muted"><FolderGit2 className="size-4" aria-hidden />{session.project}</span>}
          <span className="text-sm text-muted">{day(session.startedAt)} · {hour(session.startedAt)}</span>
        </button>
        {session.ticket && (link ? <Link to={link} className="rounded-full bg-accent/15 px-2.5 py-0.5 text-sm font-medium text-accent hover:bg-accent/25" title="Abrir el ticket">#{session.ticket}</Link> : <Badge tone="accent">#{session.ticket}</Badge>)}
        <Badge tone={session.running > 0 ? 'accent' : 'neutral'}>{session.runs.length} agente{session.runs.length === 1 ? '' : 's'}{session.running > 0 ? ` · ${session.running} trabajando` : ''}</Badge>
      </div>
      {open && <ul className="ml-6 mt-2 space-y-2 border-l border-line pb-1">{session.runs.map((run) => <AgentNode key={run.id} run={run} now={now} />)}</ul>}
    </li>
  );
};

/** Los subagentes que Claude delegó en los últimos 3 días, como árbol: cada sesión de Claude con sus agentes. */
export const Agents = () => {
  const toast = useToast();
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [onlyActive, setOnlyActive] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api.get<{ agents: AgentRun[] }>('/api/agents').then((result) => setRuns(result.agents), () => setRuns([]));
    api.get<{ tickets: TicketSummary[] }>('/api/tickets').then((result) => setTickets(result.tickets), () => undefined);
  }, []);
  useServerEvent<AgentRun[]>('agents', setRuns);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const sessions = useMemo(() => groupSessions((runs ?? []).filter((run) => !onlyActive || run.status === 'running')), [runs, onlyActive]);
  const total = (runs ?? []).length;
  const running = (runs ?? []).filter((run) => run.status === 'running').length;
  // El chip del ticket lleva a su pantalla: Pruebas si solo se lo revisa, Desarrollo si es propio.
  const ticketLink = (number: string): string | null => {
    const found = tickets.find((item) => item.ticket === number);
    return found ? `${found.kind === 'revision' ? '/pruebas' : '/planificacion'}/${encodeURIComponent(found.dir)}` : null;
  };

  const clear = async () => {
    try {
      const result = await api.del<{ removed: number }>('/api/agents');
      toast('success', result.removed ? `Historial borrado (${result.removed} agente${result.removed === 1 ? '' : 's'}).` : 'No había nada para borrar.');
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Agentes"
        description="Los subagentes que Claude delegó en los últimos 3 días, por sesión. Se actualiza solo."
        actions={<Button variant="danger" icon={<Trash2 className="size-4" />} disabled={total - running === 0} onClick={() => setConfirming(true)}>Borrar el historial</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Chip selected={!onlyActive} onToggle={() => setOnlyActive(false)}>Todos ({total})</Chip>
        <Chip selected={onlyActive} onToggle={() => setOnlyActive(true)}>Trabajando ({running})</Chip>
      </div>
      {runs === null ? (
        <Skeleton className="h-48" />
      ) : sessions.length === 0 ? (
        <EmptyState icon={<Bot className="size-6" />} title={onlyActive ? 'Ningún agente trabajando' : 'Sin agentes en los últimos 3 días'}>
          {onlyActive ? 'Cuando Claude delegue una tarea, aparece acá y en el aviso de la esquina.' : 'Cuando Claude delegue una tarea a un subagente aparece acá. Si nunca aparece nada, falta activar los hooks: Configuración → Agentes de Claude.'}
        </EmptyState>
      ) : (
        <ul className="space-y-4">{sessions.map((session) => <SessionNode key={session.sessionId} session={session} now={now} ticketLink={ticketLink} />)}</ul>
      )}
      <ConfirmModal open={confirming} title="Borrar el historial" confirmLabel="Borrar" danger onConfirm={() => void clear()} onCancel={() => setConfirming(false)}>
        Se borran los agentes que ya terminaron. Los que siguen trabajando se conservan. Solo se pierde el historial del panel: no afecta a Claude Code.
      </ConfirmModal>
    </>
  );
};

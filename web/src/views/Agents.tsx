import { Bot, Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleHelp, Copy, FolderGit2, GitBranch, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { ShortcutKey } from '../components/Key';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useServerEvent } from '../lib/hooks';
import {
  agentDuration, barOf, buildRows, filterSessions, formatSpan, formatTokens, localDay, modelFamily, parentsOf, spanOf, summarize, tokensOf, tokensOnDay,
  type AgentContent, type AgentStatus, type Filters, type OrchAgent, type OrchSession, type OrchestrationReport,
} from '../lib/orchestration';
import type { TicketSummary } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { useShortcutMap } from '../lib/useShortcuts';

const hour = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayLabel = (iso: string) => {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? 'hoy' : date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
};
const STATUS_LABEL: Record<AgentStatus, string> = { running: 'Trabajando', done: 'Terminó', lost: 'Interrumpido' };
const MODEL_TONE: Record<string, string> = { opus: 'bg-accent/15 text-accent', sonnet: 'bg-info/15 text-info', haiku: 'bg-success/15 text-success', fable: 'bg-warning/15 text-warning' };

const StatusIcon = ({ status }: { status: AgentStatus }) =>
  status === 'running' ? <span className="flex size-6 items-center justify-center rounded-full bg-accent/15" title={STATUS_LABEL.running}><span className="size-2.5 animate-pulse-dot rounded-full bg-accent" /></span>
  : status === 'done' ? <span className="flex size-6 items-center justify-center rounded-full bg-success/15 text-success" title={STATUS_LABEL.done}><Check className="size-4" aria-hidden /></span>
  : <span className="flex size-6 items-center justify-center rounded-full bg-surface-3 text-muted" title="Se cortó sin terminar (la sesión se cerró o Claude lo interrumpió)"><CircleHelp className="size-4" aria-hidden /></span>;

const ModelTag = ({ model }: { model: string | null }) => {
  const family = modelFamily(model);
  return family ? <span className={cn('rounded-md px-2 py-0.5 text-sm font-medium', MODEL_TONE[family] ?? 'bg-surface-3 text-muted')} title={model ?? undefined}>{family}</span> : null;
};

const BAR_TONE: Record<AgentStatus, string> = { running: 'bg-accent animate-pulse', done: 'bg-success/70', lost: 'bg-muted/50' };

// ------------------------------------------------------------------ detalle de un agente
const TextBlock = ({ title, text }: { title: string; text: string | null }) => {
  const toast = useToast();
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h4>
        {text && <Button variant="ghost" className="h-8 px-2" icon={<Copy className="size-4" />} onClick={() => void navigator.clipboard.writeText(text).then(() => toast('success', `${title} copiado.`))}>Copiar</Button>}
      </div>
      {text ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg p-3.5 font-mono text-sm leading-6">{text}</pre> : <p className="rounded-lg border border-dashed border-line px-3.5 py-3 text-sm text-muted">No hay {title.toLowerCase()} para mostrar.</p>}
    </section>
  );
};

/** Pedido, pasos y respuesta: se leen de la transcripción recién al abrir el agente (el panel no los guarda). */
const AgentTexts = ({ sessionId, agentId }: { sessionId: string; agentId: string }) => {
  const content = useAsync(() => api.get<AgentContent>(`/api/orchestration/sessions/${encodeURIComponent(sessionId)}/agents/${encodeURIComponent(agentId)}`));
  if (content.loading && !content.data) return <Skeleton className="h-24" />;
  if (content.error || !content.data) return <p className="text-danger">{content.error}</p>;
  if (!content.data.available) return <p className="rounded-lg border border-dashed border-line px-3.5 py-3 text-sm text-muted">La transcripción de este agente ya no está en la carpeta de Claude Code (la limpia cada tanto), así que no se puede mostrar lo que pidió ni lo que contestó.</p>;
  const steps = content.data.steps;
  return (
    <div className="space-y-4">
      <TextBlock title="Pedido" text={content.data.request} />
      {steps.length > 0 && (
        <details className="rounded-lg border border-line" data-testid="agent-steps">
          <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 font-medium">Pasos <Badge>{steps.length}</Badge><span className="text-sm font-normal text-muted">herramientas que usó, en orden</span></summary>
          <ol className="max-h-80 space-y-1 overflow-auto border-t border-line p-3.5 font-mono text-sm">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-3"><span className="w-6 shrink-0 text-right text-muted">{index + 1}</span><span className="w-24 shrink-0 font-medium text-accent">{step.tool}</span><span className="min-w-0 break-all text-muted">{step.summary}</span></li>
            ))}
          </ol>
        </details>
      )}
      <TextBlock title="Respuesta" text={content.data.response} />
    </div>
  );
};

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border border-line bg-bg px-3.5 py-2.5" title={hint}>
    <div className="text-sm text-muted">{label}</div>
    <div className="font-mono text-base font-semibold tabular-nums">{value}</div>
  </div>
);

const AgentDetail = ({ session, agent, now, parent }: { session: OrchSession; agent: OrchAgent; now: number; parent: OrchAgent | null }) => {
  const toast = useToast();
  const duration = agentDuration(agent, now);
  const tools = Object.entries(agent.toolStats).sort((a, b) => b[1] - a[1]);
  const maxTool = tools[0]?.[1] ?? 1;
  return (
    <section className="rounded-2xl border border-accent/40 bg-surface" data-testid="agent-detail" aria-label="Detalle del agente">
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-5 py-3.5">
        <StatusIcon status={agent.status} />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold">{agent.description}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge>{agent.type}</Badge>
            <ModelTag model={agent.model} />
            {agent.background && <Badge tone="info">segundo plano</Badge>}
            <Badge tone={agent.status === 'running' ? 'accent' : agent.status === 'done' ? 'success' : 'neutral'}>{STATUS_LABEL[agent.status]}</Badge>
            {agent.source === 'hook' && <Badge tone="warning">solo lo vio el hook</Badge>}
          </div>
        </div>
        <Button variant="ghost" className="h-8 px-2" icon={<Copy className="size-4" />} onClick={() => void navigator.clipboard.writeText(agent.agentId).then(() => toast('success', 'Id del agente copiado.'))} title="Copiar el id del agente">{agent.agentId.slice(0, 8)}</Button>
      </header>
      <div className="space-y-5 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Duración" value={duration !== null ? formatSpan(duration) : '—'} hint={agent.startedAt ? `${dayLabel(agent.startedAt)} ${hour(agent.startedAt)}${agent.endedAt ? ` → ${hour(agent.endedAt)}` : ''}` : undefined} />
          <Stat label="Tokens" value={formatTokens(tokensOf(agent.tokens))} hint="Entrada + salida + caché creada" />
          <Stat label="Herramientas" value={String(agent.toolCount)} />
          <Stat label="Lo lanzó" value={parent ? parent.type : 'la conversación'} hint={parent?.description} />
        </div>
        <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3"><span className="text-muted">Entrada</span><span className="font-mono tabular-nums">{agent.tokens.input.toLocaleString('es-AR')}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted">Salida</span><span className="font-mono tabular-nums">{agent.tokens.output.toLocaleString('es-AR')}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted">Caché creada</span><span className="font-mono tabular-nums">{agent.tokens.cacheCreate.toLocaleString('es-AR')}</span></div>
          <div className="flex justify-between gap-3" title="Se lee de una caché ya armada: pesa muy poco"><span className="text-muted">Caché leída</span><span className="font-mono tabular-nums">{agent.tokens.cacheRead.toLocaleString('es-AR')}</span></div>
        </div>
        {tools.length > 0 && (
          <section>
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Herramientas usadas</h4>
            <ul className="space-y-1">
              {tools.slice(0, 10).map(([name, count]) => (
                <li key={name} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate font-mono" title={name}>{name}</span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.max(3, (count / maxTool) * 100)}%` }} /></span>
                  <span className="w-8 shrink-0 text-right font-mono tabular-nums text-muted">{count}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {agent.source === 'transcript' ? <AgentTexts key={`${session.id}/${agent.agentId}`} sessionId={session.id} agentId={agent.agentId} /> : <p className="rounded-lg border border-dashed border-line px-3.5 py-3 text-sm text-muted">Este agente solo lo vio el hook de Claude Code: no se encontró su transcripción, así que no hay detalle.</p>}
      </div>
    </section>
  );
};

// ------------------------------------------------------------------ árbol con línea de tiempo
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 lg:grid-cols-[minmax(16rem,1.4fr)_4.5rem_5.5rem_5rem_minmax(8rem,1fr)]';

const AgentTree = ({ session, agents, now, selected, onSelect }: { session: OrchSession; agents: OrchAgent[]; now: number; selected: string | null; onSelect: (id: string) => void }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => buildRows(agents, collapsed), [agents, collapsed]);
  const parents = useMemo(() => parentsOf(agents), [agents]);
  const span = useMemo(() => spanOf(agents, now), [agents, now]);
  const selectedRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);
  const toggle = (id: string) => setCollapsed((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  const allClosed = parents.length > 0 && parents.every((id) => collapsed.has(id));
  return (
    <section className="rounded-2xl border border-line bg-surface" aria-label="Árbol de agentes">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h3 className="text-base font-semibold">Agentes <span className="font-normal text-muted">({agents.length})</span></h3>
        <div className="flex items-center gap-3">
          {span && <span className="hidden text-sm text-muted lg:inline">{hour(new Date(span.start).toISOString())} → {hour(new Date(span.end).toISOString())}</span>}
          {parents.length > 0 && (
            <Button className="h-8" icon={allClosed ? <ChevronsUpDown className="size-4" /> : <ChevronsDownUp className="size-4" />} onClick={() => setCollapsed(allClosed ? new Set() : new Set(parents))}>{allClosed ? 'Expandir todo' : 'Colapsar todo'}</Button>
          )}
        </div>
      </header>
      <div className={cn(GRID, 'hidden border-b border-line px-4 py-2 text-sm text-muted lg:grid')} aria-hidden>
        <span>Agente</span><span>Modelo</span><span className="text-right">Duración</span><span className="text-right">Tokens</span><span>Línea de tiempo</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map(({ agent, level, children, collapsed: closed }) => {
          const duration = agentDuration(agent, now);
          const bar = span ? barOf(agent, span, now) : null;
          const isSelected = selected === agent.agentId;
          return (
            <li key={agent.agentId} ref={isSelected ? selectedRef : undefined} data-testid="agent-row" data-selected={isSelected || undefined}>
              <div className={cn(GRID, 'items-center px-4 py-2 transition-colors', isSelected ? 'bg-accent/10' : 'hover:bg-surface-2')}>
                <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${level * 20}px` }}>
                  {children > 0 ? (
                    <button type="button" onClick={() => toggle(agent.agentId)} aria-expanded={!closed} aria-label={closed ? 'Mostrar los agentes que lanzó' : 'Ocultar los agentes que lanzó'} className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg">
                      {closed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                    </button>
                  ) : <span className="size-6 shrink-0" aria-hidden />}
                  <button type="button" onClick={() => onSelect(agent.agentId)} aria-pressed={isSelected} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <StatusIcon status={agent.status} />
                    <Badge>{agent.type}</Badge>
                    <span className="min-w-0 flex-1 truncate" title={agent.description}>{agent.description}</span>
                    {closed && <span className="shrink-0 text-sm text-muted">+{children}</span>}
                    {agent.background && <span className="shrink-0 text-sm text-info" title="Corrió en segundo plano">2º plano</span>}
                  </button>
                </div>
                <span className="hidden lg:block"><ModelTag model={agent.model} /></span>
                <span className={cn('text-right font-mono text-sm tabular-nums', agent.status === 'running' ? 'text-accent' : 'text-muted')}>{duration !== null ? formatSpan(duration) : '—'}</span>
                <span className="hidden text-right font-mono text-sm tabular-nums text-muted lg:block" title="Entrada + salida + caché creada">{formatTokens(tokensOf(agent.tokens))}</span>
                <span className="relative hidden h-4 lg:block" aria-hidden>
                  <span className="absolute inset-y-1.5 left-0 right-0 rounded-full bg-surface-3/60" />
                  {bar && <span className={cn('absolute inset-y-1 rounded-full', BAR_TONE[agent.status])} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="px-5 py-6 text-center text-muted">Ningún agente coincide con los filtros.</p>}
      <p className="sr-only">{session.id}</p>
    </section>
  );
};

// ------------------------------------------------------------------ sesión
const SessionDetail = ({ session, now, ticketLink, selected, onSelect }: { session: OrchSession; now: number; ticketLink: (ticket: string) => string | null; selected: string | null; onSelect: (id: string | null) => void }) => {
  const summary = useMemo(() => summarize(session, now), [session, now]);
  const link = session.ticket ? ticketLink(session.ticket) : null;
  const agent = selected ? session.agents.find((item) => item.agentId === selected) ?? null : null;
  const parent = agent?.parentAgentId ? session.agents.find((item) => item.agentId === agent.parentAgentId) ?? null : null;
  const detailRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (agent) detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [agent?.agentId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="size-5 shrink-0 text-accent" aria-hidden /><span className="break-words">{session.title ?? 'Sesión sin título'}</span></h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              {session.project && <span className="flex items-center gap-1.5 font-mono"><FolderGit2 className="size-4" aria-hidden />{session.project}</span>}
              {session.branch && session.branch !== 'HEAD' && <span className="flex items-center gap-1.5 font-mono"><GitBranch className="size-4" aria-hidden />{session.branch}</span>}
              {session.firstAt && <span>{dayLabel(session.firstAt)} {hour(session.firstAt)}{session.lastAt ? ` → ${dayLabel(session.lastAt) === dayLabel(session.firstAt) ? '' : `${dayLabel(session.lastAt)} `}${hour(session.lastAt)}` : ''}</span>}
              {session.account && <span>{session.account}</span>}
              {session.entrypoint && <span>{session.entrypoint}</span>}
            </div>
          </div>
          {session.ticket && (link ? <Link to={link} className="rounded-full bg-accent/15 px-2.5 py-0.5 text-sm font-medium text-accent hover:bg-accent/25" title="Abrir el ticket">#{session.ticket}</Link> : <Badge tone="accent">#{session.ticket}</Badge>)}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Agentes" value={`${summary.agents}${summary.running ? ` · ${summary.running} trabajando` : ''}`} />
          <Stat label="Tokens de agentes" value={formatTokens(summary.tokens)} hint="Entrada + salida + caché creada, sumando todos los agentes" />
          <Stat label="Tokens de la conversación" value={formatTokens(summary.mainTokens)} hint="Lo que gastó la conversación principal, sin sus agentes" />
          <Stat label="Duración" value={summary.durationMs !== null ? formatSpan(summary.durationMs) : '—'} />
          <Stat label="Modelos" value={summary.models.join(', ') || '—'} />
        </div>
      </section>
      {session.agents.length === 0 ? <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-muted">Esta sesión no delegó en ningún agente.</p> : <AgentTree session={session} agents={session.agents} now={now} selected={selected} onSelect={onSelect} />}
      <div ref={detailRef}>{agent && <AgentDetail session={session} agent={agent} now={now} parent={parent} />}</div>
    </div>
  );
};

const SessionItem = ({ session, now, active, onPick }: { session: OrchSession; now: number; active: boolean; onPick: () => void }) => {
  const summary = summarize(session, now);
  return (
    <li>
      <button type="button" onClick={onPick} aria-current={active ? 'true' : undefined} data-testid="agent-session" className={cn('block w-full rounded-xl border p-3.5 text-left transition-colors', active ? 'border-accent/60 bg-accent/10' : 'border-line bg-surface hover:bg-surface-2')}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm text-accent">{session.ticket ? `#${session.ticket}` : 'sin ticket'}</span>
          <span className="text-sm text-muted">{session.lastAt ? `${dayLabel(session.lastAt)} ${hour(session.lastAt)}` : ''}</span>
        </div>
        <div className="mt-1 line-clamp-2 font-medium leading-snug">{session.title ?? 'Sesión sin título'}</div>
        <div className="mt-1 truncate font-mono text-sm text-muted">{session.project ?? '—'}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{summary.agents} agente{summary.agents === 1 ? '' : 's'}</Badge>
          {summary.running > 0 && <Badge tone="accent">{summary.running} trabajando</Badge>}
          {summary.tokens > 0 && <Badge>{formatTokens(summary.tokens)} tokens</Badge>}
        </div>
      </button>
    </li>
  );
};

const FilterSelect = ({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) => (
  <label className="flex items-center gap-2 text-sm text-muted">
    {label}
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-fg outline-none focus:border-accent/60">
      {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
    </select>
  </label>
);

/**
 * Orquestación de Claude Code de los últimos 15 días: cada sesión con su árbol de agentes (quién lanzó a quién), una línea de tiempo que
 * muestra qué corrió en paralelo, y el detalle de cada agente. Sale de las transcripciones que Claude Code guarda en disco, así que
 * incluye lo anterior a instalar los hooks. Los filtros y lo elegido van en la URL.
 */
export const Agents = () => {
  const [params, setParams] = useSearchParams();
  const set = (patch: Record<string, string | null>) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '' || value === 'all') next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  const [report, setReport] = useState<OrchestrationReport | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const toast = useToast();

  const load = (refresh = false, silent = true) => {
    if (!silent) setBusy(true);
    api.get<OrchestrationReport>(`/api/orchestration${refresh ? '?refresh=1' : ''}`).then(
      (value) => (setReport(value), setFailed(null)),
      (error: Error) => setFailed(error.message),
    ).finally(() => setBusy(false));
  };
  useEffect(() => {
    load(true);
    api.get<{ tickets: TicketSummary[] }>('/api/tickets').then((result) => setTickets(result.tickets), () => undefined);
    const poll = window.setInterval(() => document.visibilityState === 'visible' && load(), 15_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);
  // Un aviso de los hooks (un agente arrancó o terminó): se vuelve a leer enseguida.
  useServerEvent<unknown>('agents', () => load(true));

  const filters: Filters = { q: params.get('q') ?? '', status: (['running', 'done', 'lost'] as const).find((value) => value === params.get('estado')) ?? 'all', model: params.get('modelo') ?? 'all', type: params.get('tipo') ?? 'all', ticket: params.get('ticket') ?? 'all' };
  const sessions = report?.sessions ?? [];
  const visible = useMemo(() => filterSessions(sessions, filters), [sessions, filters.q, filters.status, filters.model, filters.type, filters.ticket]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = visible.find((session) => session.id === params.get('sesion')) ?? visible[0] ?? null;
  const selected = current && current.agents.some((agent) => agent.agentId === params.get('agente')) ? params.get('agente') : null;

  const allAgents = sessions.flatMap((session) => session.agents);
  const running = allAgents.filter((agent) => agent.status === 'running').length;
  const models = [...new Set(allAgents.map((agent) => modelFamily(agent.model)).filter((model): model is string => model !== null))].sort();
  const types = [...new Set(allAgents.map((agent) => agent.type))].sort();
  const ticketNumbers = [...new Set(sessions.map((session) => session.ticket).filter((ticket): ticket is string => ticket !== null))].sort();
  const today = localDay(now);
  const tokensToday = tokensOnDay(sessions, today);
  const anyFilter = filters.q !== '' || filters.status !== 'all' || filters.model !== 'all' || filters.type !== 'all' || filters.ticket !== 'all';

  // Teclado: J / K recorren los agentes de la sesión tal como se ven, O abre o cierra el detalle y T deja solo los que trabajan.
  const order = current ? buildRows(current.agents, new Set()).map((row) => row.agent.agentId) : [];
  const move = (delta: 1 | -1) => {
    if (!order.length) return;
    const index = selected ? order.indexOf(selected) : -1;
    set({ agente: order[index < 0 ? (delta > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, index + delta))]! });
  };
  useShortcutMap({ 'agents.next': () => move(1), 'agents.prev': () => move(-1), 'agents.open': () => set({ agente: selected ? null : (order[0] ?? null) }), 'agents.active': () => set({ estado: filters.status === 'running' ? null : 'running' }) });

  // El chip del ticket lleva a su pantalla: Pruebas si solo se lo revisa, Desarrollo si es propio.
  const ticketLink = (number: string): string | null => {
    const found = tickets.find((item) => item.ticket === number);
    return found ? `${found.kind === 'revision' ? '/pruebas' : '/planificacion'}/${encodeURIComponent(found.dir)}` : null;
  };

  return (
    <>
      <PageHeader
        title="Agentes"
        description="La orquestación de Claude Code de los últimos 15 días: cada sesión con su árbol de agentes y lo que corrió en paralelo. Sale de las transcripciones, así que incluye lo anterior a los hooks."
        actions={<Button icon={<RefreshCw className={cn('size-4', busy && 'animate-spin')} />} onClick={() => { load(true, false); toast('info', 'Releyendo las transcripciones…'); }}>Actualizar</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent/60 md:max-w-sm">
          <Search className="size-4 text-muted" aria-hidden />
          <input value={filters.q} onChange={(event) => set({ q: event.target.value })} placeholder="Buscar agente, sesión, ticket o rama…" aria-label="Buscar" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
        </label>
        <Chip selected={filters.status === 'running'} onToggle={() => set({ estado: filters.status === 'running' ? null : 'running' })} hint="Solo los que trabajan ahora">Trabajando ({running})</Chip>
        <Chip selected={filters.status === 'lost'} onToggle={() => set({ estado: filters.status === 'lost' ? null : 'lost' })} hint="Los que se cortaron sin terminar">Interrumpidos</Chip>
        <FilterSelect label="Modelo" value={filters.model} options={[['all', 'Todos'], ...models.map((model): [string, string] => [model, model])]} onChange={(value) => set({ modelo: value })} />
        <FilterSelect label="Tipo" value={filters.type} options={[['all', 'Todos'], ...types.map((type): [string, string] => [type, type])]} onChange={(value) => set({ tipo: value })} />
        <FilterSelect label="Ticket" value={filters.ticket} options={[['all', 'Todos'], ...ticketNumbers.map((ticket): [string, string] => [ticket, `#${ticket}`])]} onChange={(value) => set({ ticket: value })} />
        {anyFilter && <Button variant="ghost" className="h-9" onClick={() => set({ q: null, estado: null, modelo: null, tipo: null, ticket: null })}>Quitar filtros</Button>}
        <span className="ml-auto flex items-center gap-3 text-sm text-muted">
          <span title="Tokens de hoy: la conversación y sus agentes (entrada + salida + caché creada)">Hoy: <span className="font-mono font-semibold text-fg">{formatTokens(tokensToday)}</span> tokens</span>
          <span className="flex items-center gap-1" title="Recorrer los agentes con el teclado"><ShortcutKey id="agents.prev" /><ShortcutKey id="agents.next" /><ShortcutKey id="agents.open" /></span>
        </span>
      </div>
      {report === null && failed === null ? (
        <Skeleton className="h-64" />
      ) : failed !== null && report === null ? (
        <p className="text-danger">{failed}</p>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Bot className="size-6" />} title={anyFilter ? 'Nada coincide con los filtros' : 'Sin sesiones de Claude Code en los últimos 15 días'}>
          {anyFilter ? 'Probá quitando algún filtro.' : 'El panel lee las transcripciones de Claude Code en la carpeta de cada cuenta (Claude → Cuentas). Si no aparece nada, revisá que esa carpeta tenga sesiones.'}
        </EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <ul className="max-h-[calc(100vh-14rem)] space-y-2 self-start overflow-y-auto pr-1" aria-label="Sesiones">
            {visible.map((session) => <SessionItem key={session.id} session={session} now={now} active={session.id === current?.id} onPick={() => set({ sesion: session.id, agente: null })} />)}
          </ul>
          {current && <SessionDetail key={current.id} session={current} now={now} ticketLink={ticketLink} selected={selected} onSelect={(id) => set({ agente: id === selected ? null : id })} />}
        </div>
      )}
    </>
  );
};

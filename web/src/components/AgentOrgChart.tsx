import { Bot, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../lib/cn';
import { agentDuration, buildOrg, formatSpan, formatTokens, modelFamily, orgStats, tokensOf, type OrchAgent, type OrchSession, type OrgNode } from '../lib/orchestration';
import { StatusIcon, STATUS_LABEL } from './AgentBits';
import { Button } from './Button';

interface ChartProps {
  session: OrchSession;
  agents: OrchAgent[];
  now: number;
  selected: string | null;
  onSelect: (id: string) => void;
}

const nodeTitle = (agent: OrchAgent, now: number): string => {
  const duration = agentDuration(agent, now);
  return [`${agent.description}`, `${agent.type}${modelFamily(agent.model) ? ` · ${modelFamily(agent.model)}` : ''}${agent.background ? ' · segundo plano' : ''}`, `${STATUS_LABEL[agent.status]}${duration !== null ? ` · ${formatSpan(duration)}` : ''} · ${formatTokens(tokensOf(agent.tokens))} tokens`].join('\n');
};

const Node = ({ node, now, selected, onSelect, collapsed, toggle }: { node: OrgNode; now: number; selected: string | null; onSelect: (id: string) => void; collapsed: ReadonlySet<string>; toggle: (id: string) => void }) => {
  const { agent, children } = node;
  const closed = collapsed.has(agent.agentId);
  const isSelected = selected === agent.agentId;
  return (
    <li className="org-item" data-testid="org-node">
      <div className="flex items-center">
        <button type="button" onClick={() => onSelect(agent.agentId)} aria-pressed={isSelected} title={nodeTitle(agent, now)} className={cn('org-card flex w-60 items-center gap-2 rounded-lg border bg-surface px-2.5 text-left text-sm transition-colors', isSelected ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-accent/50 hover:bg-surface-2', agent.status === 'running' && !isSelected && 'border-accent/50')}>
          <StatusIcon status={agent.status} small />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium leading-tight">{agent.type}{agent.background ? <span className="font-normal text-info"> · 2º plano</span> : null}</span>
            <span className="block truncate leading-tight text-muted">{agent.description}</span>
          </span>
        </button>
        {children.length > 0 && (
          <button type="button" onClick={() => toggle(agent.agentId)} aria-expanded={!closed} aria-label={closed ? `Mostrar los ${children.length} agentes que lanzó` : 'Ocultar los agentes que lanzó'} title={closed ? `Mostrar los ${children.length} agentes que lanzó` : 'Ocultar los agentes que lanzó'} className="-ml-1 flex h-7 items-center gap-0.5 rounded-md px-1 text-sm text-muted hover:bg-surface-3 hover:text-fg">
            {closed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
            <span className="font-mono">{children.length}</span>
          </button>
        )}
      </div>
      {children.length > 0 && !closed && (
        <ul className="org-kids">
          {children.map((child) => <Node key={child.agent.agentId} node={child} now={now} selected={selected} onSelect={onSelect} collapsed={collapsed} toggle={toggle} />)}
        </ul>
      )}
    </li>
  );
};

const spawnersOf = (nodes: OrgNode[]): string[] => nodes.flatMap((node) => (node.children.length ? [node.agent.agentId, ...spawnersOf(node.children)] : []));

/**
 * Organigrama de la sesión, de izquierda a derecha: el coordinador (la conversación principal, que es quien delega) y, colgando de él, cada
 * agente que lanzó; de cada agente, los que lanzó a su vez. Las tarjetas muestran estado, tipo y descripción; la tarjeta elegida abre su detalle.
 */
export const AgentOrgChart = ({ session, agents, now, selected, onSelect }: ChartProps) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildOrg(agents), [agents]);
  const stats = useMemo(() => orgStats(tree), [tree]);
  const spawners = useMemo(() => spawnersOf(tree), [tree]);
  const toggle = (id: string) => setCollapsed((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  const rootClosed = collapsed.has('__coordinator');
  const allClosed = spawners.length > 0 && spawners.every((id) => collapsed.has(id));
  return (
    <section className="rounded-2xl border border-line bg-surface" aria-label="Organigrama de agentes">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h3 className="text-base font-semibold">Organigrama <span className="font-normal text-muted">({agents.length} agentes)</span></h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>El coordinador lanzó <span className="font-mono font-semibold text-fg">{stats.byCoordinator}</span></span>
          {stats.byAgents > 0 && <span>Otros agentes lanzaron <span className="font-mono font-semibold text-fg">{stats.byAgents}</span> ({stats.spawners} {stats.spawners === 1 ? 'agente lanzó' : 'agentes lanzaron'} a otros)</span>}
          <span>{stats.levels} {stats.levels === 1 ? 'nivel' : 'niveles'}</span>
          {spawners.length > 0 && <Button className="h-8" icon={allClosed ? <ChevronsUpDown className="size-4" /> : <ChevronsDownUp className="size-4" />} onClick={() => setCollapsed(allClosed ? new Set() : new Set(spawners))}>{allClosed ? 'Expandir todo' : 'Colapsar todo'}</Button>}
        </div>
      </header>
      {tree.length === 0 ? <p className="px-5 py-6 text-center text-muted">Ningún agente coincide con los filtros.</p> : (
        <div className="overflow-auto p-5" style={{ maxHeight: 'calc(100vh - 20rem)' }}>
          <ul className="inline-block min-w-full">
            <li className="org-item" data-testid="org-root">
              <div className="flex items-center">
                <div className="org-card flex w-60 items-center gap-2 rounded-lg border border-accent/60 bg-accent/10 px-2.5 text-sm" title={`Coordinador: la conversación principal de la sesión (${session.title ?? 'sin título'}). Es quien lanza a los agentes.`}>
                  <Bot className="size-5 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold leading-tight">Coordinador</span>
                    <span className="block truncate leading-tight text-muted">Conversación principal</span>
                  </span>
                </div>
                <button type="button" onClick={() => toggle('__coordinator')} aria-expanded={!rootClosed} aria-label={rootClosed ? 'Mostrar los agentes' : 'Ocultar los agentes'} className="-ml-1 flex h-7 items-center gap-0.5 rounded-md px-1 text-sm text-muted hover:bg-surface-3 hover:text-fg">
                  {rootClosed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                  <span className="font-mono">{tree.length}</span>
                </button>
              </div>
              {!rootClosed && (
                <ul className="org-kids">
                  {tree.map((node) => <Node key={node.agent.agentId} node={node} now={now} selected={selected} onSelect={onSelect} collapsed={collapsed} toggle={toggle} />)}
                </ul>
              )}
            </li>
          </ul>
        </div>
      )}
    </section>
  );
};

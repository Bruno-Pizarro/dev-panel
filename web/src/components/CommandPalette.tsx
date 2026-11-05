import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { agentHits, searchHits, ticketHits, type SearchHit } from '../lib/globalSearch';
import { allNavItems } from '../lib/nav';
import type { AgentRun, TicketSummary } from '../lib/types';
import { Kbd } from './Kbd';

/** Paleta de comandos (Ctrl/⌘ + K): ir a cualquier vista. Las acciones de cada fase se suman acá. */
export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchHit[]>([]);
  const navigate = useNavigate();

  // Se carga al abrir: así los tickets y agentes nuevos aparecen sin recargar el panel.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    Promise.all([
      api.get<{ tickets: TicketSummary[] }>('/api/tickets').then((result) => ticketHits(result.tickets), () => []),
      api.get<{ agents: AgentRun[] }>('/api/agents').then((result) => agentHits(result.agents), () => []),
    ]).then(([tickets, agents]) => setIndex([...tickets, ...agents]));
  }, [open]);

  const found = useMemo(() => searchHits(index, query), [index, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-80 items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted transition-colors hover:border-accent/40"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Ir a…</span>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </button>
      <Command.Dialog open={open} onOpenChange={setOpen} label="Paleta de comandos" className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[18vh]">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
        <div className="relative w-full max-w-xl animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <Command.Input value={query} onValueChange={setQuery} placeholder="Buscar vistas, tickets o agentes…" className="h-14 w-full border-b border-line bg-transparent px-5 text-base outline-none placeholder:text-muted" />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-muted">Sin resultados.</Command.Empty>
            <Command.Group heading="Vistas" className="text-sm text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
              {allNavItems.map((item) => (
                <Command.Item
                  key={item.path}
                  value={`${item.label} ${item.description}`}
                  onSelect={() => {
                    navigate(item.path);
                    setOpen(false);
                  }}
                  className="flex h-12 cursor-pointer items-center gap-3 rounded-lg px-3 text-fg data-[selected=true]:bg-accent/15 data-[selected=true]:text-accent"
                >
                  <item.icon className="size-5 shrink-0" aria-hidden />
                  <div className="leading-tight">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-sm text-muted">{item.description}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
            {(['Tickets', 'Agentes'] as const).map((group) => {
              const hits = found.filter((hit) => hit.group === group);
              if (!hits.length) return null;
              return (
                <Command.Group key={group} heading={group} className="text-sm text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                  {hits.map((hit) => (
                    <Command.Item
                      key={hit.id}
                      value={hit.value}
                      onSelect={() => {
                        navigate(hit.path);
                        setOpen(false);
                      }}
                      className="flex h-12 cursor-pointer items-center rounded-lg px-3 text-fg data-[selected=true]:bg-accent/15 data-[selected=true]:text-accent"
                    >
                      <div className="min-w-0 leading-tight">
                        <div className="truncate font-medium">{hit.title}</div>
                        <div className="truncate text-sm text-muted">{hit.detail}</div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
        </div>
      </Command.Dialog>
    </>
  );
};

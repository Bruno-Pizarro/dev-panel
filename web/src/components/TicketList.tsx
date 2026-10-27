import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/cn';
import { timeAgo } from '../lib/tickets';
import type { TicketSummary } from '../lib/types';
import { Badge, toneOf } from './Badge';

/** Lista lateral de carpetas de la base de conocimiento, con búsqueda por número, título o rama. */
export const TicketList = ({ tickets, basePath }: { tickets: TicketSummary[]; basePath: string }) => {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return tickets.filter((ticket) => !text || `${ticket.ticket ?? ''} ${ticket.title} ${ticket.dir} ${ticket.rama ?? ''}`.toLowerCase().includes(text));
  }, [tickets, query]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent/60">
        <Search className="size-4 text-muted" aria-hidden />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ticket, título o rama…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
      </label>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {visible.map((ticket) => (
          <li key={ticket.dir}>
            <NavLink to={`${basePath}/${encodeURIComponent(ticket.dir)}`} className={({ isActive }) => cn('block rounded-xl border p-3.5 transition-colors', isActive ? 'border-accent/60 bg-accent/10' : 'border-line bg-surface hover:border-accent/30')}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm text-accent">{ticket.ticket ? `#${ticket.ticket}` : 'sin ticket'}</span>
                <span className="text-sm text-muted">{timeAgo(ticket.lastUpdated)}</span>
              </div>
              <div className="mt-1 font-medium leading-snug">{ticket.title}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ticket.estado && <Badge tone={toneOf(ticket.estado)}>{ticket.estado}</Badge>}
                {ticket.lastTest?.resultado && <Badge tone="info">{ticket.lastTest.resultado}</Badge>}
                {ticket.review && <Badge tone={toneOf(ticket.review)}>review: {ticket.review}</Badge>}
                {ticket.images > 0 && <Badge>{ticket.images} capturas</Badge>}
              </div>
            </NavLink>
          </li>
        ))}
        {visible.length === 0 && <li className="px-2 py-8 text-center text-muted">Sin resultados.</li>}
      </ul>
    </div>
  );
};

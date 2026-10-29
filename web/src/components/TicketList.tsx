import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStoredState } from '../lib/hooks';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/cn';
import { timeAgo } from '../lib/tickets';
import { CONCLUSIONS, conclusionInfo } from '../lib/conclusion';
import type { Conclusion, TicketSummary } from '../lib/types';
import { Chip } from './Chip';
import { Badge, toneOf } from './Badge';
import { Tooltip } from './Tooltip';

/** Lista lateral de carpetas de la base de conocimiento, con búsqueda por número, título o rama. */
export const TicketList = ({ tickets, basePath, withTestFilters = false }: { tickets: TicketSummary[]; basePath: string; withTestFilters?: boolean }) => {
  const [query, setQuery] = useState('');
  // Por defecto no se muestran los aprobados: lo que importa es lo que falta resolver.
  const [shown, setShown] = useStoredState<Conclusion[]>('devpanel.tests.shown', ['requiere-cambios', 'sin-conclusion']);
  const [pendingOnly, setPendingOnly] = useStoredState<boolean>('devpanel.tests.pending', false);
  // Por defecto solo carpetas con número de ticket: así la primera vista no se llena de archivos sueltos.
  const [ticketKinds, setTicketKinds] = useStoredState<Array<'con' | 'sin'>>('devpanel.tickets.kinds', ['con']);
  // Propios (los desarrollo yo) o revisiones (código de otra persona): la conclusión y el checklist solo tienen sentido en estas últimas.
  const [origins, setOrigins] = useStoredState<Array<'propio' | 'revision'>>('devpanel.tickets.origins', ['propio', 'revision']);
  const originOf = (ticket: TicketSummary): 'propio' | 'revision' => (ticket.kind === 'revision' ? 'revision' : 'propio');
  const reviewFilters = (ticket: TicketSummary) => withTestFilters && ticket.testStatus !== undefined && originOf(ticket) === 'revision';
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return tickets.filter((ticket) => ticketKinds.includes(ticket.ticket ? 'con' : 'sin')).filter((ticket) => !withTestFilters || origins.includes(originOf(ticket))).filter((ticket) => {
      if (reviewFilters(ticket) && ticket.testStatus) {
        if (!shown.includes(ticket.testStatus.conclusion)) return false;
        if (pendingOnly && ticket.testStatus.checklistDone >= ticket.testStatus.checklistTotal) return false;
      }
      return true;
    }).filter((ticket) => !text || `${ticket.ticket ?? ''} ${ticket.title} ${ticket.dir} ${ticket.rama ?? ''}`.toLowerCase().includes(text));
  }, [tickets, query, shown, pendingOnly, withTestFilters, ticketKinds, origins]);
  const hiddenKind = tickets.filter((ticket) => !ticketKinds.includes(ticket.ticket ? 'con' : 'sin')).length;
  const inOrigin = tickets.filter((ticket) => ticketKinds.includes(ticket.ticket ? 'con' : 'sin') && (!withTestFilters || origins.includes(originOf(ticket))));
  const hidden = withTestFilters ? inOrigin.length - inOrigin.filter((ticket) => !reviewFilters(ticket) || (ticket.testStatus && shown.includes(ticket.testStatus.conclusion))).length : 0;
  const countOf = (origin: 'propio' | 'revision') => tickets.filter((ticket) => ticketKinds.includes(ticket.ticket ? 'con' : 'sin') && originOf(ticket) === origin).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent/60">
        <Search className="size-4 text-muted" aria-hidden />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ticket, título o rama…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
      </label>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {([['con', 'Con ticket'], ['sin', 'Sin ticket']] as const).map(([id, label]) => (
            <Chip key={id} selected={ticketKinds.includes(id)} onToggle={() => setTicketKinds(ticketKinds.includes(id) ? ticketKinds.filter((value) => value !== id) : [...ticketKinds, id])}>{label}</Chip>
          ))}
        </div>
        {hiddenKind > 0 && <p className="text-sm text-muted">{hiddenKind} sin número de ticket ocultas por el filtro.</p>}
      </div>
      {withTestFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {([['propio', 'Desarrollos propios'], ['revision', 'Revisiones de otros']] as const).map(([id, label]) => (
            <Chip key={id} selected={origins.includes(id)} onToggle={() => setOrigins(origins.includes(id) ? origins.filter((value) => value !== id) : [...origins, id])} hint={id === 'propio' ? 'Tickets que desarrollo yo' : 'Tickets donde solo reviso el código de otra persona'}>{label} ({countOf(id)})</Chip>
          ))}
        </div>
      )}
      {withTestFilters && origins.includes('revision') && countOf('revision') > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {CONCLUSIONS.map((item) => <Chip key={item.id} selected={shown.includes(item.id)} onToggle={() => setShown(shown.includes(item.id) ? shown.filter((value) => value !== item.id) : [...shown, item.id])}>{item.label}</Chip>)}
            <Chip selected={pendingOnly} onToggle={() => setPendingOnly(!pendingOnly)} hint="Solo los que tienen pasos del checklist sin tildar">Checklist pendiente</Chip>
          </div>
          {hidden > 0 && <p className="text-sm text-muted">{hidden} revisiones ocultas por el filtro (por defecto no se muestran las aprobadas).</p>}
        </div>
      )}
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
                {reviewFilters(ticket) && ticket.testStatus && <Badge tone={conclusionInfo(ticket.testStatus.conclusion).tone}>{conclusionInfo(ticket.testStatus.conclusion).label}</Badge>}
                {reviewFilters(ticket) && ticket.testStatus && ticket.testStatus.checklistTotal > 0 && ticket.testStatus.runs > 0 && <Badge tone={ticket.testStatus.checklistDone === ticket.testStatus.checklistTotal ? 'success' : 'warning'}>checklist {ticket.testStatus.checklistDone}/{ticket.testStatus.checklistTotal}</Badge>}
                {ticket.lastTest?.resultado && (
                  <Tooltip width={300} content={<><div className="mb-1 font-semibold">Última tanda de pruebas: {ticket.lastTest.resultado}</div><p className="text-muted">Es el resultado que se registró en <span className="font-mono">ticket.json</span> para la última tanda de pruebas (por ejemplo, 25 de 25 casos pasaron). <strong className="text-fg">No indica que el desarrollo esté terminado</strong>: eso depende del estado del ticket y de la revisión.</p></>}>
                    <span className="inline-flex max-w-full min-w-0"><Badge tone="info">Pruebas {ticket.lastTest.resultado}</Badge></span>
                  </Tooltip>
                )}
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

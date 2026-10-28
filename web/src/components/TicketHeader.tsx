import { ClipboardCheck, ExternalLink, GitBranch, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TicketDetail } from '../lib/types';
import { Badge, toneOf } from './Badge';

/** `to` indica a qué vista hermana se puede saltar con el mismo ticket (Pruebas ⇄ Desarrollo). */
export const TicketHeader = ({ detail, to }: { detail: TicketDetail; to?: 'pruebas' | 'desarrollo' }) => (
  <header className="mb-6">
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-accent">{detail.ticket ? `#${detail.ticket}` : detail.dir}</span>
      {detail.estado && <Badge tone={toneOf(detail.estado)}>{detail.estado}</Badge>}
      {to && (
        <Link to={`${to === 'pruebas' ? '/pruebas' : '/planificacion'}/${encodeURIComponent(detail.dir)}`} className="inline-flex h-8 items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/20">
          {to === 'pruebas' ? <ClipboardCheck className="size-4" aria-hidden /> : <Layers className="size-4" aria-hidden />}
          {to === 'pruebas' ? 'Ir a pruebas' : 'Ir al desarrollo'}
        </Link>
      )}
      {detail.meta?.url && (
        <a href={detail.meta.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
          Abrir ticket <ExternalLink className="size-4" aria-hidden />
        </a>
      )}
    </div>
    <h1 className="mt-1 text-2xl font-semibold tracking-tight">{detail.title}</h1>
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-muted">
      {detail.rama && <span className="inline-flex items-center gap-1.5 font-mono text-sm"><GitBranch className="size-4" aria-hidden />{detail.rama}</span>}
      {detail.repos.length > 0 && <span className="text-sm">Repos: {detail.repos.join(', ')}</span>}
      {detail.meta?.responsable && <span className="text-sm">Responsable: {detail.meta.responsable}</span>}
    </div>
    {!detail.hasMeta && <p className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">Esta carpeta no tiene <span className="font-mono">ticket.json</span>: se muestran solo sus archivos. Las skills lo generan al cerrar cada etapa.</p>}
  </header>
);

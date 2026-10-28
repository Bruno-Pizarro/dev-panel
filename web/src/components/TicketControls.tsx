import { Check, ClipboardCheck, Layers, Power, Rocket } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { TicketDetail } from '../lib/types';
import { Button } from './Button';
import { Chip } from './Chip';
import { useToast } from './Toast';

interface TicketControlsProps {
  detail: TicketDetail;
  view: 'desarrollo' | 'pruebas';
  onChanged: () => void;
}

/**
 * Desarrollo: check "Listo para pruebas" (al marcarlo te lleva a Pruebas).
 * Pruebas: salto de vuelta al desarrollo y tipo del ticket (desarrollo propio o solo revisión de otra persona).
 */
export const TicketControls = ({ detail, view, onChanged }: TicketControlsProps) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const dir = encodeURIComponent(detail.dir);
  const kind = detail.kind ?? 'desarrollo';

  const save = async (patch: { ready?: boolean; kind?: 'desarrollo' | 'revision' }) => {
    setBusy(true);
    try {
      await api.put(`/api/tickets/${dir}/state`, patch);
      onChanged();
      return true;
    } catch (error) {
      toast('error', (error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const services = detail.services;
  const optional = services?.optional ?? [];
  const startServices = async () => {
    setBusy(true);
    try {
      await api.post('/api/startup/run', { services: optional });
      toast('success', 'Levantado en marcha: seguilo en la vista Levantado.');
      navigate('/levantado');
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startButton = (
    <div className="flex flex-wrap items-center gap-3">
      <Button className="h-9" icon={<Power className="size-4" />} loading={busy} onClick={startServices} title="Levanta, en el orden correcto, lo que pide este ticket">Levantar servicios</Button>
      <span className="text-sm text-muted">
        {optional.length ? <>Para probarlo, además de los obligatorios: <span className="font-mono text-fg">{optional.join(', ')}</span></> : 'Solo los obligatorios'}
        {services?.source.includes('ticket.json') && <> (incluye lo que declara el ticket en <span className="font-mono">servicios</span>)</>}
        {services && services.skipped.length > 0 && <> · sin servicio propio: <span className="font-mono">{services.skipped.join(', ')}</span></>}
      </span>
    </div>
  );

  if (view === 'desarrollo') {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        {detail.readyForTests ? (
          <>
            <span className="inline-flex items-center gap-2 font-medium text-success"><Check className="size-5" aria-hidden />Listo para pruebas</span>
            <Button className="h-9" icon={<ClipboardCheck className="size-4" />} onClick={() => navigate(`/pruebas/${dir}`)}>Ir a pruebas</Button>
            <Button className="h-9" variant="ghost" loading={busy} onClick={() => save({ ready: false })}>Todavía no</Button>
          </>
        ) : (
          <>
            <Button variant="primary" className="h-10" icon={<Rocket className="size-4" />} loading={busy} onClick={async () => (await save({ ready: true })) && navigate(`/pruebas/${dir}`)}>Marcar listo para pruebas</Button>
            <span className="text-sm text-muted">Al marcarlo te lleva a Pruebas con este ticket abierto.</span>
          </>
        )}
        <div className="basis-full border-t border-line pt-3">{startButton}</div>
      </div>
    );
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <span className="text-sm text-muted">Tipo de ticket</span>
      <Chip selected={kind === 'desarrollo'} onToggle={() => kind !== 'desarrollo' && save({ kind: 'desarrollo' })}>Lo desarrollo yo</Chip>
      <Chip selected={kind === 'revision'} onToggle={() => kind !== 'revision' && save({ kind: 'revision' })} hint="Solo reviso el desarrollo de otra persona: no aparece en Desarrollo">Solo revisión</Chip>
      {kind === 'desarrollo' && <Button className="h-9" icon={<Layers className="size-4" />} onClick={() => navigate(`/planificacion/${dir}`)}>Ir al desarrollo</Button>}
      {kind === 'revision' && <span className="text-sm text-muted">No se muestra en Desarrollo.</span>}
      <div className="basis-full border-t border-line pt-3">{startButton}</div>
    </div>
  );
};

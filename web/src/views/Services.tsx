import { FileText, RefreshCw, RotateCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { ConfirmModal } from '../components/ConfirmModal';
import { ContainerLogs } from '../components/ContainerLogs';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { StatusDot, type Status } from '../components/StatusDot';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { usePolling } from '../lib/hooks';
import type { ContainerInfo, TscStatus } from '../lib/types';

type Filter = 'all' | 'running' | 'stopped';

const stateStatus = (state: string, status = ''): Status => (state === 'running' ? (status.includes('unhealthy') ? 'warn' : 'ok') : state === 'restarting' ? 'warn' : state === 'exited' ? 'error' : 'idle');

/** Puertos publicados en el host, sin duplicados IPv4/IPv6 (ej. "3007, 9232"). */
const hostPorts = (ports: string): string =>
  [...new Set([...ports.matchAll(/(?:0\.0\.0\.0|\[::\]):(\d+)->/g)].map((match) => match[1]))].join(', ');

const tscBadge = (tsc: TscStatus | undefined) => {
  if (!tsc || tsc.state === 'unknown') return <span className="text-muted">—</span>;
  const map = {
    ok: { label: 'tsc OK', cls: 'bg-success/15 text-success' },
    errors: { label: `${tsc.errors} errores`, cls: 'bg-danger/15 text-danger' },
    stuck: { label: 'tsc trabado', cls: 'bg-warning/15 text-warning' },
  } as const;
  const entry = map[tsc.state as keyof typeof map];
  return <span className={cn('inline-flex h-7 items-center rounded-full px-2.5 text-sm font-medium', entry.cls)}>{entry.label}</span>;
};

export const Services = () => {
  const toast = useToast();
  const containers = usePolling(() => api.get<{ containers: ContainerInfo[] }>('/api/containers'), 5_000);
  const tsc = usePolling(() => api.get<{ tsc: Record<string, TscStatus> }>('/api/containers/tsc'), 30_000);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [logsOf, setLogsOf] = useState<string | null>(null);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => containers.data?.containers ?? [], [containers.data]);
  const running = list.filter((container) => container.state === 'running').length;
  const visible = useMemo(
    () =>
      list.filter((container) => {
        if (filter === 'running' && container.state !== 'running') return false;
        if (filter === 'stopped' && container.state === 'running') return false;
        const text = `${container.name} ${container.service ?? ''}`.toLowerCase();
        return text.includes(query.trim().toLowerCase());
      }),
    [list, filter, query],
  );

  const restart = async () => {
    if (!restarting) return;
    setBusy(true);
    try {
      await api.post(`/api/containers/${encodeURIComponent(restarting)}/restart`, { confirm: true });
      toast('success', `${restarting} reiniciado.`);
      containers.refresh();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
      setRestarting(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Servicios"
        description={containers.data ? `${running} corriendo · ${list.length - running} detenidos` : 'Contenedores del entorno local.'}
        actions={<Button icon={<RefreshCw className="size-4" />} onClick={() => (containers.refresh(), tsc.refresh())}>Actualizar</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex h-10 w-72 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent/60">
          <Search className="size-4 text-muted" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar por nombre…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
        </label>
        {(['all', 'running', 'stopped'] as const).map((value) => (
          <Chip key={value} selected={filter === value} onToggle={() => setFilter(value)}>
            {value === 'all' ? 'Todos' : value === 'running' ? 'Corriendo' : 'Detenidos'}
          </Chip>
        ))}
      </div>

      <Card className="overflow-hidden !p-0">
        {containers.error && <p className="p-5 text-danger">{containers.error}</p>}
        {!containers.data ? (
          <div className="space-y-3 p-5"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Contenedor</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-3 py-3 font-medium">Puertos</th>
                <th className="px-3 py-3 font-medium">tsc</th>
                <th className="px-5 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((container) => (
                <tr key={container.name} className="transition-colors hover:bg-surface-2/60">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <StatusDot status={stateStatus(container.state, container.status)} />
                      <div>
                        <div className="font-medium">{container.name}</div>
                        {container.service && container.service !== container.name && <div className="font-mono text-sm text-muted">servicio: {container.service}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted">{container.status}</td>
                  <td className="px-3 py-3 font-mono text-muted">{hostPorts(container.ports) || '—'}</td>
                  <td className="px-3 py-3">{container.state === 'running' ? tscBadge(tsc.data?.tsc[container.name]) : <span className="text-muted">—</span>}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <Button className="h-9" icon={<FileText className="size-4" />} onClick={() => setLogsOf(container.name)}>Logs</Button>
                      <Button className="h-9" icon={<RotateCw className="size-4" />} onClick={() => setRestarting(container.name)}>Reiniciar</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">Ningún contenedor coincide.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <ContainerLogs name={logsOf} onClose={() => setLogsOf(null)} />
      <ConfirmModal open={restarting !== null} title="Reiniciar contenedor" confirmLabel="Reiniciar" loading={busy} onCancel={() => setRestarting(null)} onConfirm={restart}>
        Se va a reiniciar <span className="font-mono text-fg">{restarting}</span>. Las conexiones activas se cortan.
      </ConfirmModal>
    </>
  );
};

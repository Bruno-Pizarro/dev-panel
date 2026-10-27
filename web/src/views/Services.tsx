import { CircleHelp, FileText, RefreshCw, RotateCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { ConfirmModal } from '../components/ConfirmModal';
import { ContainerLogs } from '../components/ContainerLogs';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tooltip } from '../components/Tooltip';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { pillStyle, serviceColor, tint } from '../lib/colors';
import { explainContainer, sortContainers, type SortKey } from '../lib/containers';
import { usePolling, useStoredState } from '../lib/hooks';
import { timeAgo } from '../lib/tickets';
import type { ContainerInfo, DevPanelConfig, TscStatus } from '../lib/types';

type Filter = 'all' | 'running' | 'stopped';

const SORTS: Array<{ key: SortKey; label: string; hint: string }> = [
  { key: 'order', label: 'Orden de levantado', hint: 'MinIO, infraestructura, obligatorios y opcionales; dentro de cada lugar, el que arrancó último primero.' },
  { key: 'recent', label: 'Último arranque', hint: 'Los que se levantaron más recientemente arriba.' },
  { key: 'state', label: 'Estado', hint: 'Los que están corriendo primero.' },
  { key: 'name', label: 'Nombre', hint: 'Alfabético.' },
];

/** Puertos publicados en el host, sin duplicados IPv4/IPv6 (ej. "3007, 9232"). */
const hostPorts = (ports: string): string => [...new Set([...ports.matchAll(/(?:0\.0\.0\.0|\[::\]):(\d+)->/g)].map((match) => match[1]))].join(', ');

const groupOf = (config: DevPanelConfig, service: string | null): { label: string; tone: 'info' | 'accent' | 'neutral' | 'warning' } => {
  const { startup } = config;
  const infra = [...startup.stage1, ...startup.stage2, ...Object.values(startup.groups).flatMap((group) => group.withStage2)];
  if (service && infra.includes(service)) return { label: 'Infraestructura', tone: 'info' };
  if (service && startup.mandatory.includes(service)) return { label: 'Obligatorio', tone: 'accent' };
  if (service && startup.optional.includes(service)) return { label: 'Opcional', tone: 'neutral' };
  return { label: 'Otro', tone: 'neutral' };
};

const tscBadge = (tsc: TscStatus | undefined) => {
  if (!tsc || tsc.state === 'unknown') return <span className="text-muted">—</span>;
  const info = {
    ok: { label: 'tsc OK', tone: 'success' as const, text: 'El compilador en modo watch terminó sin errores.' },
    errors: { label: `${tsc.errors} errores`, tone: 'danger' as const, text: 'El código tiene errores de TypeScript. Corregilos: el servicio sigue corriendo la última versión que compiló bien.' },
    stuck: { label: 'tsc trabado', tone: 'warning' as const, text: 'tsc --watch quedó pegado, típico al cambiar de rama (busca archivos que ya no existen). Reiniciá el contenedor.' },
  }[tsc.state as 'ok' | 'errors' | 'stuck'];
  return <Tooltip content={info.text}><Badge tone={info.tone}>{info.label}</Badge></Tooltip>;
};

const StateLegend = () => (
  <Card title="¿Qué significa cada estado?" className="mb-4">
    <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
      {[
        { state: 'running', status: 'Up 3 hours' }, { state: 'running', status: 'Up 4 days (unhealthy)' }, { state: 'exited', status: 'Exited (1) ago' },
        { state: 'exited', status: 'Exited (0) ago' }, { state: 'restarting', status: 'Restarting' }, { state: 'running', status: 'Up 5 seconds (health: starting)' },
      ].map((sample) => {
        const info = explainContainer(sample);
        return (
          <div key={info.label}>
            <dt><Badge tone={info.tone}>{info.label}</Badge></dt>
            <dd className="mt-1.5 text-sm text-muted">{info.meaning}{info.action && <span className="mt-1 block text-fg"><strong>Qué hacer:</strong> {info.action}</span>}</dd>
          </div>
        );
      })}
    </dl>
    <p className="mt-4 text-sm text-muted"><strong className="text-fg">Healthcheck:</strong> cada servicio puede declarar un comando de prueba (por ejemplo "¿responde el puerto?"). Docker lo ejecuta cada tanto; si falla varias veces seguidas, marca el contenedor como <em>unhealthy</em>. No lo detiene: es solo una señal de que algo anda mal por dentro.</p>
  </Card>
);

export const Services = ({ config }: { config: DevPanelConfig }) => {
  const toast = useToast();
  const containers = usePolling(() => api.get<{ containers: ContainerInfo[] }>('/api/containers'), 5_000);
  const tsc = usePolling(() => api.get<{ tsc: Record<string, TscStatus> }>('/api/containers/tsc'), 30_000);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useStoredState<SortKey>('devpanel.services.sort', 'order');
  const [query, setQuery] = useState('');
  const [help, setHelp] = useState(false);
  const [logsOf, setLogsOf] = useState<string | null>(null);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => containers.data?.containers ?? [], [containers.data]);
  const running = list.filter((container) => container.state === 'running').length;
  const visible = useMemo(
    () =>
      sortContainers(
        list.filter((container) => {
          if (filter === 'running' && container.state !== 'running') return false;
          if (filter === 'stopped' && container.state === 'running') return false;
          return `${container.name} ${container.service ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());
        }),
        sort,
      ),
    [list, filter, query, sort],
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
        actions={
          <>
            <Button icon={<CircleHelp className="size-4" />} onClick={() => setHelp(!help)}>{help ? 'Ocultar ayuda' : 'Ayuda'}</Button>
            <Button icon={<RefreshCw className="size-4" />} onClick={() => (containers.refresh(), tsc.refresh())}>Actualizar</Button>
          </>
        }
      />
      {help && <StateLegend />}

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex h-10 w-72 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent/60">
          <Search className="size-4 text-muted" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar por nombre…" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
        </label>
        <div className="flex gap-2">
          {(['all', 'running', 'stopped'] as const).map((value) => <Chip key={value} selected={filter === value} onToggle={() => setFilter(value)}>{value === 'all' ? 'Todos' : value === 'running' ? 'Corriendo' : 'Detenidos'}</Chip>)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Ordenar por</span>
          {SORTS.map((option) => <Chip key={option.key} selected={sort === option.key} onToggle={() => setSort(option.key)} hint={option.hint}>{option.label}</Chip>)}
        </div>
      </div>

      <Card className="overflow-hidden !p-0">
        {containers.error && <p className="p-5 text-danger">{containers.error}</p>}
        {!containers.data ? (
          <div className="space-y-3 p-5"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-2 text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Servicio</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-3 py-3 font-medium">Último arranque</th>
                <th className="px-3 py-3 font-medium">Puertos</th>
                <th className="px-3 py-3 font-medium">tsc</th>
                <th className="px-5 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((container) => {
                const color = serviceColor(container.service ?? container.name);
                const info = explainContainer(container);
                const group = groupOf(config, container.service);
                return (
                  <tr key={container.name} className="transition-colors hover:bg-surface-2/60" style={{ boxShadow: `inset 3px 0 0 ${tint(color, container.state === 'running' ? 0.9 : 0.35)}` }}>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="whitespace-nowrap rounded-lg border px-2.5 py-1 font-medium" style={pillStyle(color, true)}>{container.name}</span>
                        <Badge tone={group.tone}>{group.label}</Badge>
                      </div>
                      {container.service && container.service !== container.name && <div className="mt-1 font-mono text-sm text-muted">servicio de compose: {container.service}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <Tooltip content={<><div className="mb-1 font-semibold">{info.label}</div><p className="text-muted">{info.meaning}</p>{info.action && <p className="mt-2"><strong>Qué hacer:</strong> {info.action}</p>}</>}>
                        <button type="button" className="cursor-help rounded-full focus-visible:ring-2"><Badge tone={info.tone}>{info.label}</Badge></button>
                      </Tooltip>
                      <div className="mt-1 text-sm text-muted">{container.status}</div>
                    </td>
                    <td className="px-3 py-3 text-muted" title={container.startedAt ?? ''}>{container.startedAt ? timeAgo(Date.parse(container.startedAt)) : '—'}</td>
                    <td className="px-3 py-3 font-mono text-muted">{hostPorts(container.ports) || '—'}</td>
                    <td className="px-3 py-3">{container.state === 'running' ? tscBadge(tsc.data?.tsc[container.name]) : <span className="text-muted">—</span>}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button className="h-9" icon={<FileText className="size-4" />} onClick={() => setLogsOf(container.name)}>Logs</Button>
                        <Button className={cn('h-9')} icon={<RotateCw className="size-4" />} onClick={() => setRestarting(container.name)}>Reiniciar</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">Ningún contenedor coincide.</td></tr>}
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

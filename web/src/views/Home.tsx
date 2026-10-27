import { CircleAlert, CircleCheck, FolderTree, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { CheckList } from '../components/CheckList';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { StatusDot } from '../components/StatusDot';
import { api } from '../lib/api';
import type { Check, DevPanelConfig, SetupDetect } from '../lib/types';
import { useAsync } from '../lib/useAsync';

export const Home = ({ config }: { config: DevPanelConfig }) => {
  const detect = useAsync(() => api.get<SetupDetect>('/api/setup/detect'));
  const data = detect.data;
  const checks = useAsync(() => api.get<{ checks: Check[] }>('/api/checks'));

  return (
    <>
      <PageHeader title="Inicio" description="Estado del entorno de desarrollo." />
      {detect.loading || !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Docker">
              <StatusDot status={data.docker.ok ? 'ok' : 'error'} label={data.docker.ok ? `Motor ${data.docker.version}` : 'No responde'} />
              <p className="mt-2 text-sm text-muted">Compose {data.compose.ok ? data.compose.version : 'no disponible'}</p>
            </Card>
            <Card title="Contenedores">
              <div className="text-3xl font-semibold">{data.containers.length}</div>
              <p className="mt-1 text-sm text-muted">existentes en esta máquina</p>
            </Card>
            <Card title="Configuración">
              <StatusDot status={data.missingServices.length === 0 ? 'ok' : 'warn'} label={data.missingServices.length === 0 ? 'Servicios coherentes con el compose' : `Sin encontrar en el compose: ${data.missingServices.join(', ')}`} />
              <p className="mt-2 break-words text-sm text-muted">Base de conocimiento: <span className="break-all font-mono">{config.paths.extra}</span></p>
            </Card>
          </div>

          <Card title="Chequeos de entorno" action={<button type="button" onClick={checks.reload} className="text-sm text-accent hover:underline">Volver a revisar</button>}>
            {checks.loading ? <Skeleton className="h-40" /> : checks.data ? <CheckList checks={checks.data.checks} /> : <p className="text-danger">{checks.error}</p>}
          </Card>

          <Card title="Rutas y repos">
            <ul className="space-y-3">
              {Object.entries(data.paths).map(([key, entry]) => (
                <li key={key} className="flex items-center gap-3">
                  {entry.exists ? <CircleCheck className="size-5 text-success" aria-hidden /> : <CircleAlert className="size-5 text-warning" aria-hidden />}
                  <span className="w-32 font-medium">{key}</span>
                  <span className="truncate font-mono text-sm text-muted">{entry.value}</span>
                </li>
              ))}
              {data.repos.map((repo) => (
                <li key={repo.name} className="flex items-center gap-3">
                  {repo.exists ? <CircleCheck className="size-5 text-success" aria-hidden /> : <CircleAlert className="size-5 text-warning" aria-hidden />}
                  <span className="w-32 font-medium">repo</span>
                  <span className="font-mono text-sm text-muted">{repo.name}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Link to="/levantado" className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/50">
              <Rocket className="mb-3 size-6 text-accent" aria-hidden />
              <div className="font-semibold">Levantar el stack</div>
              <p className="mt-1 text-sm text-muted">MinIO › RabbitMQ y Mongo › servicios, en el orden correcto. Llega en la Fase 1.</p>
            </Link>
            <Link to="/pruebas" className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/50">
              <FolderTree className="mb-3 size-6 text-accent" aria-hidden />
              <div className="font-semibold">Pruebas y planificación</div>
              <p className="mt-1 text-sm text-muted">Lo que genera el análisis y las pruebas de cada ticket, en un solo lugar. Llega en la Fase 2.</p>
            </Link>
          </div>
        </div>
      )}
    </>
  );
};


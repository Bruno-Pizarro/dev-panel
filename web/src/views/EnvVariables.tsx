import { CheckCircle2, FileQuestion, TriangleAlert } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { api } from '../lib/api';
import type { EnvComparison } from '../lib/types';
import { useAsync } from '../lib/useAsync';

const Names = ({ names, tone }: { names: string[]; tone: 'danger' | 'warning' | 'neutral' }) => (
  <ul className="mt-2 flex flex-wrap gap-2">{names.map((name) => <li key={name}><Badge tone={tone}><span className="font-mono">{name}</span></Badge></li>)}</ul>
);

/** Variables del .env de cada repo comparadas con su .env.example. Solo se ven nombres: los valores nunca salen del servidor. */
export const EnvVariables = () => {
  const data = useAsync(() => api.get<{ repos: EnvComparison[] }>('/api/env/compare'));
  if (data.loading && !data.data) return <Skeleton className="h-64" />;
  if (data.error || !data.data) return <p className="text-danger">{data.error}</p>;
  const comparable = data.data.repos.filter((repo) => repo.comparable);
  const others = data.data.repos.filter((repo) => !repo.comparable);
  const problems = comparable.filter((repo) => repo.missing.length > 0).length;
  return (
    <>
      <p className="mb-5 text-muted">Compara el <span className="font-mono">.env</span> de cada repo con lo que el servicio espera: su <span className="font-mono">.env.example</span> o, si no tiene, el esquema de <span className="font-mono">src/config/config.ts</span>. <strong>Faltan</strong> las variables obligatorias que el <span className="font-mono">.env</span> no define (el servicio no arranca); las <strong>opcionales</strong> usan su valor por defecto, que puede no ser el de este entorno. Solo se muestran los nombres, nunca los valores.</p>
      {comparable.length === 0 ? <EmptyState icon={<FileQuestion className="size-6" />} title="Nada para comparar">Los repos necesitan un <span className="font-mono">.env</span> y un <span className="font-mono">.env.example</span>.</EmptyState> : (
        <div className="space-y-4">
          <p className={problems ? 'font-medium text-warning' : 'font-medium text-success'} data-testid="env-summary">{problems ? `${problems} repo${problems === 1 ? '' : 's'} con variables faltantes` : 'Todos los .env tienen las variables de su ejemplo'}</p>
          {comparable.map((repo) => (
            <Card key={repo.repo} title={<span className="inline-flex items-center gap-3"><span className="font-mono">{repo.repo}</span>{repo.missing.length ? <Badge tone="warning">{repo.missing.length} faltan</Badge> : <Badge tone="success">al día</Badge>}</span>} action={<span className="font-mono text-sm text-muted">{repo.source === 'schema' ? 'esquema ' : ''}{repo.exampleFile}</span>}>
              {repo.missing.length === 0 && repo.commented.length === 0 && repo.extra.length === 0 && repo.usesDefault.length === 0 && <p className="flex items-center gap-2 text-success"><CheckCircle2 className="size-5" aria-hidden />Tiene todas las variables del ejemplo.</p>}
              {repo.missing.length > 0 && <div><p className="flex items-center gap-2 font-medium text-warning"><TriangleAlert className="size-5" aria-hidden />Faltan en el .env{repo.source === 'schema' ? ' (obligatorias)' : ''}</p><Names names={repo.missing} tone="danger" /></div>}
              {repo.usesDefault.length > 0 && <div className="mt-4"><p className="font-medium">Opcionales que usan su valor por defecto</p><Names names={repo.usesDefault} tone="neutral" /></div>}
              {repo.commented.length > 0 && <div className="mt-4"><p className="font-medium">Comentadas (no se aplican)</p><Names names={repo.commented} tone="warning" /></div>}
              {repo.extra.length > 0 && <div className="mt-4"><p className="font-medium">Sobran (el ejemplo no las menciona)</p><Names names={repo.extra} tone="neutral" /></div>}
            </Card>
          ))}
        </div>
      )}
      {others.length > 0 && <p className="mt-6 text-sm text-muted">Sin comparar (falta el <span className="font-mono">.env</span> o el ejemplo): {others.map((repo) => repo.repo).join(', ')}.</p>}
    </>
  );
};

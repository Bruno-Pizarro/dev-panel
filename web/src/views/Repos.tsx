import { GitBranch } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import type { RepoStatus } from '../lib/types';
import { EnvRepos } from './EnvRepos';

const Branches = () => {
  const repos = usePolling(() => api.get<{ baseBranch: string; repos: RepoStatus[] }>('/api/repos'), 15_000);
  if (!repos.data) return <Skeleton className="h-72" />;
  return (
    <div className="space-y-4">
      <p className="text-muted">Solo lectura. Comparado contra <span className="font-mono text-fg">{repos.data.baseBranch}</span>. Los cambios de rama se hacen a mano, con la regla de confirmación del equipo.</p>
      {repos.data.repos.map((repo) => (
        <Card key={repo.repo}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-semibold">{repo.repo}</span>
                {repo.branch && <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-3 px-2.5 py-1 font-mono text-sm"><GitBranch className="size-4 text-accent" aria-hidden />{repo.branch}</span>}
              </div>
              {repo.last && <div className="mt-1.5 text-sm text-muted"><span className="font-mono">{repo.last.hash}</span> {repo.last.subject} · {repo.last.when}</div>}
              {!repo.exists && <div className="mt-1.5 text-sm text-warning">No es un repo git en esta máquina.</div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {repo.base && <Badge tone={repo.base.ahead ? 'accent' : 'neutral'}>{repo.base.ahead} adelante</Badge>}
              {repo.base && <Badge tone={repo.base.behind ? 'warning' : 'neutral'}>{repo.base.behind} atrás</Badge>}
              <Badge tone={repo.dirty.length ? 'warning' : 'success'}>{repo.dirty.length ? `${repo.dirty.length} sin commitear` : 'limpio'}</Badge>
            </div>
          </div>
          {repo.dirty.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 font-mono text-sm text-muted">
              {repo.dirty.slice(0, 8).map((file) => <li key={file.path}><span className="mr-3 inline-block w-6 text-warning">{file.status}</span>{file.path}</li>)}
              {repo.dirty.length > 8 && <li>… y {repo.dirty.length - 8} más</li>}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
};

export const Repos = () => {
  const [tab, setTab] = useState<'ramas' | 'env'>('ramas');
  return (
    <>
      <PageHeader title="Repos y .env" description="Estado de las ramas y perfiles de MinIO local o S3 remoto." />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'ramas', label: 'Ramas' }, { id: 'env', label: '.env' }]} />
      {tab === 'ramas' ? <Branches /> : <EnvRepos />}
    </>
  );
};

import { ArrowDown, ArrowUp, Archive, GitBranch, GitCommitHorizontal, UploadCloud, User } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { api } from '../lib/api';
import { pillStyle, serviceColor, tint } from '../lib/colors';
import { usePolling } from '../lib/hooks';
import type { RepoStatus } from '../lib/types';
import { EnvRepos } from './EnvRepos';

/** Color y explicación según el tipo de rama. */
const branchKind = (branch: string | null, base: string): { rgb: string; label: string } => {
  if (!branch) return { rgb: '139 152 169', label: 'sin rama' };
  if (branch === base) return { rgb: '99 179 237', label: 'rama base' };
  if (/^(main|master)$/.test(branch)) return { rgb: '99 179 237', label: 'rama principal' };
  if (/^(feature|feat)\//.test(branch)) return { rgb: '167 139 250', label: 'desarrollo de un ticket' };
  if (/^(fix|bugfix|hotfix)\//.test(branch)) return { rgb: '251 146 60', label: 'corrección' };
  if (/^(release|rc)\//.test(branch)) return { rgb: '74 222 128', label: 'release' };
  return { rgb: '250 204 21', label: 'otra rama' };
};

const STATUS: Record<string, { rgb: string; label: string }> = {
  M: { rgb: '250 204 21', label: 'modificado' }, A: { rgb: '74 222 128', label: 'agregado' }, D: { rgb: '251 113 133', label: 'borrado' },
  R: { rgb: '167 139 250', label: 'renombrado' }, '??': { rgb: '56 189 248', label: 'sin seguimiento' }, U: { rgb: '251 113 133', label: 'en conflicto' },
};

const Count = ({ icon: Icon, value, rgb, hint }: { icon: typeof ArrowUp; value: number; rgb: string; hint: string }) => (
  <Tooltip content={hint} width={280}>
    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold" style={value ? pillStyle(rgb, true) : { borderColor: 'transparent', color: 'rgb(139 152 169)' }}>
      <Icon className="size-4" aria-hidden />{value}
    </span>
  </Tooltip>
);

const Summary = ({ repos }: { repos: RepoStatus[] }) => {
  const stats = [
    { label: 'repos', value: repos.length, rgb: '138 151 255' },
    { label: 'con cambios sin commitear', value: repos.filter((repo) => repo.dirty.length).length, rgb: '250 204 21' },
    { label: 'adelantados a la base', value: repos.filter((repo) => (repo.base?.ahead ?? 0) > 0).length, rgb: '167 139 250' },
    { label: 'atrasados respecto de la base', value: repos.filter((repo) => (repo.base?.behind ?? 0) > 0).length, rgb: '251 146 60' },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border bg-surface p-4" style={{ borderColor: tint(stat.rgb, 0.3) }}>
          <div className="text-2xl font-semibold" style={{ color: `rgb(${stat.rgb})` }}>{stat.value}</div>
          <div className="text-sm text-muted">{stat.label}</div>
        </div>
      ))}
    </div>
  );
};

const Branches = () => {
  const repos = usePolling(() => api.get<{ baseBranch: string; repos: RepoStatus[] }>('/api/repos'), 15_000);
  if (!repos.data) return <Skeleton className="h-72" />;
  const base = repos.data.baseBranch;
  return (
    <div className="space-y-4">
      <p className="text-muted">Solo lectura, comparado contra <span className="font-mono text-fg">{base}</span> local. Los cambios de rama se hacen a mano, con la regla de confirmación del equipo.</p>
      <Summary repos={repos.data.repos} />
      {repos.data.repos.map((repo) => {
        const color = serviceColor(repo.repo);
        const kind = branchKind(repo.branch, base);
        const grouped = Object.entries(repo.dirty.reduce<Record<string, number>>((acc, file) => ({ ...acc, [file.status]: (acc[file.status] ?? 0) + 1 }), {}));
        return (
          <Card key={repo.repo} className="overflow-hidden !p-0">
            <div className="p-5" style={{ boxShadow: `inset 4px 0 0 ${tint(color, 0.9)}` }}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-lg border px-2.5 py-1 font-mono text-lg font-semibold" style={pillStyle(color, true)}>{repo.repo}</span>
                    <Tooltip content={`Rama actual: ${kind.label}.`}>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-sm" style={pillStyle(kind.rgb, true)}><GitBranch className="size-4" aria-hidden />{repo.branch ?? '—'}</span>
                    </Tooltip>
                    {repo.ticket && <Badge tone="accent">ticket #{repo.ticket}</Badge>}
                  </div>
                  {repo.last && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                      <span className="inline-flex items-center gap-1.5"><GitCommitHorizontal className="size-4" aria-hidden /><span className="font-mono text-fg">{repo.last.hash}</span> {repo.last.subject}</span>
                      <span className="inline-flex items-center gap-1.5"><User className="size-4" aria-hidden />{repo.last.author}</span>
                      <span>{repo.last.when}</span>
                    </div>
                  )}
                  {!repo.exists && <div className="mt-2 text-sm text-warning">No es un repo git en esta máquina.</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {repo.base && <Count icon={ArrowUp} value={repo.base.ahead} rgb="167 139 250" hint={`${repo.base.ahead} commits en esta rama que todavía no están en ${base}.`} />}
                  {repo.base && <Count icon={ArrowDown} value={repo.base.behind} rgb="251 146 60" hint={`${repo.base.behind} commits en ${base} que esta rama no tiene: conviene traerlos.`} />}
                  <Tooltip content={repo.upstream ? `Contra ${repo.upstream.name}: ${repo.upstream.ahead} sin subir, ${repo.upstream.behind} sin bajar.` : 'Esta rama todavía no está publicada (no tiene rama remota asociada).'}>
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium" style={pillStyle(repo.upstream ? (repo.upstream.ahead ? '250 204 21' : '74 222 128') : '139 152 169')}>
                      <UploadCloud className="size-4" aria-hidden />{repo.upstream ? (repo.upstream.ahead ? `${repo.upstream.ahead} sin subir` : 'publicada') : 'sin publicar'}
                    </span>
                  </Tooltip>
                  {repo.stashes > 0 && <Tooltip content="Cambios guardados temporalmente con git stash."><Badge tone="info"><Archive className="mr-1 size-4" aria-hidden />{repo.stashes} stash</Badge></Tooltip>}
                  <Badge tone={repo.dirty.length ? 'warning' : 'success'}>{repo.dirty.length ? `${repo.dirty.length} sin commitear` : 'limpio'}</Badge>
                </div>
              </div>

              {repo.commits.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-2 text-sm font-medium">Commits de esta rama sobre {base}</div>
                  <ul className="space-y-1.5 text-sm">
                    {repo.commits.map((commit) => (
                      <li key={commit.hash} className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-mono" style={{ color: `rgb(${kind.rgb})` }}>{commit.hash}</span>
                        <span className="min-w-0 flex-1">{commit.subject}</span>
                        <span className="text-muted">{commit.author} · {commit.when}</span>
                      </li>
                    ))}
                  </ul>
                  {(repo.base?.ahead ?? 0) > repo.commits.length && <div className="mt-1.5 text-sm text-muted">… y {(repo.base?.ahead ?? 0) - repo.commits.length} más</div>}
                </div>
              )}

              {repo.dirty.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">
                    Sin commitear
                    {grouped.map(([status, count]) => <span key={status} className="rounded-md border px-1.5 py-0.5 text-sm font-semibold" style={pillStyle((STATUS[status] ?? STATUS['M']!).rgb)}>{count} {(STATUS[status] ?? { label: status }).label}</span>)}
                  </div>
                  <ul className="space-y-1 font-mono text-sm">
                    {repo.dirty.slice(0, 10).map((file) => <li key={file.path} className="flex gap-3"><span className="w-7 shrink-0 font-semibold" style={{ color: `rgb(${(STATUS[file.status] ?? STATUS['M']!).rgb})` }}>{file.status}</span><span className="break-all text-muted">{file.path}</span></li>)}
                    {repo.dirty.length > 10 && <li className="text-muted">… y {repo.dirty.length - 10} más</li>}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        );
      })}
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

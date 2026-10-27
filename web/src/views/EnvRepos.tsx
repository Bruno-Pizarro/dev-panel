import { AlertTriangle, CheckCircle2, CircleDot, FileCog } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import type { EnvChange, EnvRepo } from '../lib/types';
import { useAsync } from '../lib/useAsync';

const stateInfo = {
  local: { label: 'MinIO local', tone: 'success' as const },
  remote: { label: 'Remoto (S3)', tone: 'info' as const },
  mixed: { label: 'Mixto', tone: 'warning' as const },
  unknown: { label: 'Sin determinar', tone: 'neutral' as const },
};

interface Pending {
  repo: EnvRepo;
  profile: 'local' | 'remote';
  changes: EnvChange[];
}

/** Contenido de la pestaña .env (la página Repos agrega el encabezado y las pestañas). */
export const EnvRepos = () => {
  const toast = useToast();
  const env = useAsync(() => api.get<{ repos: EnvRepo[] }>('/api/env'));
  const [pending, setPending] = useState<Pending | null>(null);
  const [restart, setRestart] = useState(false);
  const [busy, setBusy] = useState(false);

  const preview = async (repo: EnvRepo, profile: 'local' | 'remote') => {
    setBusy(true);
    try {
      const result = await api.post<{ changes: EnvChange[] }>(`/api/env/${encodeURIComponent(repo.repo)}/apply`, { profile, dryRun: true });
      if (!result.changes.length) toast('info', `${repo.repo} ya está en ese perfil.`);
      else (setPending({ repo, profile, changes: result.changes }), setRestart(false));
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await api.post<{ backup: string | null; restarted: boolean | null }>(`/api/env/${encodeURIComponent(pending.repo.repo)}/apply`, { profile: pending.profile, confirm: true, restart });
      toast('success', `${pending.repo.repo}: ${pending.changes.length} líneas cambiadas. Respaldo: ${result.backup}.${result.restarted === false ? ' No se pudo reiniciar el contenedor.' : ''}`);
      setPending(null);
      env.reload();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="mb-5 text-muted">Pasá cada repo entre MinIO local y S3 remoto. Solo se comentan o descomentan las líneas del perfil; los valores no se tocan.</p>
      {env.loading ? <Skeleton className="h-96" /> : (env.data?.repos ?? []).length === 0 ? (
        <EmptyState icon={<FileCog className="size-6" />} title="Sin perfiles de .env">Definí <span className="font-mono">envProfiles</span> en la configuración.</EmptyState>
      ) : (
        <div className="space-y-5">
          {env.data!.repos.map((repo) => {
            const info = stateInfo[repo.state];
            const blocked = repo.conflicts.length > 0 || repo.missing.length > 0 || !repo.exists;
            return (
              <Card key={repo.repo} title={<span className="inline-flex items-center gap-3"><span className="font-mono">{repo.repo}</span><Badge tone={info.tone}>{info.label}</Badge></span>}
                action={<div className="flex gap-2">
                  <Button className="h-9" disabled={blocked || repo.state === 'local'} loading={busy} onClick={() => preview(repo, 'local')}>Usar MinIO local</Button>
                  <Button className="h-9" disabled={blocked || repo.state === 'remote'} loading={busy} onClick={() => preview(repo, 'remote')}>Usar remoto</Button>
                </div>}>
                {!repo.exists && <p className="text-warning">No existe {repo.file} en este repo.</p>}
                {repo.conflicts.length > 0 && (
                  <p className="mb-3 flex items-start gap-2 text-warning"><AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />Claves repetidas, el panel no decide cuál cambiar: {repo.conflicts.join('; ')}. Ajustá el perfil en la configuración.</p>
                )}
                {repo.missing.length > 0 && <p className="mb-3 flex items-start gap-2 text-warning"><AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />No se encontraron en el archivo: {repo.missing.join(', ')}.</p>}
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-line">
                    {repo.managed.map((line) => (
                      <tr key={line.line}>
                        <td className="w-12 py-2 font-mono text-muted">{line.line}</td>
                        <td className="w-10 py-2">{line.active ? <CheckCircle2 className="size-4 text-success" aria-label="Activa" /> : <CircleDot className="size-4 text-muted" aria-label="Comentada" />}</td>
                        <td className={cn('py-2 font-mono', !line.active && 'text-muted')}>{line.text}</td>
                        <td className="w-24 py-2 text-right text-muted">{line.group === 'minio' ? 'MinIO' : 'remoto'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmModal open={pending !== null} title={`Cambiar ${pending?.repo.repo} a ${pending ? stateInfo[pending.profile].label : ''}`} confirmLabel="Aplicar" loading={busy} onCancel={() => setPending(null)} onConfirm={apply}>
        <p className="mb-3">Estos son los cambios (se respalda el archivo antes de escribir):</p>
        <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-line bg-bg p-3 font-mono text-sm">
          {pending?.changes.map((change) => <li key={change.line}><span className="text-muted">{change.line}</span> <span className="text-danger">− {change.from}</span><br /><span className="ml-6 text-success">+ {change.to}</span></li>)}
        </ul>
        {pending?.repo.container && <div className="mt-4"><Chip selected={restart} onToggle={() => setRestart(!restart)}>Reiniciar el contenedor {pending.repo.container}</Chip></div>}
      </ConfirmModal>
    </>
  );
};

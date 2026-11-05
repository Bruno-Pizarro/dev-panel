import { KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/tickets';
import type { ClaudeEnvResponse } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { ConfirmModal } from './ConfirmModal';
import { EmptyState } from './EmptyState';
import { Field } from './Field';
import { Skeleton } from './Skeleton';
import { useToast } from './Toast';

const NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * Variables y tokens propios para que Claude los use sin leerlos. Se guardan en un archivo fuera del repo (permisos 600); acá
 * solo se ven los nombres: el valor se escribe una vez y no vuelve a mostrarse.
 */
export const ClaudeEnv = () => {
  const toast = useToast();
  const state = useAsync(() => api.get<ClaudeEnvResponse>('/api/claude-env'));
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const data = state.data;
  const nameOk = NAME_PATTERN.test(name);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/claude-env/${encodeURIComponent(name)}`, { value });
      toast('success', `${name} guardada.`);
      setName('');
      setValue('');
      state.reload();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await api.del(`/api/claude-env/${encodeURIComponent(removing)}`, { confirm: true });
      toast('success', `${removing} borrada.`);
      state.reload();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setRemoving(null);
    }
  };

  const renew = async () => {
    setRenewing(true);
    try {
      await api.post('/api/claude-env/gitlab/renew', {});
      toast('success', 'Token de GitLab renovado.');
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setRenewing(false);
      state.reload();
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Cómo funciona">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Pegá acá tokens o claves (por ejemplo <span className="font-mono text-fg">GITHUB_TOKEN</span>). Se guardan en <span className="font-mono text-fg">{data?.file ?? '~/.config/dev-panel/claude.env'}</span>, fuera del repo y con permisos 600.</li>
          <li>El valor se escribe una sola vez: ni esta pantalla ni Claude lo vuelven a leer. Claude lo usa con <span className="font-mono text-fg">dpx run -- comando</span>, que tapa el valor en la salida.</li>
          <li>Cada persona tiene las suyas: el archivo es de esta máquina y no se comparte.</li>
        </ul>
      </Card>

      <Card title="GitLab: token diario para crear MRs">
        {!data ? <Skeleton className="h-10" /> : !data.gitlabDaily.enabled ? (
          <p className="text-sm text-muted">Está apagado. Activalo en Configuración → GitLab («Token diario de GitLab para Claude»). Pide por SSH un token con permisos de API y lectura/escritura de repositorio que vence en 1 día.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {data.gitlabDaily.error ? <Badge tone="danger">Con error</Badge> : data.gitlabDaily.mintedAt ? <Badge tone="success">Activo</Badge> : <Badge tone="warning">Pendiente</Badge>}
            <span className="text-sm text-muted">{data.gitlabDaily.error ?? (data.gitlabDaily.mintedAt ? `Pedido ${timeAgo(Date.parse(data.gitlabDaily.mintedAt))}; se renueva solo antes de vencer.` : 'Todavía no se pidió.')}</span>
            <Button icon={<RefreshCw className="size-4" />} loading={renewing} onClick={renew}>Renovar ahora</Button>
          </div>
        )}
      </Card>

      <Card title="Variables guardadas">
        {state.error && <p className="text-danger">{state.error}</p>}
        {!data ? <Skeleton className="h-24" /> : data.vars.length === 0 ? (
          <EmptyState icon={<KeyRound className="size-6" />} title="Todavía no hay variables">Agregá la primera abajo.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.vars.map((entry) => (
              <li key={entry.name} className="flex flex-wrap items-center gap-3 py-3">
                <KeyRound className="size-4 text-muted" aria-hidden />
                <span className="font-mono font-medium">{entry.name}</span>
                {entry.managed && <Badge tone="info">La administra el panel</Badge>}
                <span className="text-sm text-muted">{entry.setAt ? `guardada ${timeAgo(Date.parse(entry.setAt))}` : ''}</span>
                {!entry.managed && (
                  <Button className="ml-auto h-9" aria-label={`Borrar ${entry.name}`} icon={<Trash2 className="size-4" />} onClick={() => setRemoving(entry.name)}>Borrar</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Agregar o reemplazar una variable">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre" help="Mayúsculas, números y guion bajo." placeholder="GITHUB_TOKEN" value={name} onChange={(next) => setName(next.toUpperCase())} autoComplete="off" />
          <Field label="Valor" help="No vuelve a mostrarse." type="password" placeholder="Pegá el token" value={value} onChange={setValue} autoComplete="new-password" />
        </div>
        <div className="mt-4">
          <Button variant="primary" icon={<Plus className="size-4" />} loading={saving} disabled={!nameOk || !value} onClick={save}>Guardar</Button>
        </div>
      </Card>

      <ConfirmModal open={removing !== null} title="Borrar variable" confirmLabel="Borrar" danger onCancel={() => setRemoving(null)} onConfirm={remove}>
        Se va a borrar <span className="font-mono text-fg">{removing}</span> del archivo de Claude. Si es un token, se sigue pudiendo usar hasta que venza en el servicio de origen.
      </ConfirmModal>
    </div>
  );
};

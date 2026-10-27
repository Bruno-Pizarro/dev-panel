import { CheckCircle2, CircleAlert, Terminal } from 'lucide-react';
import { useState } from 'react';
import { Card } from '../components/Card';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import type { ConfigResponse, DevPanelConfig, SetupDetect, ToolStatus } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { ConfigEditor } from './ConfigEditor';

const ToolRow = ({ name, tool }: { name: string; tool: ToolStatus }) => (
  <li className="flex items-center gap-3">
    {tool.ok ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <CircleAlert className="size-5 text-danger" aria-hidden />}
    <span className="font-medium">{name}</span>
    <span className="font-mono text-sm text-muted">{tool.ok ? tool.version : tool.error}</span>
  </li>
);

/** Primer arranque: detecta Docker, rutas y servicios, y escribe config.json con lo que confirmes. */
export const Wizard = ({ reason, onSaved }: { reason: string; onSaved: () => void }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const detect = useAsync(() => api.get<SetupDetect>('/api/setup/detect'));

  const save = async (config: DevPanelConfig) => {
    setSaving(true);
    try {
      await api.put<ConfigResponse>('/api/config', config);
      toast('success', 'Configuración creada.');
      onSaved();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const data = detect.data;
  return (
    <div className="mx-auto min-h-full max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent-strong/20 text-accent">
          <Terminal className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Bienvenido al Dev Panel</h1>
          <p className="text-muted">Primer arranque: revisá lo que detecté en esta máquina y guardá la configuración.</p>
        </div>
      </div>
      <p className="mb-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">{reason}</p>

      {detect.loading || !data ? (
        <Card><Skeleton className="h-56" /></Card>
      ) : (
        <div className="space-y-6">
          <Card title="Herramientas detectadas">
            <ul className="space-y-3">
              <ToolRow name="Docker" tool={data.docker} />
              <ToolRow name="Docker Compose" tool={data.compose} />
            </ul>
            <p className="mt-4 text-sm text-muted">
              {data.containers.length} contenedores existentes en esta máquina.
              {data.missingServices.length > 0 && <span className="text-warning"> Servicios de la configuración sugerida que no están en tus compose: {data.missingServices.join(', ')}.</span>}
            </p>
          </Card>
          <ConfigEditor initial={data.suggested} detect={data} saving={saving} saveLabel="Guardar y continuar" onSave={save} />
        </div>
      )}
    </div>
  );
};

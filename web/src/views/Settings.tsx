import { useState } from 'react';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import type { ConfigResponse, DevPanelConfig, SetupDetect } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { ConfigEditor } from './ConfigEditor';

export const Settings = ({ config, onSaved }: { config: DevPanelConfig; onSaved: () => void }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const detect = useAsync(() => api.get<SetupDetect>('/api/setup/detect'));

  const save = async (next: DevPanelConfig) => {
    setSaving(true);
    try {
      await api.put<ConfigResponse>('/api/config', next);
      toast('success', 'Configuración guardada.');
      onSaved();
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Configuración" description="Todo lo que depende de tu máquina. Se guarda en config.json, fuera de git." />
      {detect.loading ? (
        <Card><Skeleton className="h-40" /></Card>
      ) : (
        <ConfigEditor initial={config} detect={detect.data} saving={saving} saveLabel="Guardar cambios" onSave={save} />
      )}
    </>
  );
};

import { Bot, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmModal } from '../components/ConfirmModal';
import { ShortcutKey } from '../components/Key';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { AGENT_DEMO_MS, showAgentDemo } from '../lib/agentDemo';
import { useAsync } from '../lib/useAsync';

const INSTALL_COMMAND = 'yarn node server/scripts/install-agent-hooks.mjs';

/** Configuración → Agentes de Claude: cómo se activa el aviso, una vista previa y si se guarda lo que hace cada agente. */
export const AgentSettings = () => {
  const toast = useToast();
  const settings = useAsync(() => api.get<{ saveContent: boolean }>('/api/agents/settings'));
  const [confirming, setConfirming] = useState(false);

  const setSaveContent = async (saveContent: boolean) => {
    try {
      await api.put('/api/agents/settings', { saveContent });
      settings.reload();
      toast('success', saveContent ? 'Se guardará lo que pide y contesta cada agente.' : 'Ya no se guarda lo que pide ni contesta cada agente.');
    } catch (error) {
      toast('error', (error as Error).message);
    }
  };
  const clearContent = async () => {
    try {
      const result = await api.del<{ cleared: number }>('/api/agents/content');
      toast('success', result.cleared ? `Textos borrados (${result.cleared} agente${result.cleared === 1 ? '' : 's'}).` : 'No había textos guardados.');
    } catch (error) {
      toast('error', (error as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card title="Agentes de Claude">
      <p className="mb-4 text-muted">Cuando Claude Code delega una tarea a un subagente, el panel muestra un aviso en la esquina inferior derecha con el tipo de agente, la tarea y el tiempo que lleva. Si hay varios, se recorren de a uno con las flechas. Se puede ocultar con el botón del ojo o con la tecla <ShortcutKey id="agents.toggle" />, y queda una etiqueta chica para volver a abrirlo. El historial de los últimos 3 días está en la vista Agentes.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={<Bot className="size-4" />} onClick={showAgentDemo}>Ver cómo se ve el aviso</Button>
        <span className="text-sm text-muted">Muestra tres agentes de ejemplo durante {AGENT_DEMO_MS / 1000} segundos; no toca nada real.</span>
      </div>

      <h3 className="mb-2 mt-8 font-medium">Guardar lo que hace cada agente</h3>
      {settings.loading && !settings.data ? <Skeleton className="h-12" /> : (
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={settings.data?.saveContent ?? true} onChange={(event) => void setSaveContent(event.target.checked)} data-testid="save-content" />
          <span>
            <span className="block font-medium">Guardar lo que se le pidió y lo que contestó</span>
            <span className="block text-sm text-muted">Se ve al abrir un agente en la vista Agentes. Queda solo en esta máquina (carpeta <span className="font-mono">data/</span>, permisos 600), se borra con el historial a los 3 días y se recorta a 20.000 caracteres cada texto. Antes de guardar se tapan los secretos más obvios (tokens de GitHub o GitLab, claves de API, JWT, «password=…», credenciales en URLs, claves privadas), pero es un filtro de patrones y no una garantía: una contraseña común escrita en una frase puede pasar. Apagarlo deja de guardar desde ese momento.</span>
          </span>
        </label>
      )}
      <div className="mt-3"><Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirming(true)}>Borrar los textos guardados</Button></div>

      <h3 className="mb-2 mt-8 font-medium">Activar el aviso</h3>
      <p className="mb-2 text-sm text-muted">Los avisos llegan por hooks de Claude Code. Se instalan una sola vez corriendo esto en la carpeta del panel (hace una copia de tu <span className="font-mono">settings.json</span> antes y no toca lo que ya tenés; con <span className="font-mono">--remove</span> los quita):</p>
      <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3.5 font-mono text-sm">{INSTALL_COMMAND}</pre>
      <p className="mt-2 text-sm text-muted">Los hooks se leen al abrir una sesión nueva de Claude Code (o con <span className="font-mono">/hooks</span> en la actual).</p>
      <ConfirmModal open={confirming} title="Borrar los textos guardados" confirmLabel="Borrar" danger onConfirm={() => void clearContent()} onCancel={() => setConfirming(false)}>
        Se borran el pedido y la respuesta de todos los agentes del historial. Los agentes (tipo, tarea, tiempos) se conservan.
      </ConfirmModal>
    </Card>
  );
};

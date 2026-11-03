import { Bot } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ShortcutKey } from '../components/Key';
import { AGENT_DEMO_MS, showAgentDemo } from '../lib/agentDemo';

const INSTALL_COMMAND = 'yarn node server/scripts/install-agent-hooks.mjs';

/** Configuración → Agentes de Claude: cómo se activa el aviso y una vista previa para ver cómo queda. */
export const AgentSettings = () => (
  <Card title="Agentes de Claude">
    <p className="mb-4 text-muted">Cuando Claude Code delega una tarea a un subagente, el panel muestra un aviso en la esquina inferior derecha con el tipo de agente, la tarea y el tiempo que lleva. Si hay varios, se recorren de a uno con las flechas. Se puede ocultar con el botón del ojo o con la tecla <ShortcutKey id="agents.toggle" />, y queda una etiqueta chica para volver a abrirlo.</p>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" icon={<Bot className="size-4" />} onClick={showAgentDemo}>Ver cómo se ve el aviso</Button>
      <span className="text-sm text-muted">Muestra tres agentes de ejemplo durante {AGENT_DEMO_MS / 1000} segundos; no toca nada real.</span>
    </div>
    <h3 className="mb-2 mt-6 font-medium">Activar el aviso</h3>
    <p className="mb-2 text-sm text-muted">Los avisos llegan por hooks de Claude Code. Se instalan una sola vez corriendo esto en la carpeta del panel (hace una copia de tu <span className="font-mono">settings.json</span> antes y no toca lo que ya tenés; con <span className="font-mono">--remove</span> los quita):</p>
    <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3.5 font-mono text-sm">{INSTALL_COMMAND}</pre>
    <p className="mt-2 text-sm text-muted">Los hooks se leen al abrir una sesión nueva de Claude Code (o con <span className="font-mono">/hooks</span> en la actual). Solo se guarda el tipo, una descripción corta y los tiempos del agente, nunca lo que se le pide ni lo que contesta.</p>
  </Card>
);

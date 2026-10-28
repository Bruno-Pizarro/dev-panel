import { Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { PathField } from '../components/PathField';
import { TagEditor } from '../components/TagEditor';
import type { DevPanelConfig, SetupDetect } from '../lib/types';

interface ConfigEditorProps {
  initial: DevPanelConfig;
  detect?: SetupDetect | null;
  saving: boolean;
  saveLabel: string;
  onSave: (config: DevPanelConfig) => void;
}

const exists = (detect: SetupDetect | null | undefined, key: string) => {
  const entry = detect?.paths[key];
  if (!entry) return null;
  return <span className={entry.exists ? 'text-sm text-success' : 'text-sm text-warning'}>{entry.exists ? 'existe' : 'no se encontró'}</span>;
};

export const ConfigEditor = ({ initial, detect, saving, saveLabel, onSave }: ConfigEditorProps) => {
  const [config, setConfig] = useState<DevPanelConfig>(initial);
  const startup = config.startup;
  const setStartup = (patch: Partial<DevPanelConfig['startup']>) => setConfig({ ...config, startup: { ...startup, ...patch } });

  return (
    <div className="space-y-6">
      <Card title="Rutas">
        <div className="grid gap-5 md:grid-cols-2">
          <PathField label="Carpeta de proyectos" help="Contiene todos los repos." value={config.paths.projects} onChange={(value) => setConfig({ ...config, paths: { ...config.paths, projects: value } })} />
          <PathField label="Base de conocimiento" help="Carpeta que la web usa como fuente: ahí lee las pruebas, los análisis y los planes de cada ticket." value={config.paths.extra} status={exists(detect, 'extra')} onChange={(value) => setConfig({ ...config, paths: { ...config.paths, extra: value } })} />
          <PathField label="Carpeta de scripts" help="De acá se leen los scripts usuales (backup remoto, etc.): no viven en este repo." value={config.paths.scripts} status={exists(detect, 'scripts')} onChange={(value) => setConfig({ ...config, paths: { ...config.paths, scripts: value } })} />
          <Field label="Script de backup remoto" help="Nombre del archivo dentro de la carpeta de scripts." value={config.remoteBackup.script} onChange={(script) => setConfig({ ...config, remoteBackup: { ...config.remoteBackup, script } })} />
          <PathField label="Carpeta del Daily" help="Se conservan los últimos 5 archivos." value={config.paths.daily} onChange={(value) => setConfig({ ...config, paths: { ...config.paths, daily: value } })} />
          <Field label="Contenedor de Mongo" value={config.mongo.container} onChange={(value) => setConfig({ ...config, mongo: { container: value } })} />
          <PathField label="docker-compose principal" kind="file" value={config.compose.main} status={exists(detect, 'composeMain')} onChange={(value) => setConfig({ ...config, compose: { ...config.compose, main: value } })} />
          <PathField label="docker-compose de MinIO" kind="file" value={config.compose.minio} status={exists(detect, 'composeMinio')} onChange={(value) => setConfig({ ...config, compose: { ...config.compose, minio: value } })} />
        </div>
        <div className="mt-5">
          <TagEditor label="Carpetas que no son tickets" help="No aparecen en Pruebas, Desarrollo ni en los reportes. La carpeta del Daily se omite siempre." values={config.paths.ignoreDirs} onChange={(ignoreDirs) => setConfig({ ...config, paths: { ...config.paths, ignoreDirs } })} />
        </div>
      </Card>

      <Card title="Jornada y marcación">
        <p className="mb-4 text-muted">Con tus horarios, el checklist de Inicio y de Daily pasa de ámbar a naranja y rojo cuanto más tarde es para marcar entrada o salida (hasta 15 min, hasta 1 h, más de 1 h). Dejá un horario vacío para no colorear. No colorea los fines de semana.</p>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Horario de entrada" type="time" mono={false} value={config.workday.entry} onChange={(entry) => setConfig({ ...config, workday: { ...config.workday, entry } })} />
          <Field label="Horario de salida" type="time" mono={false} value={config.workday.exit} onChange={(exit) => setConfig({ ...config, workday: { ...config.workday, exit } })} />
        </div>
        <div className="mt-5">
          <Field label="Enlace de marcación" help="Aparece como botón “Ir a marcar” debajo del checklist. Solo http o https." placeholder="https://…/control-horario/marcaciones/pin" value={config.workday.punchUrl} onChange={(punchUrl) => setConfig({ ...config, workday: { ...config.workday, punchUrl } })} />
        </div>
      </Card>

      <Card title="Orden de levantado" action={<span className="text-sm text-muted">Nombres de servicio del compose</span>}>
        <div className="space-y-5">
          <TagEditor label="Etapa 1" help="Se levantan primero (MinIO de file-manager)." values={startup.stage1} onChange={(stage1) => setStartup({ stage1 })} />
          <TagEditor label="Etapa 2" help="Infraestructura. Se espera a RabbitMQ antes de seguir." values={startup.stage2} onChange={(stage2) => setStartup({ stage2 })} />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Contenedor de RabbitMQ" value={startup.rabbitReady.container} onChange={(container) => setStartup({ rabbitReady: { ...startup.rabbitReady, container } })} />
            <Field label="Tiempo máximo de espera (s)" type="number" value={startup.rabbitReady.timeoutSec} onChange={(value) => setStartup({ rabbitReady: { ...startup.rabbitReady, timeoutSec: Number(value) || 180 } })} />
          </div>
          <Field label="Texto del log que indica que RabbitMQ está listo" value={startup.rabbitReady.logMatch} onChange={(logMatch) => setStartup({ rabbitReady: { ...startup.rabbitReady, logMatch } })} />
          <TagEditor label="Obligatorios" help="Siempre se levantan, además de lo que elijas." values={startup.mandatory} onChange={(mandatory) => setStartup({ mandatory })} />
          <TagEditor label="Opcionales" help="Aparecen como chips en la vista Levantado." values={startup.optional} onChange={(optional) => setStartup({ optional })} />
        </div>
      </Card>

      <Card title="Repos">
        <TagEditor label="Repos que maneja el panel" help="Para el editor de .env, el estado de ramas y el Daily." values={config.repos} onChange={(repos) => setConfig({ ...config, repos })} />
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => onSave(config)}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
};

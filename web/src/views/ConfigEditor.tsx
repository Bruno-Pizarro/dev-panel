import { Bot, Clock, Eraser, FileText, FolderOpen, GitBranch, GitFork, Keyboard, Rocket, Save, Ticket, User, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { cn } from '../lib/cn';
import { api } from '../lib/api';
import { PathField } from '../components/PathField';
import { TagEditor } from '../components/TagEditor';
import type { DevPanelConfig, SetupDetect } from '../lib/types';
import { AgentSettings } from './AgentSettings';
import { ShortcutSettings } from './ShortcutSettings';

interface ConfigEditorProps {
  initial: DevPanelConfig;
  detect?: SetupDetect | null;
  saving: boolean;
  saveLabel: string;
  onSave: (config: DevPanelConfig) => void;
  /** Muestra las secciones con un menú lateral (Configuración); sin esto, todo en una columna (asistente de primer arranque). */
  sidebar?: boolean;
}

const exists = (detect: SetupDetect | null | undefined, key: string) => {
  const entry = detect?.paths[key];
  if (!entry) return null;
  return <span className={entry.exists ? 'text-sm text-success' : 'text-sm text-warning'}>{entry.exists ? 'existe' : 'no se encontró'}</span>;
};

export const ConfigEditor = ({ initial, detect, saving, saveLabel, onSave, sidebar = false }: ConfigEditorProps) => {
  const [config, setConfig] = useState<DevPanelConfig>(initial);
  const startup = config.startup;
  const setStartup = (patch: Partial<DevPanelConfig['startup']>) => setConfig({ ...config, startup: { ...startup, ...patch } });

  /** Carga el ejemplo que trae el panel para partir de él (se puede editar antes de guardar). */
  const loadDefaultTemplate = async () => {
    try {
      const { template } = await api.get<{ template: string }>('/api/daily/weekly/default-template');
      setConfig((current) => ({ ...current, weekly: { template } }));
    } catch {
      /* sin respuesta del servidor: la plantilla queda como estaba */
    }
  };

  const sections: Array<{ id: string; label: string; icon: LucideIcon; content: JSX.Element; noSave?: boolean }> = [
    { id: 'perfil', label: 'Perfil', icon: User, content: (
      <Card title="Perfil">
        <Field label="Tu nombre" help="Se muestra debajo de “Dev Panel” en el menú. Si lo dejás vacío, no se muestra nada." mono={false} placeholder="Ej.: Neo" maxLength={60} value={config.userName} onChange={(userName) => setConfig({ ...config, userName })} />
      </Card>
    ) },
    { id: 'redmine', label: 'Redmine', icon: Ticket, content: (
      <Card title="Redmine">
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="API key (opcional)"
            type="password"
            autoComplete="off"
            help={config.redmine.apiKeySet ? 'Hay una key guardada en config.json (no se muestra). Escribí otra para reemplazarla.' : 'Si la dejás vacía, se usa la variable REDMINE_API_KEY o la de la skill redmine-drive. Se guarda solo en config.json (fuera de git) y nunca vuelve a la pantalla.'}
            placeholder={config.redmine.apiKeySet ? '•••••••••••• (guardada)' : 'Pegá tu API key de Redmine'}
            value={config.redmine.apiKey}
            onChange={(apiKey) => setConfig({ ...config, redmine: { ...config.redmine, apiKey } })}
          />
          <Field label="URL de Redmine" help="Vacío = la de la skill redmine-drive." placeholder="https://redmine.ejemplo.com" value={config.redmine.baseUrl} onChange={(baseUrl) => setConfig({ ...config, redmine: { ...config.redmine, baseUrl } })} />
        </div>
        {config.redmine.apiKeySet && (
          <button type="button" className="mt-3 text-sm text-danger hover:underline" onClick={() => setConfig({ ...config, redmine: { ...config.redmine, apiKey: '', apiKeySet: false, clearApiKey: true } })}>Quitar la key guardada (al guardar)</button>
        )}
      </Card>
    ) },
    { id: 'gitlab', label: 'GitLab', icon: GitBranch, content: (
      <Card title="GitLab">
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="Token de acceso (opcional)"
            type="password"
            autoComplete="off"
            help={config.gitlab.tokenSet ? 'Hay un token guardado en config.json (no se muestra). Escribí otro para reemplazarlo.' : 'Alcanza con el permiso read_api. Si lo dejás vacío se usa la variable GITLAB_TOKEN. Se guarda solo en config.json (fuera de git) y nunca vuelve a la pantalla. Sin token, el Estado del ticket no muestra los MRs.'}
            placeholder={config.gitlab.tokenSet ? '•••••••••••• (guardado)' : 'Pegá tu token de GitLab'}
            value={config.gitlab.token}
            onChange={(token) => setConfig({ ...config, gitlab: { ...config.gitlab, token } })}
          />
          <Field label="URL de GitLab" help="El token solo se envía a este servidor." placeholder="https://git.ejemplo.com" value={config.gitlab.baseUrl} onChange={(baseUrl) => setConfig({ ...config, gitlab: { ...config.gitlab, baseUrl } })} />
          <Field label="Grupo de los repos" help="Se usa cuando el MR de ticket.json no trae la URL." value={config.gitlab.group} onChange={(group) => setConfig({ ...config, gitlab: { ...config.gitlab, group } })} />
        </div>
        {config.gitlab.tokenSet && (
          <button type="button" className="mt-3 text-sm text-danger hover:underline" onClick={() => setConfig({ ...config, gitlab: { ...config.gitlab, token: '', tokenSet: false, clearToken: true } })}>Quitar el token guardado (al guardar)</button>
        )}
        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={config.gitlab.sshAuto} onChange={(event) => setConfig({ ...config, gitlab: { ...config.gitlab, sshAuto: event.target.checked } })} />
          <span>
            <span className="block font-medium">Pedir un token de 1 día por SSH (sin cargarlo a mano)</span>
            <span className="block text-sm text-muted">Si no hay token fijo, el panel pide por SSH (con tu clave, sin passphrase) un token de solo lectura que vence en 1 día y lo guarda solo en memoria. Crea un token «dev-panel» en tu cuenta de GitLab cada vez que hace falta (como mucho cada 12 h, y de nuevo si el servidor lo rechaza).</span>
          </span>
        </label>
      </Card>
    ) },
    { id: 'rutas', label: 'Rutas', icon: FolderOpen, content: (
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
    ) },
    { id: 'jornada', label: 'Jornada y marcación', icon: Clock, content: (
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
    ) },
    { id: 'levantado', label: 'Orden de levantado', icon: Rocket, content: (
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
    ) },
    { id: 'semanal', label: 'Resumen semanal', icon: FileText, content: (
      <Card title="Resumen semanal" action={<span className="text-sm text-muted">{config.weekly.template.length}/8000</span>}>
        <p className="mb-4 text-muted">Plantilla en la que se basa el pedido a Claude (botón «Copiar pedido semanal» del Daily y herramienta <span className="font-mono">weekly_report</span>). Pegá un resumen anterior que te haya gustado: Claude va a imitar su formato y su tono. Si la dejás vacía se usa el ejemplo que trae el panel.</p>
        <textarea
          value={config.weekly.template}
          onChange={(event) => setConfig({ ...config, weekly: { template: event.target.value } })}
          maxLength={8000}
          rows={16}
          spellCheck={false}
          placeholder="Se avanzaron los tickets:&#10;- 32972 Título del ticket&#10;…"
          className="w-full resize-y rounded-lg border border-line bg-bg p-3.5 font-mono text-sm leading-6 outline-none transition-colors placeholder:text-muted focus:border-accent/60"
          data-testid="weekly-template"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon={<FileText className="size-4" />} onClick={() => void loadDefaultTemplate()}>Cargar el ejemplo por defecto</Button>
          <Button icon={<Eraser className="size-4" />} disabled={!config.weekly.template} onClick={() => setConfig({ ...config, weekly: { template: '' } })}>Vaciar (usar el del panel)</Button>
        </div>
      </Card>
    ) },
    { id: 'atajos', label: 'Atajos de teclado', icon: Keyboard, noSave: true, content: <ShortcutSettings /> },
    { id: 'agentes', label: 'Agentes de Claude', icon: Bot, noSave: true, content: <AgentSettings /> },
    { id: 'repos', label: 'Repos', icon: GitFork, content: (
      <Card title="Repos">
        <TagEditor label="Repos que maneja el panel" help="Para el editor de .env, el estado de ramas y el Daily." values={config.repos} onChange={(repos) => setConfig({ ...config, repos })} />
      </Card>
    ) },
  ];
  const [params, setParams] = useSearchParams();
  const active = sections.find((section) => section.id === params.get('seccion')) ?? sections[0]!;

  const saveButton = (
    <div className="flex justify-end">
      <Button variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={() => onSave(config)}>
        {saveLabel}
      </Button>
    </div>
  );

  // Asistente de primer arranque: una sola columna con todo. Configuración: menú de secciones a la izquierda y una por vez.
  if (!sidebar) return <div className="space-y-6">{sections.filter((section) => !section.noSave).map((section) => <div key={section.id}>{section.content}</div>)}{saveButton}</div>;
  return (
    <div className="gap-6 md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Secciones de la configuración" className="mb-6 flex gap-1 overflow-x-auto md:sticky md:top-0 md:mb-0 md:flex-col md:self-start md:overflow-visible">
        {sections.map((section) => {
          const Icon = section.icon;
          const selected = section.id === active.id;
          return (
            <button
              key={section.id}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => setParams({ seccion: section.id }, { replace: true })}
              className={cn('flex h-11 shrink-0 items-center gap-3 rounded-lg px-3.5 text-left text-sm font-medium transition-colors', selected ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 space-y-6">
        {active.content}
        {!active.noSave && saveButton}
      </div>
    </div>
  );
};

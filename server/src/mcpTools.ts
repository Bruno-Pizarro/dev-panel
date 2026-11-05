import { z, type ZodRawShape } from 'zod';

/** Llamada a la API del panel en ejecución. */
export type CallApi = (method: 'GET' | 'POST', path: string, body?: unknown) => Promise<unknown>;

export interface McpToolDef {
  name: string;
  description: string;
  shape: ZodRawShape;
  run: (args: Record<string, unknown>, call: CallApi) => Promise<unknown>;
}

const query = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '');
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

/**
 * Herramientas que Claude puede usar. Casi todo es lectura; las que escriben solo AGREGAN: `reminder_add` (un recordatorio local),
 * `mr_create` y `mr_note_add` (un MR o un comentario en GitLab con el token diario, que el panel nunca devuelve). No hay forma de
 * cerrar, mergear ni borrar nada, ni de leer o cambiar la configuración o los valores de las variables de Claude (solo sus nombres).
 * Lo destructivo (restaurar datos, resetear contraseñas, crear sesiones, limpiar datos de prueba, reiniciar
 * contenedores, cambiar .env) queda a propósito solo en la interfaz, que pide confirmación explícita.
 */
export const mcpTools: McpToolDef[] = [
  { name: 'checks', description: 'Chequeos de entorno: Docker, Mongo, servicios obligatorios, tsc trabado, secretos compartidos, CA de firma.', shape: {}, run: (_a, call) => call('GET', '/api/checks') },
  { name: 'containers', description: 'Estado de los contenedores del entorno local (estado, puertos, servicio de compose).', shape: {}, run: (_a, call) => call('GET', '/api/containers') },
  {
    name: 'startup_plan',
    description: 'Muestra las etapas del levantado en orden (MinIO, RabbitMQ y Mongo, servicios) para una selección de servicios opcionales, sin ejecutar nada.',
    shape: { services: z.array(z.string()).default([]).describe('Servicios opcionales a levantar, ej. ["firma","leia"]') },
    run: (args, call) => call('GET', `/api/startup/plan${query({ services: (args['services'] as string[]).join(',') })}`),
  },
  {
    name: 'startup_run',
    description: 'Levanta el stack en el orden correcto (MinIO → RabbitMQ y Mongo, espera a RabbitMQ → servicios obligatorios y los elegidos). Corre en segundo plano: consultá startup_state para ver el avance.',
    shape: { services: z.array(z.string()).default([]).describe('Servicios opcionales además de los obligatorios') },
    run: (args, call) => call('POST', '/api/startup/run', { services: args['services'] }),
  },
  { name: 'startup_state', description: 'Estado de la última corrida de levantado: etapas, mensajes y salida.', shape: {}, run: (_a, call) => call('GET', '/api/startup/state') },
  { name: 'tickets', description: 'Carpetas de _EXTRA con ticket, estado, rama, MRs, última prueba y veredicto de code review.', shape: {}, run: (_a, call) => call('GET', '/api/tickets') },
  {
    name: 'ticket_detail',
    description: 'Detalle de una carpeta de _EXTRA: ticket.json y la lista de documentos, diagramas y capturas.',
    shape: { dir: z.string().describe('Nombre de la carpeta, ej. 33526-pendientes-firma') },
    run: (args, call) => call('GET', `/api/tickets/${encodeURIComponent(String(args['dir']))}`),
  },
  {
    name: 'mr_changes',
    description: 'Archivos cambiados en los MRs de GitLab de un ticket (para revisar el desarrollo de otra persona sin tener su rama): por MR, con estado, líneas y si ya los marcaste como vistos en el panel. Solo lectura.',
    shape: { dir: z.string().describe('Nombre de la carpeta, ej. 33526-pendientes-firma') },
    run: (args, call) => call('GET', `/api/tickets/${encodeURIComponent(String(args['dir']))}/mr-changes`),
  },
  {
    name: 'mr_file_diff',
    description: 'Diff de un archivo de un MR del ticket. "repo" es la etiqueta que devuelve mr_changes (ej. "front !171"). Solo lectura.',
    shape: { dir: z.string(), repo: z.string().describe('Etiqueta del MR, ej. "front !171"'), path: z.string().describe('Ruta del archivo dentro del repo') },
    run: (args, call) => call('GET', `/api/tickets/${encodeURIComponent(String(args['dir']))}/mr-changes/diff?repo=${encodeURIComponent(String(args['repo']))}&path=${encodeURIComponent(String(args['path']))}`),
  },
  { name: 'repos', description: 'Rama actual, adelanto/atraso contra la rama base, cambios sin commitear y último commit de cada repo.', shape: {}, run: (_a, call) => call('GET', '/api/repos') },
  { name: 'env_status', description: 'Perfil de .env de cada repo (MinIO local, remoto o mixto), con valores sensibles enmascarados.', shape: {}, run: (_a, call) => call('GET', '/api/env') },
  {
    name: 'daily_draft',
    description: 'Genera (sin guardar) el borrador del daily a partir de commits y carpetas de _EXTRA.',
    shape: { since: z.enum(['today', 'yesterday', 'last']).default('today') },
    run: (args, call) => call('POST', '/api/daily/draft', { since: args['since'] }),
  },
  {
    name: 'weekly_report',
    description: 'Resumen semanal de avances: datos por ticket (commits, MRs, revisiones, pruebas, análisis, estimaciones, estado en Redmine) y el pedido con las reglas y el formato del Google Doc. Devolvé el texto final en un bloque para copiar y pegar.',
    shape: { week: z.enum(['current', 'previous']).default('current').describe('"current" = esta semana (lunes a hoy), "previous" = la semana pasada') },
    run: (args, call) => call('POST', '/api/daily/weekly', { week: args['week'] }),
  },
  {
    name: 'ticket_notes',
    description: 'La nota libre que el usuario dejó en un ticket del panel (pendientes, a quién esperar, qué falta probar). Solo lectura.',
    shape: { dir: z.string().describe('Nombre de la carpeta, ej. 33526-pendientes-firma') },
    run: (args, call) => call('GET', `/api/tickets/${encodeURIComponent(String(args['dir']))}/notes`),
  },
  { name: 'reminders', description: 'Recordatorios del panel (los pendientes primero): texto, fecha u hora si tienen, y si ya están hechos.', shape: {}, run: (_a, call) => call('GET', '/api/reminders') },
  {
    name: 'reminder_add',
    description: 'Agrega un recordatorio al panel (aparece en "Para tener en cuenta" del Inicio cuando llega su momento). Solo agrega: no borra ni modifica otros. Sin fecha es un pendiente que se muestra hasta marcarlo como hecho.',
    shape: {
      text: z.string().min(1).max(200).describe('Qué hay que recordar, en una línea'),
      at: z.string().optional().describe('Cuándo: "AAAA-MM-DD" (ese día) o fecha y hora ISO con zona, ej. 2026-11-05T10:00:00-03:00. Vacío = pendiente sin fecha'),
    },
    run: (args, call) => call('POST', '/api/reminders', { text: args['text'], ...(args['at'] ? { at: args['at'] } : {}) }),
  },
  {
    name: 'mr_create',
    description: 'Crea un Merge Request en GitLab del repo indicado (grupo configurado) con el token diario de Claude. Solo crea: no cierra, mergea ni edita. Sin "target" va a la rama base (desarrollo). Devuelve el número y la URL.',
    shape: {
      repo: z.string().describe('Carpeta del repo, ej. legajo'),
      source: z.string().describe('Rama origen, ej. feature/33528-notificaciones-pendientes-firma'),
      target: z.string().optional().describe('Rama destino; vacío = rama base de la configuración'),
      title: z.string().min(1).max(255),
      description: z.string().max(20_000).optional(),
    },
    run: (args, call) => call('POST', '/api/gitlab/mr', { repo: args['repo'], source: args['source'], ...(args['target'] ? { target: args['target'] } : {}), title: args['title'], ...(args['description'] ? { description: args['description'] } : {}) }),
  },
  {
    name: 'mr_note_add',
    description: 'Agrega un comentario a un Merge Request de GitLab con el token diario de Claude. Solo agrega: no resuelve ni borra discusiones.',
    shape: { repo: z.string().describe('Carpeta del repo, ej. front'), iid: z.number().int().min(1).describe('Número del MR'), body: z.string().min(1).max(20_000) },
    run: (args, call) => call('POST', '/api/gitlab/mr-note', { repo: args['repo'], iid: args['iid'], body: args['body'] }),
  },
  { name: 'claude_env_names', description: 'Nombres (nunca los valores) de las variables y tokens guardados para Claude, cuándo se guardaron y si el token diario de GitLab está activo. Para usarlas: `dpx run -- <comando>`.', shape: {}, run: (_a, call) => call('GET', '/api/claude-env') },
  { name: 'activity', description: 'Historial de los últimos 5 días: commits, push, MRs, revisiones, análisis, estimaciones y pruebas, por día.', shape: {}, run: (_a, call) => call('GET', '/api/activity') },
  { name: 'daily_checklist', description: 'Checklist de todos los días de hoy (entrada, salida, cargar horas) y qué está tildado.', shape: {}, run: (_a, call) => call('GET', '/api/checklist/daily') },
  {
    name: 'redmine_issue',
    description: 'Un ticket de Redmine (solo lectura): estado, asignado, story points, horas, fechas y últimos comentarios.',
    shape: { id: z.string().regex(/^\d{3,6}$/).describe('Número de ticket, ej. 33526') },
    run: (args, call) => call('GET', `/api/redmine/issues/${String(args['id'])}`),
  },
  {
    name: 'kanban',
    description: 'Mis tickets de Redmine con cambios recientes (el kanban): por estado, con SP, horas y última actualización. Solo los asignados al dueño de la API key.',
    shape: { days: z.number().int().min(1).max(60).default(30) },
    run: (args, call) => call('GET', `/api/redmine/board${query({ days: String(args['days']) })}`),
  },
  { name: 'sp_history', description: 'Story points entregados por semana (últimas 4) y su promedio.', shape: {}, run: (_a, call) => call('GET', '/api/redmine/sp-history') },
  { name: 'snapshots', description: 'Snapshots de datos guardados en este equipo.', shape: {}, run: (_a, call) => call('GET', '/api/data/snapshots') },
  {
    name: 'testdata',
    description: 'Cuántos documentos de prueba marcados con "[ticket]" hay en las colecciones configuradas.',
    shape: { ticket: z.string().regex(/^\d{3,6}$/).describe('Número de ticket, ej. 33526') },
    run: (args, call) => call('GET', `/api/testdata${query({ ticket: String(args['ticket']) })}`),
  },
];

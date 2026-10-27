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
 * Herramientas que Claude puede usar. Solo lectura y el levantado en orden.
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
    description: 'Tickets de Redmine con cambios recientes (el kanban): por estado, con SP, horas y última actualización.',
    shape: { scope: z.enum(['me', 'all']).default('me'), days: z.number().int().min(1).max(90).default(30) },
    run: (args, call) => call('GET', `/api/redmine/board${query({ scope: String(args['scope']), days: String(args['days']) })}`),
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

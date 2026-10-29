import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { listContainers, readTscStatus, type TscState } from './containers.js';
import { listTestData, type TestDataRow } from './testData.js';
import { servicesForTicket, type TicketMeta } from './tickets.js';
import type { Level } from './ticketStatus.js';

// ---------------------------------------------------------------- servicios que necesita el ticket
export interface ServiceHealth {
  service: string;
  container: string | null;
  state: string;
  health: 'healthy' | 'unhealthy' | null;
  tsc: TscState | null;
  ports: string;
  level: Level;
  detail: string;
}

export interface ServicesReport {
  services: ServiceHealth[];
  /** Repos o servicios de ticket.json que no son un servicio del compose (ej. el front). */
  skipped: string[];
  /** Comando para levantar lo que falta (se muestra, no se ejecuta: para eso está "Levantar servicios"). */
  missing: string[];
}

/** Estado de cada servicio que hay que tener arriba para probar el ticket: los de siempre, los de sus repos y los de `servicios`. */
export const readServicesHealth = async (config: DevPanelConfig, meta: TicketMeta | null, runner: Runner = run): Promise<ServicesReport> => {
  const wanted = servicesForTicket(config, meta);
  const { stage1, stage2, mandatory } = config.startup;
  const names = [...new Set([...stage1, ...stage2, ...mandatory, ...wanted.optional])];
  const containers = await listContainers(runner);
  const services: ServiceHealth[] = [];
  for (const service of names) {
    const container = containers.find((item) => item.service === service) ?? null;
    if (!container) {
      services.push({ service, container: null, state: 'missing', health: null, tsc: null, ports: '', level: 'error', detail: 'No hay contenedor (nunca se levantó)' });
      continue;
    }
    const running = container.state === 'running';
    // El cliente de MinIO (`mc`) crea el bucket y termina: que esté "Exited (0)" es lo normal, no una caída.
    if (!running && /(^|-)mc$/.test(service) && /Exited \(0\)/.test(container.status)) {
      services.push({ service, container: container.name, state: container.state, health: null, tsc: null, ports: container.ports, level: 'idle', detail: 'Tarea de una sola vez: terminó bien' });
      continue;
    }
    const health = container.status.includes('unhealthy') ? 'unhealthy' : container.status.includes('healthy') ? 'healthy' : null;
    const tsc = running ? (await readTscStatus(container.name, runner)).state : null;
    let level: Level = 'ok';
    let detail = container.status;
    if (!running) ({ level, detail } = { level: 'error', detail: `Detenido (${container.state})` });
    else if (health === 'unhealthy') ({ level, detail } = { level: 'warn', detail: 'Healthcheck en rojo' });
    else if (tsc === 'stuck') ({ level, detail } = { level: 'warn', detail: 'tsc --watch trabado: reiniciar el contenedor' });
    else if (tsc === 'errors') ({ level, detail } = { level: 'error', detail: 'tsc --watch con errores de compilación' });
    services.push({ service, container: container.name, state: container.state, health, tsc, ports: container.ports, level, detail });
  }
  const mongo = containers.find((item) => item.name === config.mongo.container);
  if (mongo && !names.includes(mongo.service ?? '')) services.push({ service: mongo.service ?? mongo.name, container: mongo.name, state: mongo.state, health: null, tsc: null, ports: mongo.ports, level: mongo.state === 'running' ? 'ok' : 'error', detail: mongo.state === 'running' ? mongo.status : `Detenido (${mongo.state})` });
  else if (!mongo) services.push({ service: config.mongo.container, container: null, state: 'missing', health: null, tsc: null, ports: '', level: 'error', detail: 'Mongo no existe como contenedor' });
  return { services, skipped: wanted.skipped, missing: services.filter((item) => item.level === 'error' && item.state !== 'running').map((item) => item.service) };
};

// ---------------------------------------------------------------- datos de prueba
export interface QueueRow {
  name: string;
  ready: number;
  unacked: number;
}

/** `rabbitmqctl list_queues name messages_ready messages_unacknowledged`: solo las líneas "nombre\tn\tn" (ignora cabeceras). */
export const parseQueues = (text: string): QueueRow[] =>
  text.split('\n').flatMap((line) => {
    const match = /^(\S+)\s+(\d+)\s+(\d+)$/.exec(line.trim());
    return match ? [{ name: match[1]!, ready: Number(match[2]), unacked: Number(match[3]) }] : [];
  });

export interface TestDataReport {
  ticket: string | null;
  rows: TestDataRow[];
  total: number;
  /** Por qué no se pudieron contar (Mongo caído, sin número de ticket). */
  error: string | null;
  /** Colas con mensajes pendientes o sin confirmar (típico: user.update que dejan documentos y files al probar). */
  queues: QueueRow[] | null;
  queuesError: string | null;
  /** Texto libre de ticket.json (`datosPrueba`): se muestra, nunca se ejecuta. */
  notes: NonNullable<TicketMeta['datosPrueba']> | null;
}

export const readTestDataReport = async (config: DevPanelConfig, meta: TicketMeta | null, ticket: string | null, runner: Runner = run): Promise<TestDataReport> => {
  const report: TestDataReport = { ticket, rows: [], total: 0, error: null, queues: null, queuesError: null, notes: meta?.datosPrueba ?? null };
  if (!ticket) report.error = 'La carpeta no tiene número de ticket';
  else {
    try {
      report.rows = await listTestData(config, ticket, runner);
      report.total = report.rows.reduce((sum, row) => sum + row.count, 0);
    } catch (error) {
      report.error = (error as Error).message;
    }
  }
  const queues = await runner('docker', ['exec', config.startup.rabbitReady.container, 'rabbitmqctl', 'list_queues', 'name', 'messages_ready', 'messages_unacknowledged', '--quiet'], 20_000);
  if (queues.ok) report.queues = parseQueues(queues.stdout).filter((queue) => queue.ready > 0 || queue.unacked > 0);
  else report.queuesError = 'No se pudo consultar RabbitMQ (¿está levantado?)';
  return report;
};

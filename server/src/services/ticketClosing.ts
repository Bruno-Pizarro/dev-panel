import type { MrInfo } from './gitlab.js';
import type { TestDataReport } from './ticketHealth.js';
import type { Level, ShipItem } from './ticketStatus.js';

/**
 * Checklist de cierre de un ticket: lo que queda por revisar DESPUÉS de abrir los MRs (merge, datos de prueba, ramas, horas).
 * El panel no redacta nada: junta el material y arma un pedido para copiar y pegarle a Claude, que sí escribe el comentario.
 */
export interface ClosingInput {
  ticket: string | null;
  title: string;
  mrs: MrInfo[];
  /** `null` = no se pudo consultar GitLab. */
  mrsAvailable: boolean;
  testData: TestDataReport | null;
  /** Repos del ticket con trabajo sin commitear o sin publicar. */
  repoIssues: string[];
  note: string;
}

export interface ClosingReport {
  items: ShipItem[];
  summary: { done: number; pending: number };
  request: string;
}

const item = (id: string, label: string, level: Level, detail: string): ShipItem => ({ id, label, level, detail });

export const buildClosingItems = ({ mrs, mrsAvailable, testData, repoIssues }: ClosingInput): ShipItem[] => {
  const items: ShipItem[] = [];

  if (!mrsAvailable) items.push(item('mrs', 'MRs mergeados', 'idle', 'No se pudo consultar GitLab'));
  else if (!mrs.length) items.push(item('mrs', 'MRs mergeados', 'idle', 'El ticket no tiene MRs registrados'));
  else {
    const open = mrs.filter((mr) => mr.state !== 'merged' && mr.state !== 'closed');
    items.push(
      open.length
        ? item('mrs', 'MRs mergeados', 'warn', `Faltan ${open.length} de ${mrs.length}: ${open.map((mr) => `${mr.repo ?? '?'} !${mr.iid}`).join(', ')}`)
        : item('mrs', 'MRs mergeados', 'ok', `${mrs.length} de ${mrs.length}`),
    );
    const failing = mrs.filter((mr) => mr.pipeline?.status === 'failed');
    if (failing.length) items.push(item('pipeline', 'Pipelines', 'error', `Fallaron: ${failing.map((mr) => `${mr.repo ?? '?'} !${mr.iid}`).join(', ')}`));
  }

  items.push(
    repoIssues.length ? item('repos', 'Repos sin trabajo suelto', 'warn', repoIssues.join(' · ')) : item('repos', 'Repos sin trabajo suelto', 'ok', 'Nada sin commitear ni sin publicar'),
  );

  if (!testData || testData.error) items.push(item('data', 'Datos de prueba limpios', 'idle', testData?.error ?? 'No se pudieron contar'));
  else
    items.push(
      testData.total
        ? item('data', 'Datos de prueba limpios', 'warn', `${testData.total} documentos marcados con [${testData.ticket}] (se limpian desde Datos, con tu OK)`)
        : item('data', 'Datos de prueba limpios', 'ok', 'Sin documentos marcados'),
    );
  if (testData?.queues?.length) items.push(item('queues', 'Colas de RabbitMQ', 'warn', `${testData.queues.length} con mensajes pendientes o sin confirmar`));

  // Lo que depende de una persona: el panel solo lo recuerda.
  items.push(item('qa', 'Ticket de QA actualizado', 'idle', 'Pasale a Control QA lo que hay que probar y los datos de acceso'));
  items.push(item('hours', 'Horas cargadas', 'idle', 'Cargalas en Redmine (la sugerencia está en el Daily)'));
  return items;
};

export const buildClosingRequest = (input: ClosingInput, items: ShipItem[]): string => {
  const pending = items.filter((entry) => entry.level === 'warn' || entry.level === 'error');
  const lines = [
    `Cerremos el ticket ${input.ticket ? `#${input.ticket} ` : ''}${input.title}.`,
    '',
    'MRs:',
    ...(input.mrs.length ? input.mrs.map((mr) => `- ${mr.repo ?? '?'} !${mr.iid} (${mr.state ?? 'sin estado'})${mr.url ? ` ${mr.url}` : ''}`) : ['- (sin MRs registrados)']),
    '',
    pending.length ? 'Pendientes que ve el panel:' : 'El panel no ve pendientes.',
    ...pending.map((entry) => `- ${entry.label}: ${entry.detail}`),
  ];
  if (input.note.trim()) lines.push('', 'Mis notas del ticket:', input.note.trim());
  lines.push(
    '',
    'Necesito que:',
    '1. Me redactes el comentario de cierre para Redmine (qué se hizo, cómo probarlo, repos y MRs).',
    '2. Me sugieras las horas a cargar (es una sugerencia, yo decido).',
    '3. Me avises qué falta limpiar o revisar. No hagas push, merge ni cambios en Redmine sin mi confirmación.',
  );
  return lines.join('\n');
};

export const buildClosing = (input: ClosingInput): ClosingReport => {
  const items = buildClosingItems(input);
  return {
    items,
    summary: { done: items.filter((entry) => entry.level === 'ok').length, pending: items.filter((entry) => entry.level === 'warn' || entry.level === 'error').length },
    request: buildClosingRequest(input, items),
  };
};

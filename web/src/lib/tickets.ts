import type { TicketDetail } from './types';

export const assetUrl = (dir: string, path: string): string => `/api/tickets/${encodeURIComponent(dir)}/asset?path=${encodeURIComponent(path)}`;
export const fileUrl = (dir: string, path: string): string => `/api/tickets/${encodeURIComponent(dir)}/file?path=${encodeURIComponent(path)}`;

/** Resuelve una ruta relativa respecto del archivo que la menciona, sin salir de la carpeta del ticket. */
export const resolveRelative = (fromFile: string, target: string): string | null => {
  if (/^[a-z]+:|^\//i.test(target)) return null;
  const parts = fromFile.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
};

export const timeAgo = (timestamp: number, now = Date.now()): string => {
  const days = Math.floor((now - timestamp) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
};

export interface DocGroup {
  label: string;
  files: string[];
}

const DOC_KINDS: Array<[RegExp, string]> = [
  [/CONTRATO/i, 'Contrato'],
  [/ARQUITECTO/i, 'Análisis del arquitecto'],
  [/PLAN_EJECUTOR|PLAN/i, 'Plan'],
  [/EJECUCION|EJECUCIÓN/i, 'Informe de ejecución'],
  [/HALLAZGOS|SEGURIDAD/i, 'Hallazgos'],
  [/BRIEF|^0\d_/i, 'Brief y especificación'],
];

export const classifyDocs = (files: string[]): DocGroup[] => {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const name = file.split('/').pop() ?? file;
    const label = DOC_KINDS.find(([pattern]) => pattern.test(name))?.[1] ?? 'Otros documentos';
    groups.set(label, [...(groups.get(label) ?? []), file]);
  }
  return [...groups].map(([label, list]) => ({ label, files: list }));
};

/** Archivo del plan abreviado: el que declara `ticket.json` o, si no, el plan ejecutor. */
export const planDoc = (detail: TicketDetail): string | null =>
  detail.meta?.plan?.resumen ?? detail.files.docs.find((file) => /PLAN_EJECUTOR/i.test(file)) ?? detail.files.docs.find((file) => /PLAN/i.test(file)) ?? null;

export const diagramFile = (detail: TicketDetail): string | null => detail.meta?.plan?.diagrama ?? detail.files.diagrams[0] ?? null;

export const referenceImage = (detail: TicketDetail): string | null =>
  detail.meta?.plan?.referenciaVisual ?? detail.files.images.find((file) => /referencia|mockup|prototipo|propuesta/i.test(file)) ?? null;

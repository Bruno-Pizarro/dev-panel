import type { CriticalCategory, CriticalPoint } from './types';

export const CATEGORY_LABELS: Record<CriticalCategory, string> = {
  seguridad: 'Seguridad',
  permisos: 'Permisos',
  compartido: 'Usado en muchos lugares',
  'base-datos': 'Base de datos',
  modelos: 'Modelos',
  liquidacion: 'Motor de liquidación',
  borrados: 'Borrados',
  inyeccion: 'Inyección / XSS',
  contratos: 'Contratos entre servicios',
  'dinero-fechas': 'Dinero, fechas y redondeos',
  rendimiento: 'Rendimiento de base',
  infra: 'Infra y configuración',
  sensibles: 'Datos sensibles',
  guards: 'Guards e interceptors',
  revision: 'Revisión',
};

/** En los MRs el repo es «front !183»; para empatar con los puntos alcanza con el nombre. */
export const repoName = (repo: string): string => repo.split(' ')[0] ?? repo;

/** Los puntos de un archivo: los de reglas son del diff de su alcance; los que dejó una revisión valen en cualquier alcance. */
export const pointsFor = (points: CriticalPoint[], repo: string, scope: 'committed' | 'working', path: string): CriticalPoint[] =>
  points.filter((point) => point.path === path && repoName(point.repo) === repoName(repo) && (point.source === 'revision' || point.scope === scope));

export const coversLine = (point: CriticalPoint, line: number | null): boolean => point.line !== null && line !== null && line >= point.line && line <= (point.endLine ?? point.line);

export const sourceLabel = (point: CriticalPoint): string => (point.source === 'revision' ? 'revisión' : point.source === 'compartido' ? 'usos' : 'regla');

export interface DiffLineRef {
  kind: string;
  /** Número de línea del archivo nuevo; los saltos de bloque no lo traen. */
  next?: number | null;
}

export interface CriticalPlacement {
  /** Fila del diff → severidad más alta que la cubre (para resaltarla). */
  marked: Map<number, 'critica' | 'alta'>;
  /** Fila del diff → puntos cuya línea es exactamente esa (el motivo va debajo de la fila). */
  notes: Map<number, CriticalPoint[]>;
  /** Puntos de archivo entero (sin línea). */
  fileWide: CriticalPoint[];
  /** Puntos con línea que no cae en ninguna fila de este diff (por ejemplo, líneas que ya se vieron en «Últimos cambios»). */
  outside: CriticalPoint[];
}

/** Ubica los puntos críticos en las filas de un diff, por número de línea nuevo. Los saltos de bloque (`hunk`) no cuentan. */
export const placeCriticalPoints = (lines: DiffLineRef[], points: CriticalPoint[]): CriticalPlacement => {
  const marked = new Map<number, 'critica' | 'alta'>();
  const notes = new Map<number, CriticalPoint[]>();
  const placed = new Set<CriticalPoint>();
  lines.forEach((line, index) => {
    if (line.kind === 'hunk') return;
    for (const point of points) {
      if (!coversLine(point, line.next ?? null)) continue;
      placed.add(point);
      if (marked.get(index) !== 'critica') marked.set(index, point.severity);
      if (point.line === (line.next ?? null)) notes.set(index, [...(notes.get(index) ?? []), point]);
    }
  });
  return { marked, notes, fileWide: points.filter((point) => point.line === null), outside: points.filter((point) => point.line !== null && !placed.has(point)) };
};

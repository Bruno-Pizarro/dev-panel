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

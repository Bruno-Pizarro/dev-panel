import type { Conclusion } from './types';

export const CONCLUSIONS: Array<{ id: Conclusion; label: string; tone: 'success' | 'warning' | 'neutral' }> = [
  { id: 'aprobado', label: 'Aprobado', tone: 'success' },
  { id: 'requiere-cambios', label: 'Requiere cambios', tone: 'warning' },
  { id: 'sin-conclusion', label: 'Sin conclusión', tone: 'neutral' },
];
export const conclusionInfo = (id: Conclusion) => CONCLUSIONS.find((item) => item.id === id) ?? CONCLUSIONS[2]!;

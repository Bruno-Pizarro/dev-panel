/**
 * Qué ticket de Redmine se muestra: la elección del usuario manda (si todavía existe); si no eligió, un ticket de solo revisión
 * empieza en su ticket de QA y cualquier otro en el principal.
 */
export const activeTicket = (main: string | null, qaIds: number[], chosen: string | null, preferQa: boolean): string | null => {
  if (chosen !== null && (chosen === main || qaIds.some((id) => String(id) === chosen))) return chosen;
  return preferQa && qaIds.length > 0 ? String(qaIds[0]) : main;
};

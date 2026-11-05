/** Deja el primero de cada `id`: las listas de avisos usan el id como clave y como marca de «oculto». */
export const uniqueById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
};

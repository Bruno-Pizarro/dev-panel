import type { DiffLine } from './diff';

/** Un archivo cambiado tal como se ve en pantalla: su ruta y las líneas de su diff (`null` = todavía no se cargó). */
export interface SearchFile {
  key: string;
  path: string;
  rows: DiffLine[] | null;
}

/** Un resultado: el nombre del archivo (`line: null`) o una línea de su diff (índice dentro de las líneas ya interpretadas). */
export interface SearchMatch {
  file: string;
  line: number | null;
}

const norm = (value: string) => value.toLocaleLowerCase('es');

/**
 * Resultados de la búsqueda en los archivos cambiados, en el orden en que se ven: por archivo, primero su nombre y después sus líneas.
 * Sin distinguir mayúsculas. Busca SOLO en los nombres de los archivos y en las líneas de sus cambios (no en los encabezados `@@`).
 */
export const findMatches = (files: SearchFile[], query: string): SearchMatch[] => {
  const needle = norm(query);
  if (!needle) return [];
  const matches: SearchMatch[] = [];
  for (const file of files) {
    if (norm(file.path).includes(needle)) matches.push({ file: file.key, line: null });
    file.rows?.forEach((row, index) => {
      if (row.kind !== 'hunk' && norm(row.text).includes(needle)) matches.push({ file: file.key, line: index });
    });
  }
  return matches;
};

/** Parte un texto en tramos con y sin la búsqueda (todas las apariciones, sin distinguir mayúsculas), para resaltarlos. */
export const splitByQuery = (text: string, query: string): Array<{ text: string; hit: boolean }> => {
  const needle = norm(query);
  if (!needle || !text) return [{ text, hit: false }];
  const lower = norm(text);
  // Pasar a minúsculas puede cambiar el largo de algún carácter raro: en ese caso no se resalta (mejor sin marca que mal marcada).
  if (lower.length !== text.length) return [{ text, hit: false }];
  const parts: Array<{ text: string; hit: boolean }> = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
};

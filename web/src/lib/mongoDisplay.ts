/**
 * Presentación de documentos de Mongo en JSON extendido canónico ({"$oid":…}, {"$date":…}, {"$numberLong":…}) como valores legibles.
 * Solo es para mostrar: el filtro que se escribe sigue siendo JSON extendido.
 */
export interface ExplorerPage {
  documents: Array<Record<string, unknown>>;
  limit: number;
  skip: number;
  hasMore: boolean;
  total: number;
  masked: boolean;
}

export interface SchemaField {
  path: string;
  types: Record<string, number>;
  presence: number;
}

const NUMBER_KEYS = ['$numberLong', '$numberInt', '$numberDouble', '$numberDecimal'];

/** Un número en JSON extendido, en texto normal: sin notación científica (2.09E10 → 20940148082) y sin perder dígitos de los long enormes. */
export const numberText = (text: string): string => {
  const number = Number(text);
  if (!Number.isFinite(number)) return text;
  if (Number.isInteger(number) && !Number.isSafeInteger(number)) return /^-?\d+$/.test(text) ? text : number.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 });
  return number.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
};

/** Si es un valor de tipo especial, su texto legible; si no, null. */
export const specialText = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value as object);
  if (keys.length !== 1) return null;
  const key = keys[0]!;
  const inner = (value as Record<string, unknown>)[key];
  if (key === '$oid' && typeof inner === 'string') return inner;
  if (key === '$date') {
    const iso = typeof inner === 'string' ? inner : inner && typeof inner === 'object' && '$numberLong' in inner ? new Date(Number((inner as { $numberLong: string }).$numberLong)).toISOString() : null;
    return iso;
  }
  if (NUMBER_KEYS.includes(key) && typeof inner === 'string') return numberText(inner);
  return null;
};

/** Reemplaza los tipos especiales por su valor legible (ObjectId → texto, fecha → ISO, long → número), a cualquier profundidad. */
export const simplify = (value: unknown): unknown => {
  const special = specialText(value);
  if (special !== null) {
    const isNumber = NUMBER_KEYS.some((key) => key in (value as object));
    if (!isNumber) return special;
    // Un número normal se devuelve como número; uno que no entra sin perder dígitos (long enorme) queda como texto.
    const number = Number(special);
    return Number.isFinite(number) && (Number.isSafeInteger(number) || !Number.isInteger(number)) ? number : special;
  }
  if (Array.isArray(value)) return value.map(simplify);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, simplify(inner)]));
  return value;
};

export const prettyJson = (value: unknown): string => JSON.stringify(simplify(value), null, 2);

/** Texto corto de una celda de la tabla. */
export const cellText = (value: unknown, max = 80): string => {
  if (value === undefined) return '';
  if (value === null) return 'null';
  const special = specialText(value);
  let text: string;
  if (special !== null) text = special;
  else if (typeof value === 'string') text = value;
  else if (Array.isArray(value)) text = `[${value.length}] ${JSON.stringify(simplify(value))}`;
  else if (typeof value === 'object') text = JSON.stringify(simplify(value));
  else text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** Columnas de la tabla: los campos de primer nivel de los documentos, `_id` primero, con un tope. */
export const columnsOf = (documents: Array<Record<string, unknown>>, max = 12): string[] => {
  const seen = new Map<string, number>();
  for (const document of documents) for (const key of Object.keys(document)) seen.set(key, (seen.get(key) ?? 0) + 1);
  return [...seen.entries()]
    .sort((a, b) => (a[0] === '_id' ? -1 : b[0] === '_id' ? 1 : b[1] - a[1]))
    .map(([key]) => key)
    .slice(0, max);
};

/** Atajo de búsqueda por `_id`: 24 hexadecimales es un ObjectId; cualquier otra cosa se busca como texto. */
export const idFilter = (text: string): string => {
  const id = text.trim();
  if (!id) return '';
  return /^[a-f0-9]{24}$/i.test(id) ? JSON.stringify({ _id: { $oid: id } }) : JSON.stringify({ _id: id });
};

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

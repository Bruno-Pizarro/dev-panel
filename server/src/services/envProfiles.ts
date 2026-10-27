import type { EnvProfile } from '../config.js';

export type EnvTarget = 'local' | 'remote';
export type EnvState = 'local' | 'remote' | 'mixed' | 'unknown';

interface ParsedLine {
  commented: boolean;
  key: string;
  value: string;
}

export interface ManagedLine {
  /** Número de línea (desde 1). */
  line: number;
  key: string;
  active: boolean;
  /** Texto de la línea con los valores sensibles enmascarados. */
  text: string;
  /** A qué perfil pertenece: activa en MinIO local o activa en remoto. */
  group: 'minio' | 'remote';
}

export interface EnvInspection {
  state: EnvState;
  managed: ManagedLine[];
  /** Matchers sin ninguna línea en el archivo. */
  missing: string[];
  /** Matchers que coinciden con más de una línea (bloques duplicados): no se aplica nada. */
  conflicts: string[];
}

export interface EnvChange {
  line: number;
  from: string;
  to: string;
}

const LINE = /^\s*(#\s*)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const SENSITIVE = /(SECRET|PASSWORD|PASS|TOKEN|KEY)/i;

const parseLine = (text: string): ParsedLine | null => {
  const match = LINE.exec(text);
  if (!match) return null;
  // El valor termina antes de un comentario en la misma línea (" #...") y sin comillas.
  const value = (match[3] ?? '').replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  return { commented: Boolean(match[1]), key: match[2]!, value };
};

/**
 * Matchers: "CLAVE" (cualquier valor), "CLAVE=valor" (ese valor exacto) o "CLAVE!=valor" (la línea de esa clave
 * cuyo valor es otro: sirve para distinguir el bloque remoto del de MinIO sin escribir credenciales en la configuración).
 */
const matches = (matcher: string, parsed: ParsedLine): boolean => {
  const negated = matcher.indexOf('!=');
  if (negated > 0) return parsed.key === matcher.slice(0, negated) && parsed.value !== matcher.slice(negated + 2);
  const [key, ...rest] = matcher.split('=');
  if (parsed.key !== key) return false;
  return rest.length === 0 || parsed.value === rest.join('=');
};

export const maskLine = (text: string): string => {
  const parsed = LINE.exec(text);
  if (!parsed || !SENSITIVE.test(parsed[2]!)) return text;
  return text.replace(/=.*$/, '=••••••');
};

const comment = (text: string): string => text.replace(/^(\s*)/, '$1# ');
const uncomment = (text: string): string => text.replace(/^(\s*)#\s?/, '$1');

/** Busca, para cada matcher, la línea del archivo que le corresponde (exactamente una). */
const locate = (lines: string[], profile: EnvProfile) => {
  const found: Array<{ index: number; group: 'minio' | 'remote'; matcher: string }> = [];
  const missing: string[] = [];
  const conflicts: string[] = [];
  const groups: Array<['minio' | 'remote', string[]]> = [['minio', profile.minio], ['remote', profile.remote]];
  for (const [group, matchers] of groups) {
    for (const matcher of matchers) {
      const hits = lines.flatMap((text, index) => {
        const parsed = parseLine(text);
        return parsed && matches(matcher, parsed) ? [index] : [];
      });
      if (hits.length === 0) missing.push(matcher);
      else if (hits.length > 1) conflicts.push(`${matcher} (líneas ${hits.map((hit) => hit + 1).join(', ')})`);
      else found.push({ index: hits[0]!, group, matcher });
    }
  }
  return { found, missing, conflicts };
};

export const inspectEnv = (content: string, profile: EnvProfile): EnvInspection => {
  const lines = content.split('\n');
  const { found, missing, conflicts } = locate(lines, profile);
  const managed: ManagedLine[] = found
    .map(({ index, group }) => ({ line: index + 1, key: parseLine(lines[index]!)!.key, active: !parseLine(lines[index]!)!.commented, text: maskLine(lines[index]!), group }))
    .sort((a, b) => a.line - b.line);

  const minio = managed.filter((item) => item.group === 'minio');
  const remote = managed.filter((item) => item.group === 'remote');
  let state: EnvState = 'unknown';
  if (!missing.length && !conflicts.length) {
    const minioActive = minio.every((item) => item.active);
    const minioOff = minio.every((item) => !item.active);
    const remoteActive = remote.every((item) => item.active);
    const remoteOff = remote.every((item) => !item.active);
    if (minioActive && remoteOff) state = 'local';
    else if (minioOff && remoteActive) state = 'remote';
    else state = 'mixed';
  }
  return { state, managed, missing, conflicts };
};

export class EnvProfileError extends Error {}

/** Cambia solo el prefijo `# ` de las líneas gestionadas: los valores no se tocan. */
export const applyProfile = (content: string, profile: EnvProfile, target: EnvTarget): { content: string; changes: EnvChange[] } => {
  const lines = content.split('\n');
  const { found, missing, conflicts } = locate(lines, profile);
  if (conflicts.length) throw new EnvProfileError(`Claves repetidas en el archivo, no se puede decidir cuál cambiar: ${conflicts.join('; ')}`);
  if (missing.length) throw new EnvProfileError(`No se encontraron en el archivo: ${missing.join(', ')}`);

  const changes: EnvChange[] = [];
  for (const { index, group } of found) {
    const original = lines[index]!;
    const wantActive = (group === 'minio') === (target === 'local');
    const isActive = !parseLine(original)!.commented;
    if (wantActive === isActive) continue;
    const updated = wantActive ? uncomment(original) : comment(original);
    lines[index] = updated;
    changes.push({ line: index + 1, from: maskLine(original), to: maskLine(updated) });
  }
  return { content: lines.join('\n'), changes };
};

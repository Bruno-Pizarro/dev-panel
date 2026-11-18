import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import type { ViewedMap } from './changeReview.js';
import { readMrChanges, readMrFileDiff } from './mrChanges.js';
import { isSafeRelativePath, readFileDiff, readTicketChanges, type ChangedFile } from './ticketChanges.js';
import type { TicketMeta } from './tickets.js';

/**
 * Cambios críticos: puntos exactos de un cambio que conviene mirar con más cuidado (seguridad, permisos, base de datos, modelos,
 * motor de liquidación, utilidades usadas en muchos lugares…). Salen de dos fuentes: reglas automáticas sobre el diff (sin IA) y los
 * puntos que deja una revisión de Claude en `ticket.json` (`cambiosCriticos`). El panel solo los muestra: nunca bloquea ni cambia nada.
 */

export type CriticalCategory =
  | 'seguridad'
  | 'permisos'
  | 'compartido'
  | 'base-datos'
  | 'modelos'
  | 'liquidacion'
  | 'borrados'
  | 'inyeccion'
  | 'contratos'
  | 'dinero-fechas'
  | 'rendimiento'
  | 'infra'
  | 'sensibles'
  | 'guards'
  | 'revision';

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

export type CriticalSeverity = 'critica' | 'alta';
export type CriticalSource = 'regla' | 'revision' | 'compartido';

/** Una regla: `paths` (sola) marca el archivo entero; `lines` marca las líneas agregadas (dentro de `paths`, si los hay). */
export interface CriticalRule {
  id: string;
  category: CriticalCategory;
  severity: CriticalSeverity;
  reason: string;
  /** Expresiones regulares (sin distinguir mayúsculas) sobre la ruta del archivo. */
  paths?: string[] | undefined;
  /** Expresiones regulares sobre cada línea agregada. */
  lines?: string[] | undefined;
  /** Si la línea agregada cumple alguna de estas, no cuenta (por ejemplo, ya está escapada). */
  unless?: string[] | undefined;
  /** Expresiones regulares sobre las líneas quitadas: se marca el lugar donde estaban. */
  removedLines?: string[] | undefined;
  /** Solo en estos repos (nombre de carpeta). */
  repos?: string[] | undefined;
}

export interface CriticalPoint {
  repo: string;
  scope: 'committed' | 'working';
  path: string;
  /** Línea del archivo nuevo; `null` = todo el archivo. */
  line: number | null;
  endLine?: number | null;
  ruleId: string;
  category: CriticalCategory;
  severity: CriticalSeverity;
  reason: string;
  source: CriticalSource;
  /** La línea que lo disparó (recortada). */
  snippet?: string;
}

const ROUTE_FILE = String.raw`(\.route\.ts$|/routes?/)`;
const MODEL_FILE = String.raw`(\.model\.(ts|js)$|/models?/[^/]+\.(ts|js)$)`;
const LIQUIDACION_ENGINE = String.raw`modules/(calculoLiq|calculo|acumula\w*|totalizador\w*|variable\w*|glosario\w*|concepto\w*|formula\w*|novedad\w*|auxiliar\w*)/`;

export const DEFAULT_CRITICAL_RULES: CriticalRule[] = [
  // ── Permisos ──────────────────────────────────────────────────────────────
  { id: 'permisos-roles', category: 'permisos', severity: 'critica', reason: 'Cambia qué rol puede hacer qué: un permiso de más o de menos alcanza a todos los usuarios.', paths: [String.raw`(^|/)config/roles\.(ts|js)$`, String.raw`(^|/)roles\.(ts|js)$`] },
  { id: 'permisos-auth-ruta', category: 'permisos', severity: 'alta', reason: 'Ruta autenticada pero sin ningún permiso, o se quitó o cambió el permiso que exigía: cualquier usuario con sesión puede llamarla.', paths: [ROUTE_FILE], lines: [String.raw`\bauth\(\s*\)`], removedLines: [String.raw`\bauth\(`] },
  // ── Seguridad ─────────────────────────────────────────────────────────────
  { id: 'seguridad-secretos', category: 'seguridad', severity: 'critica', reason: 'Toca autenticación, firma o secretos entre servicios.', lines: [String.raw`x-internal-secret`, String.raw`JWT_SECRET`, String.raw`internalServiceSecret`, String.raw`\bbcrypt\b`, String.raw`\bcrypto\.(create\w+|random\w*|sign|verify)\b`, String.raw`\bjwt\.(sign|verify)\(`, String.raw`jsonwebtoken`] },
  { id: 'seguridad-modulos', category: 'seguridad', severity: 'alta', reason: 'Módulo de autenticación o sesión: un error deja entrar a quien no debe o saca a quien sí.', paths: [String.raw`modules/(auth|token|session|security)/`] },
  // ── Inyección / XSS ───────────────────────────────────────────────────────
  { id: 'inyeccion-regexp', category: 'inyeccion', severity: 'alta', reason: 'RegExp armada con un valor de afuera sin escapar: rompe con ( o [ y es riesgo de ReDoS.', lines: [String.raw`new RegExp\(`], unless: [String.raw`escapeRegex`, String.raw`escapeRegExp`, String.raw`new RegExp\(\s*['"\x60/]`] },
  { id: 'inyeccion-eval', category: 'inyeccion', severity: 'critica', reason: 'Ejecuta código o consultas armadas con texto (eval, new Function, $where).', lines: [String.raw`\$where\b`, String.raw`\beval\(`, String.raw`new Function\(`] },
  { id: 'inyeccion-html', category: 'inyeccion', severity: 'critica', reason: 'Inserta HTML sin sanear: riesgo de XSS.', lines: [String.raw`innerHTML`, String.raw`outerHTML`, String.raw`bypassSecurityTrust`, String.raw`dangerouslySetInnerHTML`, String.raw`document\.write\(`] },
  { id: 'inyeccion-exec', category: 'inyeccion', severity: 'alta', reason: 'Ejecuta un comando del sistema: con datos de afuera permite inyectar comandos.', lines: [String.raw`child_process`, String.raw`\bexec(Sync)?\(`, String.raw`\bspawn(Sync)?\(`] },
  // ── Base de datos ─────────────────────────────────────────────────────────
  { id: 'bd-indices', category: 'base-datos', severity: 'alta', reason: 'Crea o quita un índice: se construye al arrancar el servicio y puede tardar en colecciones grandes.', lines: [String.raw`createIndex`, String.raw`dropIndex`, String.raw`ensureIndex`, String.raw`syncIndexes`, String.raw`\.index\(\s*\{`] },
  { id: 'bd-scripts', category: 'base-datos', severity: 'critica', reason: 'Script o migración de datos: corre sobre datos reales y puede no tener vuelta atrás.', paths: [String.raw`\.mongo\.js$`, String.raw`/migrat\w*/`, String.raw`(^|/)migracion[\w-]*\.(ts|js)$`, String.raw`/scripts/[^/]+\.(ts|js)$`, String.raw`(^|/)seed\w*\.(ts|js)$`] },
  // ── Rendimiento ───────────────────────────────────────────────────────────
  { id: 'rend-agregacion', category: 'rendimiento', severity: 'alta', reason: 'Consulta de agregación: sin índice recorre toda la colección por cada documento (el monitor de Autogestión tardaba 14 s).', lines: [String.raw`\$lookup`, String.raw`\$facet`, String.raw`\.aggregate\(`] },
  { id: 'rend-limite', category: 'rendimiento', severity: 'alta', reason: 'Límite grande de resultados: carga todo en memoria y corta en silencio si lo supera.', lines: [String.raw`\blimit\W{1,4}\d{4,}`, String.raw`\bLIMIT\w*\s*=\s*\d{4,}`] },
  // ── Modelos ───────────────────────────────────────────────────────────────
  { id: 'modelos-esquema', category: 'modelos', severity: 'alta', reason: 'Cambia un modelo de datos: afecta a la base y a los servicios que lo replican.', paths: [MODEL_FILE] },
  { id: 'modelos-interfaz', category: 'modelos', severity: 'alta', reason: 'Cambia una interfaz de datos que comparten varios módulos.', paths: [String.raw`\.interfaces?\.ts$`], repos: ['panel', 'legajo', 'liquidacion', 'documentos', 'recibos', 'control-horario', 'cursos', 'firma', 'incidencia', 'notificaciones', 'proyectos', 'file-manager', 'security', 'recruiting', 'reconocimientoapi', 'salud-laboral', 'leia'] },
  { id: 'modelos-restricciones', category: 'modelos', severity: 'alta', reason: 'Cambia una restricción o referencia del esquema (obligatorio, único, enum, ref).', paths: [MODEL_FILE], lines: [String.raw`\b(unique\s*:\s*true|required\s*:\s*true|enum\s*:|ref\s*:)`] },
  // ── Borrados ──────────────────────────────────────────────────────────────
  { id: 'borrados-masivos', category: 'borrados', severity: 'critica', reason: 'Borrado masivo o de colección: sin filtro correcto se pierde todo.', lines: [String.raw`deleteMany`, String.raw`\.drop\(`, String.raw`dropDatabase`, String.raw`--drop\b`, String.raw`updateMany\(\s*\{\s*\}`] },
  { id: 'borrados-puntuales', category: 'borrados', severity: 'alta', reason: 'Borra un documento: confirmar que no deja referencias colgando.', lines: [String.raw`deleteOne`, String.raw`findByIdAndDelete`, String.raw`findOneAndDelete`, String.raw`\.remove\(\s*\{`] },
  // ── Contratos entre servicios ─────────────────────────────────────────────
  { id: 'contratos-eventos', category: 'contratos', severity: 'alta', reason: 'Evento entre servicios: el formato lo leen otros servicios que no se prueban acá.', paths: [String.raw`(producer|consumer|receiver|publisher|subscriber)\.(ts|js)$`, String.raw`/rabbit\w*/`] },
  { id: 'contratos-cruzados', category: 'contratos', severity: 'alta', reason: 'Llamada o ruta entre servicios: cambiarla sin coordinar rompe al otro lado.', paths: [String.raw`cross-?service`, String.raw`\.client\.(ts|js)$`, String.raw`/clients/`] },
  { id: 'contratos-validacion', category: 'contratos', severity: 'alta', reason: 'Cambia la validación de entrada de un endpoint: puede romper a quien lo llama.', paths: [String.raw`\.validation\.(ts|js)$`] },
  // ── Dinero, fechas y redondeos ────────────────────────────────────────────
  { id: 'dinero-fechas', category: 'dinero-fechas', severity: 'alta', reason: 'Redondeo, decimales o zona horaria: errores chicos que se acumulan en importes y fechas.', lines: [String.raw`\.toFixed\(`, String.raw`Math\.(round|floor|ceil|trunc)\(`, String.raw`Decimal128`, String.raw`\bredondeo\b`, String.raw`getTimezoneOffset`, String.raw`\.setHours\(`, String.raw`\btimezone\b`] },
  // ── Infra y configuración ─────────────────────────────────────────────────
  { id: 'infra-archivos', category: 'infra', severity: 'alta', reason: 'Configuración o infraestructura: se nota recién al desplegar y afecta a todos los ambientes.', paths: [String.raw`(^|/)Dockerfile`, String.raw`docker-compose[\w.-]*\.ya?ml$`, String.raw`(^|/)config/config\.(ts|js)$`, String.raw`\.env\.example$`, String.raw`ecosystem\.config\.json$`, String.raw`\.gitlab-ci\.ya?ml$`, String.raw`nginx[\w.-]*\.conf$`, String.raw`environments/environment[\w.-]*\.ts$`] },
  // ── Datos sensibles ───────────────────────────────────────────────────────
  { id: 'sensibles-logs', category: 'sensibles', severity: 'alta', reason: 'Escribe en el log un dato sensible (clave, token, documento o similar).', lines: [String.raw`(console\.\w+|logger\.\w+)\(.*\b(password|passwd|token|secret|authorization|cuil|cuit|dni)\b`] },
  { id: 'sensibles-storage', category: 'sensibles', severity: 'alta', reason: 'Guarda un token o secreto en el almacenamiento del navegador.', lines: [String.raw`localStorage\.(setItem|getItem)\(\s*['"][^'"]*(token|jwt|secret)`] },
  { id: 'sensibles-env', category: 'sensibles', severity: 'critica', reason: 'Un archivo .env entre los cambios: nunca debe subirse.', paths: [String.raw`(^|/)\.env(\.(?!example)[\w.-]+)?$`] },
  // ── Guards del front ──────────────────────────────────────────────────────
  { id: 'guards-front', category: 'guards', severity: 'alta', reason: 'Decide quién entra a una pantalla o cómo viajan las credenciales en cada pedido.', paths: [String.raw`\.guard\.ts$`, String.raw`\.interceptor\.ts$`] },
  // ── Motor de liquidación ──────────────────────────────────────────────────
  { id: 'liquidacion-motor', category: 'liquidacion', severity: 'critica', reason: 'Motor de cálculo de liquidación: un cambio puede alterar importes de todos los recibos.', repos: ['liquidacion'], paths: [LIQUIDACION_ENGINE] },
  { id: 'liquidacion-lineas', category: 'liquidacion', severity: 'critica', reason: 'Punto del cálculo que decide importes, totales o acumuladores.', repos: ['liquidacion'], paths: [String.raw`modules/calculoLiq/`], lines: [String.raw`evaluarFormula`, String.raw`actualizarAcumuladores`, String.raw`\btotal_\w+`, String.raw`esJornal`, String.raw`calcularSac`, String.raw`\bredondeo\b`] },
];

/** Los archivos de pruebas no cuentan como críticos. */
/** Documentación e imágenes: no son código, no se evalúan (salvo que una regla pida ese archivo por nombre, como .env). */
const isDocFile = (path: string): boolean => /\.(md|txt|png|jpe?g|gif|svg|webp|lock)$/i.test(path);

export const isTestFile = (path: string): boolean => /(\.(spec|test)\.[cm]?[jt]sx?$)|(^|\/)__tests__\//i.test(path);

interface Compiled {
  rule: CriticalRule;
  paths: RegExp[];
  lines: RegExp[];
  unless: RegExp[];
  removed: RegExp[];
}

const safeRegex = (source: string): RegExp | null => {
  try {
    return new RegExp(source, 'i');
  } catch {
    return null;
  }
};

const compileAll = (sources: string[] | undefined): RegExp[] => (sources ?? []).flatMap((source) => {
  const compiled = safeRegex(source);
  return compiled ? [compiled] : [];
});

/** Las reglas vigentes: las de fábrica menos las apagadas, más las propias del usuario (`changes.critical.customRules`). */
export const activeRules = (config: Pick<DevPanelConfig, 'changes'>): CriticalRule[] => {
  const off = new Set(config.changes.critical.disabledRules);
  return [...DEFAULT_CRITICAL_RULES, ...config.changes.critical.customRules].filter((rule) => !off.has(rule.id));
};

const compile = (rules: CriticalRule[]): Compiled[] =>
  rules.map((rule) => ({ rule, paths: compileAll(rule.paths), lines: compileAll(rule.lines), unless: compileAll(rule.unless), removed: compileAll(rule.removedLines) }));

interface DiffRow {
  kind: 'add' | 'del';
  /** Línea del archivo nuevo (en una línea quitada, la que viene después). */
  next: number;
  text: string;
}

/** Las líneas agregadas y quitadas de un diff de git, con su número de línea nuevo. */
export const diffRows = (diff: string): DiffRow[] => {
  const rows: DiffRow[] = [];
  let next = 0;
  let inHunk = false;
  for (const raw of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      next = Number(hunk[1]);
      inHunk = true;
    } else if (!inHunk || raw.startsWith('\\')) continue;
    else if (raw.startsWith('+')) rows.push({ kind: 'add', next: next++, text: raw.slice(1) });
    else if (raw.startsWith('-')) rows.push({ kind: 'del', next, text: raw.slice(1) });
    else if (raw.length > 0) next++;
  }
  return rows;
};

const MAX_PER_RULE_PER_FILE = 8;
const clip = (text: string): string => (text.trim().length > 160 ? `${text.trim().slice(0, 157)}…` : text.trim());

/**
 * Evalúa un archivo contra las reglas. Funciones puras (sin git): `diff` es el diff del archivo.
 * Una regla con solo `paths` marca el archivo entero; con `lines`, las líneas agregadas (y solo si la ruta coincide, cuando hay `paths`).
 */
export const evaluateFile = (rules: CriticalRule[], repo: string, scope: CriticalPoint['scope'], path: string, diff: string | null): CriticalPoint[] => {
  if (isTestFile(path) || isDocFile(path)) return [];
  const points: CriticalPoint[] = [];
  const rows = diff ? diffRows(diff) : [];
  for (const { rule, paths, lines, unless, removed } of compile(rules)) {
    if (rule.repos && !rule.repos.includes(repo)) continue;
    const pathOk = paths.length === 0 || paths.some((pattern) => pattern.test(path));
    if (!pathOk) continue;
    const base = { repo, scope, path, ruleId: rule.id, category: rule.category, severity: rule.severity, reason: rule.reason, source: 'regla' as const };
    // Una regla de líneas cuyas expresiones no compilan se omite (no debe convertirse en regla de archivo entero).
    const lineRule = (rule.lines?.length ?? 0) > 0 || (rule.removedLines?.length ?? 0) > 0;
    if (!lineRule) {
      points.push({ ...base, line: null });
      continue;
    }
    if (lines.length === 0 && removed.length === 0) continue;
    let count = 0;
    for (const row of rows) {
      const hit = row.kind === 'add' ? lines.some((pattern) => pattern.test(row.text)) && !unless.some((pattern) => pattern.test(row.text)) : removed.some((pattern) => pattern.test(row.text));
      if (!hit) continue;
      count++;
      if (count > MAX_PER_RULE_PER_FILE) break;
      points.push({ ...base, line: row.next, reason: row.kind === 'del' ? `Se quitó o cambió una línea: ${rule.reason}` : rule.reason, snippet: clip(row.text) });
    }
  }
  return dedupe(points);
};

const dedupe = (points: CriticalPoint[]): CriticalPoint[] => {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.ruleId}|${point.scope}|${point.path}|${point.line ?? 'file'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ── «Usado en muchos lugares» ────────────────────────────────────────────────

const SOURCE_FILE = /\.(ts|tsx|js|mjs)$/i;
const MAX_FANOUT_FILES = 60;
const escapeForRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cuántos archivos importan este (o, si es un componente de Angular, lo usan por su selector en plantillas). */
export const countUsers = async (repoDir: string, path: string, runner: Runner = run): Promise<number> => {
  const isEntry = /(^|\/)(main|index)\.[jt]sx?$/.test(path) && !/\/(shared|utils?|core|lib)\//.test(path);
  if (!SOURCE_FILE.test(path) || isTestFile(path) || isEntry) return 0;
  const file = path.split('/').pop() ?? path;
  const stem = file.replace(/\.[cm]?[jt]sx?$/i, '');
  const users = new Set<string>();
  const grep = async (args: string[]) => {
    const out = await runner('git', ['-C', repoDir, 'grep', '-l', '-I', ...args], 20_000);
    for (const line of out.stdout.split('\n')) if (line.trim()) users.add(line.trim());
  };
  // Importación por ruta: …/<archivo> (con o sin extensión). Los `index.ts` se importan por su carpeta.
  const target = stem === 'index' ? (path.split('/').slice(-2, -1)[0] ?? stem) : stem;
  await grep(['-E', `(from|require\\()\\s*['"][^'"]*/${escapeForRegex(target)}(\\.[cm]?[jt]s)?['"]`, '--', '*.ts', '*.tsx', '*.js', '*.mjs']);
  // Componentes de Angular: el selector se usa en las plantillas.
  const absolute = join(repoDir, path);
  if (/\.component\.ts$/i.test(path) && existsSync(absolute)) {
    const selector = /selector:\s*['"]([^'"]+)['"]/.exec(readFileSync(absolute, 'utf8'))?.[1];
    if (selector && /^[\w-]+$/.test(selector)) await grep(['-F', `<${selector}`, '--', '*.html', '*.ts']);
  }
  users.delete(path);
  for (const user of [...users]) if (isTestFile(user)) users.delete(user);
  return users.size;
};

// ── Puntos que deja una revisión de Claude ───────────────────────────────────

/** `cambiosCriticos` de ticket.json: `{ repo?, path, linea?, lineas?, motivo, severidad?, categoria? }`. */
export const reviewPoints = (meta: Pick<TicketMeta, 'cambiosCriticos'> | null): CriticalPoint[] =>
  (meta?.cambiosCriticos ?? []).flatMap((entry) => {
    if (!entry.path || !entry.motivo) return [];
    const range = typeof entry.lineas === 'string' ? /^(\d+)\s*[-–]\s*(\d+)$/.exec(entry.lineas.trim()) : null;
    const line = range ? Number(range[1]) : (entry.linea ?? (typeof entry.lineas === 'number' ? entry.lineas : null));
    const category = (Object.keys(CATEGORY_LABELS) as CriticalCategory[]).includes(entry.categoria as CriticalCategory) ? (entry.categoria as CriticalCategory) : 'revision';
    return [{ repo: entry.repo ?? '', scope: 'committed' as const, path: entry.path, line: Number.isInteger(line) ? (line as number) : null, endLine: range ? Number(range[2]) : null, ruleId: 'revision', category, severity: entry.severidad === 'alta' ? ('alta' as const) : ('critica' as const), reason: entry.motivo, source: 'revision' as const }];
  });

// ── Orquestación ─────────────────────────────────────────────────────────────

export interface CriticalReport {
  enabled: boolean;
  generatedAt: string;
  threshold: number;
  points: CriticalPoint[];
  analyzed: number;
  /** Archivos que no se pudieron analizar (binarios, diff enorme, error de lectura). */
  skipped: number;
}

const MAX_FILES = 250;
const CONCURRENCY = 6;
const fileCache = new Map<string, CriticalPoint[]>();
export const clearCriticalCache = (): void => fileCache.clear();

interface Target {
  repo: string;
  scope: 'committed' | 'working';
  file: ChangedFile;
  /** Para pedir el diff: en los MRs el repo es una etiqueta «repo !iid». */
  diffRepo: string;
}

const poolRun = async <T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> => {
  const queue = [...items];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item); }));
};

const analyze = async (config: DevPanelConfig, targets: Target[], readDiff: (target: Target) => Promise<string | null>, runner: Runner): Promise<{ points: CriticalPoint[]; analyzed: number; skipped: number }> => {
  const rules = activeRules(config);
  const threshold = config.changes.critical.fanOutThreshold;
  const points: CriticalPoint[] = [];
  const fanOut = { count: 0 };
  let analyzed = 0;
  let skipped = 0;
  const limited = targets.filter((target) => !target.file.binary && target.file.status !== 'D').slice(0, MAX_FILES);
  skipped += targets.length - limited.length;
  await poolRun(limited, async (target) => {
    const key = `${target.repo}|${target.scope}|${target.file.path}|${target.file.signature}|${threshold}|${rules.length}`;
    let found = target.file.signature ? fileCache.get(key) : undefined;
    if (!found) {
      const diff = await readDiff(target).catch(() => null);
      if (diff === null) skipped++;
      // Las reglas usan el nombre del repo; el punto lleva la etiqueta que usa la pantalla (en los MRs, «front !183»).
      found = evaluateFile(rules, repoName(target.repo), target.scope, target.file.path, diff).map((point) => ({ ...point, repo: target.repo }));
      const repoDir = join(config.paths.projects, repoName(target.repo));
      if (diff !== null && existsSync(join(repoDir, '.git')) && fanOut.count < MAX_FANOUT_FILES) {
        fanOut.count++;
        const users = await countUsers(repoDir, target.file.path, runner).catch(() => 0);
        if (users >= threshold) found.push({ repo: target.repo, scope: target.scope, path: target.file.path, line: null, ruleId: 'compartido-usos', category: 'compartido', severity: 'alta', reason: `Lo usan ${users} archivos: un cambio acá se nota en muchos lugares a la vez.`, source: 'compartido' });
      }
      if (target.file.signature && diff !== null) fileCache.set(key, found);
    }
    analyzed++;
    points.push(...found);
  });
  return { points, analyzed, skipped };
};

/** En los MRs el repo viene como «front !183»; para git y las reglas hace falta solo el nombre. */
const repoName = (repo: string): string => repo.split(' ')[0] ?? repo;

const finish = (config: DevPanelConfig, meta: TicketMeta | null, result: { points: CriticalPoint[]; analyzed: number; skipped: number }): CriticalReport => {
  const fromReview = reviewPoints(meta);
  const points = dedupe([...result.points, ...fromReview]).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critica' ? -1 : 1));
  return { enabled: true, generatedAt: new Date().toISOString(), threshold: config.changes.critical.fanOutThreshold, points, analyzed: result.analyzed, skipped: result.skipped };
};

const disabled = (config: DevPanelConfig): CriticalReport => ({ enabled: false, generatedAt: new Date().toISOString(), threshold: config.changes.critical.fanOutThreshold, points: [], analyzed: 0, skipped: 0 });

/** Puntos críticos de los cambios locales de los repos del ticket. */
export const readLocalCritical = async (config: DevPanelConfig, meta: TicketMeta | null, viewed: ViewedMap = {}, runner: Runner = run): Promise<CriticalReport> => {
  if (!config.changes.critical.enabled) return disabled(config);
  const repos = await readTicketChanges(config, meta?.repos ?? [], runner, viewed);
  const targets: Target[] = repos.flatMap((repo) => [...repo.committed.map((file) => ({ repo: repo.repo, scope: 'committed' as const, file, diffRepo: repo.repo })), ...repo.working.map((file) => ({ repo: repo.repo, scope: 'working' as const, file, diffRepo: repo.repo }))]);
  const result = await analyze(config, targets, async (target) => {
    if (!isSafeRelativePath(target.file.path)) return null;
    const outcome = await readFileDiff(config, target.diffRepo, target.file.path, target.scope, runner);
    return outcome.ok && !outcome.value.reason ? outcome.value.diff : null;
  }, runner);
  return finish(config, meta, result);
};

/** Puntos críticos de los MRs de GitLab del ticket. */
export const readMrCritical = async (config: DevPanelConfig, meta: TicketMeta | null, viewed: ViewedMap = {}, runner: Runner = run, deps: NonNullable<Parameters<typeof readMrChanges>[4]> = {}): Promise<CriticalReport> => {
  if (!config.changes.critical.enabled) return disabled(config);
  const report = await readMrChanges(config, meta, viewed, false, deps);
  const targets: Target[] = report.repos.flatMap((repo) => repo.committed.map((file) => ({ repo: repo.repo, scope: 'committed' as const, file, diffRepo: repo.repo })));
  const result = await analyze(config, targets, async (target) => {
    const outcome = await readMrFileDiff(config, meta, target.diffRepo, target.file.path, deps);
    return outcome.ok && !outcome.value.reason ? outcome.value.diff : null;
  }, runner);
  return finish(config, meta, result);
};

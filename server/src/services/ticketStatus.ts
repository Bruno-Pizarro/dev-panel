import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoStatus } from './gitRepos.js';
import type { TicketMeta } from './tickets.js';

export type Level = 'ok' | 'warn' | 'error' | 'idle';

// ---------------------------------------------------------------- última corrida de pruebas
export interface RunSegment {
  label: string | null;
  passed: number;
  total: number;
}

/** "API 25/25 · pantalla A 25/26 · B 31/31" → un tramo por cada "n/m"; lo que no tiene ese formato se ignora. */
export const parseRunResult = (text: string | undefined): RunSegment[] =>
  (text ?? '')
    .split(/[·;|,]/)
    .flatMap((part) => {
      const match = /^(.*?)\s*(\d+)\s*\/\s*(\d+)\s*(.*)$/.exec(part.trim());
      if (!match) return [];
      const label = `${match[1] ?? ''} ${match[4] ?? ''}`.replace(/\s+/g, ' ').trim();
      return [{ label: label || null, passed: Number(match[2]), total: Number(match[3]) }];
    });

export interface LastRun {
  fecha: string | null;
  resultado: string | null;
  resumen: string | null;
  archivo: string | null;
  segments: RunSegment[];
  passed: number;
  total: number;
  /** Todos los tramos pasaron (falso si no hay tramos). */
  allPassed: boolean;
}

export const lastRunOf = (meta: TicketMeta | null): LastRun | null => {
  const runs = meta?.pruebas ?? [];
  const run = runs.at(-1);
  if (!run) return null;
  const segments = parseRunResult(run.resultado);
  const passed = segments.reduce((sum, segment) => sum + segment.passed, 0);
  const total = segments.reduce((sum, segment) => sum + segment.total, 0);
  return {
    fecha: run.fecha ?? null,
    resultado: run.resultado ?? null,
    resumen: run.resumen ?? null,
    archivo: run.archivo ?? null,
    segments,
    passed,
    total,
    allPassed: segments.length > 0 && segments.every((segment) => segment.passed >= segment.total),
  };
};

/** Repos con commits propios posteriores al día de la última corrida (el ticket.json solo guarda la fecha, no la hora). */
export const reposChangedSince = (fecha: string | null, repos: RepoStatus[]): string[] =>
  fecha ? repos.filter((repo) => repo.lastCommitAt !== null && repo.lastCommitAt.slice(0, 10) > fecha).map((repo) => repo.repo) : [];

// ---------------------------------------------------------------- git
export interface RepoWarning {
  level: Level;
  text: string;
}

/** Qué conviene mirar de un repo antes de dar el ticket por cerrado: rama, cambios, rebase y push. */
export const repoWarnings = (status: RepoStatus, ticketBranch: string | undefined): RepoWarning[] => {
  if (!status.exists) return [{ level: 'error', text: 'El repo no existe en esta máquina' }];
  const warnings: RepoWarning[] = [];
  if (ticketBranch && status.branch !== ticketBranch) warnings.push({ level: 'warn', text: `Está en ${status.branch ?? '?'}, el ticket usa ${ticketBranch}` });
  if (status.dirty.length) warnings.push({ level: 'warn', text: `${status.dirty.length} archivo${status.dirty.length === 1 ? '' : 's'} sin commitear` });
  if (status.base && status.base.behind > 0) warnings.push({ level: 'warn', text: `Atrás de ${status.base.name} por ${status.base.behind} commit${status.base.behind === 1 ? '' : 's'}: falta rebase` });
  const hasOwnWork = (status.base?.ahead ?? 0) > 0;
  if (!status.upstream) {
    if (hasOwnWork) warnings.push({ level: 'warn', text: 'La rama no está publicada (sin upstream)' });
  } else if (status.upstream.ahead > 0 && status.upstream.behind > 0) {
    warnings.push({ level: 'warn', text: `Divergió del remoto (${status.upstream.ahead} propios, ${status.upstream.behind} ajenos): suele pasar tras un rebase y pide push forzado` });
  } else if (status.upstream.ahead > 0) {
    warnings.push({ level: 'warn', text: `${status.upstream.ahead} commit${status.upstream.ahead === 1 ? '' : 's'} sin push` });
  } else if (status.upstream.behind > 0) {
    warnings.push({ level: 'warn', text: `El remoto tiene ${status.upstream.behind} commit${status.upstream.behind === 1 ? '' : 's'} que no tenés` });
  }
  return warnings;
};

// ---------------------------------------------------------------- claves i18n
export interface I18nCheck {
  file: string;
  total: number;
  /** Claves del archivo del ticket que no están en el JSON del front, por idioma. */
  missing: Record<'es' | 'en', string[]>;
}

export const flattenKeys = (value: unknown, prefix = ''): string[] =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
    : prefix
      ? [prefix]
      : [];

/** Los bloques ```json del MD de claves, uno por idioma: la sección cuyo título menciona es.json o en.json. */
export const extractI18nBlocks = (markdown: string): Partial<Record<'es' | 'en', Record<string, unknown>>> => {
  const blocks: Partial<Record<'es' | 'en', Record<string, unknown>>> = {};
  for (const section of markdown.split(/^## /m).slice(1)) {
    const heading = section.split('\n', 1)[0] ?? '';
    const lang = /\bes\.json\b/.test(heading) ? 'es' : /\ben\.json\b/.test(heading) ? 'en' : null;
    const code = /```json\n([\s\S]*?)```/.exec(section)?.[1];
    if (!lang || !code || blocks[lang]) continue;
    try {
      blocks[lang] = JSON.parse(`{${code}}`) as Record<string, unknown>;
    } catch {
      /* un bloque que no parsea se reporta como "sin claves" */
    }
  }
  return blocks;
};

const hasPath = (root: unknown, path: string): boolean => {
  let node: unknown = root;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in (node as Record<string, unknown>))) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return true;
};

/** Compara las claves que el ticket dejó listas para pegar con los JSON reales del front. `null` = el ticket no tiene archivo de claves. */
export const readI18nCheck = (ticketDir: string, projectsDir: string): I18nCheck | null => {
  if (!existsSync(ticketDir)) return null;
  const file = readdirSync(ticketDir).find((name) => /I18N_KEYS.*\.md$/i.test(name));
  if (!file) return null;
  const blocks = extractI18nBlocks(readFileSync(join(ticketDir, file), 'utf8'));
  const missing: I18nCheck['missing'] = { es: [], en: [] };
  let total = 0;
  for (const lang of ['es', 'en'] as const) {
    const keys = flattenKeys(blocks[lang]);
    total = Math.max(total, keys.length);
    const jsonFile = join(projectsDir, 'front', 'src', 'assets', 'i18n', `${lang}.json`);
    let dictionary: unknown = {};
    try {
      dictionary = JSON.parse(readFileSync(jsonFile, 'utf8'));
    } catch {
      missing[lang] = keys.length ? keys : ['(no se pudo leer el diccionario)'];
      continue;
    }
    missing[lang] = keys.filter((key) => !hasPath(dictionary, key));
  }
  return { file, total, missing };
};

// ---------------------------------------------------------------- checklist de cierre
export interface ShipItem {
  id: string;
  label: string;
  level: Level;
  detail: string;
}

export interface ShipInput {
  meta: TicketMeta | null;
  docs: string[];
  repos: RepoStatus[];
  manual: { done: number; total: number };
  i18n: I18nCheck | null;
}

const list = (items: string[], max = 4): string => (items.length > max ? `${items.slice(0, max).join(', ')} y ${items.length - max} más` : items.join(', '));

/** Semáforo de "¿se puede abrir el MR?": todo sale de lo que el panel ya sabe (ticket.json, git, pruebas manuales, claves i18n). */
export const buildShipChecklist = ({ meta, docs, repos, manual, i18n }: ShipInput): ShipItem[] => {
  const items: ShipItem[] = [];
  const run = lastRunOf(meta);

  if (!run) items.push({ id: 'tests', label: 'Pruebas automáticas', level: 'error', detail: 'No hay tandas registradas en ticket.json' });
  else if (!run.segments.length) items.push({ id: 'tests', label: 'Pruebas automáticas', level: 'warn', detail: `Última tanda ${run.fecha ?? ''} sin resultado numérico (formato "25/25")` });
  else if (run.allPassed) items.push({ id: 'tests', label: 'Pruebas automáticas', level: 'ok', detail: `${run.passed}/${run.total} en la última tanda (${run.fecha ?? 's/f'})` });
  else items.push({ id: 'tests', label: 'Pruebas automáticas', level: 'warn', detail: `Con fallos: ${run.segments.filter((segment) => segment.passed < segment.total).map((segment) => `${segment.label ?? 'tramo'} ${segment.passed}/${segment.total}`).join(', ')}` });

  const changed = run ? reposChangedSince(run.fecha, repos) : [];
  items.push(
    !run ? { id: 'fresh', label: 'Pruebas posteriores al último cambio', level: 'idle', detail: 'Sin tandas' }
    : !run.fecha ? { id: 'fresh', label: 'Pruebas posteriores al último cambio', level: 'idle', detail: 'La última tanda no tiene fecha' }
    : changed.length ? { id: 'fresh', label: 'Pruebas posteriores al último cambio', level: 'warn', detail: `Hay commits posteriores al ${run.fecha} en ${list(changed)}: conviene repetir` }
    : { id: 'fresh', label: 'Pruebas posteriores al último cambio', level: 'ok', detail: 'Sin commits posteriores a la última tanda' },
  );

  items.push(
    manual.total === 0 ? { id: 'manual', label: 'Pruebas manuales', level: 'idle', detail: 'El ticket no define casos' }
    : manual.done === manual.total ? { id: 'manual', label: 'Pruebas manuales', level: 'ok', detail: `${manual.done}/${manual.total} casos probados` }
    : { id: 'manual', label: 'Pruebas manuales', level: 'warn', detail: `${manual.done}/${manual.total} casos probados` },
  );

  const review = meta?.codeReview?.at(-1);
  items.push(
    !review ? { id: 'review', label: 'Code review', level: 'error', detail: 'Sin revisiones registradas' }
    : /aprob/i.test(review.veredicto ?? '') ? { id: 'review', label: 'Code review', level: 'ok', detail: `Aprobado (${review.fecha ?? 's/f'})` }
    : { id: 'review', label: 'Code review', level: 'warn', detail: `${review.veredicto ?? 'sin veredicto'}${review.hallazgos !== undefined ? ` · ${review.hallazgos} hallazgos` : ''} (${review.fecha ?? 's/f'}): confirmá que los arreglos están hechos` },
  );

  items.push(docs.some((doc) => /EJECUCION/i.test(doc)) ? { id: 'report', label: 'Informe de ejecución', level: 'ok', detail: docs.find((doc) => /EJECUCION/i.test(doc)) ?? '' } : { id: 'report', label: 'Informe de ejecución', level: 'warn', detail: 'No hay un *_EJECUCION_*.md en la carpeta' });

  if (!i18n) items.push({ id: 'i18n', label: 'Claves i18n pegadas', level: 'idle', detail: 'El ticket no tiene archivo de claves' });
  else {
    const missing = [...new Set([...i18n.missing.es.map((key) => `es:${key}`), ...i18n.missing.en.map((key) => `en:${key}`)])];
    items.push(missing.length ? { id: 'i18n', label: 'Claves i18n pegadas', level: 'error', detail: `Faltan ${missing.length} en el front: ${list(missing, 3)}` } : { id: 'i18n', label: 'Claves i18n pegadas', level: 'ok', detail: `${i18n.total} claves presentes en es.json y en.json` });
  }

  const ticketBranch = meta?.rama;
  const dirty = repos.filter((repo) => repo.exists && repo.dirty.length);
  const behind = repos.filter((repo) => repo.exists && (repo.base?.behind ?? 0) > 0);
  const unpublished = repos.filter((repo) => repo.exists && (repo.base?.ahead ?? 0) > 0 && (!repo.upstream || repo.upstream.ahead > 0 || repo.upstream.behind > 0));
  const missingRepos = repos.filter((repo) => !repo.exists).map((repo) => repo.repo);
  if (!repos.length) {
    items.push({ id: 'clean', label: 'Árbol de trabajo limpio', level: 'idle', detail: 'El ticket no declara repos' });
  } else {
    items.push(missingRepos.length ? { id: 'clean', label: 'Árbol de trabajo limpio', level: 'error', detail: `No existen: ${list(missingRepos)}` } : dirty.length ? { id: 'clean', label: 'Árbol de trabajo limpio', level: 'warn', detail: `Cambios sin commitear en ${list(dirty.map((repo) => repo.repo))}` } : { id: 'clean', label: 'Árbol de trabajo limpio', level: 'ok', detail: `${repos.length} repos sin cambios pendientes` });
    items.push(behind.length ? { id: 'rebase', label: 'Al día con la rama base', level: 'warn', detail: `Falta rebase en ${list(behind.map((repo) => `${repo.repo} (-${repo.base?.behind})`))}` } : { id: 'rebase', label: 'Al día con la rama base', level: 'ok', detail: 'Ningún repo atrás de la base' });
    items.push(unpublished.length ? { id: 'pushed', label: 'Ramas publicadas', level: 'warn', detail: `Sin publicar o desfasadas: ${list(unpublished.map((repo) => repo.repo))}` } : { id: 'pushed', label: 'Ramas publicadas', level: 'ok', detail: 'El remoto está al día con lo local' });
    const wrongBranch = ticketBranch ? repos.filter((repo) => repo.exists && repo.branch !== ticketBranch).map((repo) => `${repo.repo} (${repo.branch ?? '?'})`) : [];
    items.push(wrongBranch.length ? { id: 'branch', label: 'En la rama del ticket', level: 'warn', detail: `Fuera de ${ticketBranch}: ${list(wrongBranch)}` } : { id: 'branch', label: 'En la rama del ticket', level: ticketBranch ? 'ok' : 'idle', detail: ticketBranch ? ticketBranch : 'ticket.json no declara la rama' });
  }

  const withWork = repos.filter((repo) => repo.exists && (repo.base?.ahead ?? 0) > 0).map((repo) => repo.repo);
  const withMr = new Set((meta?.mrs ?? []).map((mr) => mr.repo).filter(Boolean));
  const withoutMr = withWork.filter((repo) => !withMr.has(repo));
  items.push(
    !withWork.length ? { id: 'mrs', label: 'Merge requests creados', level: 'idle', detail: 'Ningún repo tiene commits propios' }
    : withoutMr.length ? { id: 'mrs', label: 'Merge requests creados', level: 'warn', detail: `Falta el MR de ${list(withoutMr)}` }
    : { id: 'mrs', label: 'Merge requests creados', level: 'ok', detail: `${withWork.length} MR${withWork.length === 1 ? '' : 's'} registrados` },
  );
  return items;
};

export const summarizeShip = (items: ShipItem[]): { ready: boolean; ok: number; warn: number; error: number } => ({
  ready: !items.some((item) => item.level === 'warn' || item.level === 'error'),
  ok: items.filter((item) => item.level === 'ok').length,
  warn: items.filter((item) => item.level === 'warn').length,
  error: items.filter((item) => item.level === 'error').length,
});

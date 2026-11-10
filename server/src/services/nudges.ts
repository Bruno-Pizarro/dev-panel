import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { run, type Runner } from '../docker.js';
import { localDay } from './checklists.js';
import { listContainers } from './containers.js';
import { holidaysOf, type Holiday } from './holidays.js';
import { listTestData } from './testData.js';
import { listTickets, ignoredDirs } from './tickets.js';

/**
 * Avisos espontáneos (la tarjeta discreta de abajo a la derecha): cosas que el panel puede saber SIN consultar Redmine ni GitLab
 * (git, Docker, Mongo local, archivos y el checklist del día) y que conviene no olvidarse. Acá solo se calculan los CANDIDATOS: cuándo
 * mostrarlos (frecuencia, No molestar, no repetir) lo decide el navegador. El `id` identifica la condición: cambia cuando la
 * condición cambia, así un aviso no se repite mientras siga siendo el mismo.
 */
export type NudgeKind = 'git-dirty' | 'git-unpushed' | 'git-wrong-branch' | 'service-down' | 'test-data' | 'workday' | 'daily-unsaved' | 'holiday';

export interface Nudge {
  id: string;
  kind: NudgeKind;
  title: string;
  detail: string;
  /** Mayor = más importante (se muestra antes). */
  priority: number;
  /** Pantalla del panel a la que lleva, si hay una. */
  link: string | null;
}

export const NUDGE_KINDS: NudgeKind[] = ['git-dirty', 'git-unpushed', 'git-wrong-branch', 'service-down', 'test-data', 'workday', 'daily-unsaved', 'holiday'];

const MS_HOUR = 3_600_000;
/** Cuánto sin commitear (desde el último commit del repo) antes de avisar. */
const DIRTY_AFTER_HOURS = 3;
/** Cuántos minutos antes de la salida se avisa de lo que falta publicar. */
const END_OF_DAY_MINUTES = 60;
/** Horario de salida que se usa si no hay uno configurado. */
const DEFAULT_EXIT = '18:00';

const minutesOf = (time: string | undefined, fallback: string | null = null): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time || fallback || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const clock = (date: Date) => date.getHours() * 60 + date.getMinutes();
const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** ¿Hoy se trabaja? No: sábado, domingo ni los feriados que no se trabajan. */
export const isWorkday = (date: Date, offDays: string[]): boolean => date.getDay() !== 0 && date.getDay() !== 6 && !offDays.includes(iso(date));

/** El próximo día hábil después de `date`, con su nombre ("mañana", "el lunes"…). */
export const nextWorkdayName = (date: Date, offDays: string[]): string => {
  for (let ahead = 1; ahead <= 14; ahead += 1) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() + ahead);
    if (isWorkday(day, offDays)) return ahead === 1 ? 'mañana' : `el ${WEEKDAYS[day.getDay()]}`;
  }
  return 'mañana';
};

// ------------------------------------------------------------------ git
export interface RepoState {
  repo: string;
  branch: string;
  /** Archivos con cambios sin commitear. */
  dirty: number;
  /** Commits locales que no están en el remoto (0 si no hay rama remota). */
  ahead: number;
  /** Fecha del último commit del repo (cualquiera), o null si no hay. */
  lastCommitAt: Date | null;
}

export interface GitRules {
  now: Date;
  exit: string;
  protectedBranches: string[];
  /** Falso en fin de semana y feriados: no se avisa nada de la jornada. */
  workday: boolean;
}

export const gitNudges = (repos: RepoState[], rules: GitRules): Nudge[] => {
  const out: Nudge[] = [];
  const exit = minutesOf(rules.exit, DEFAULT_EXIT) ?? 18 * 60;
  const endOfDay = clock(rules.now) >= exit - END_OF_DAY_MINUTES;
  for (const repo of repos) {
    // Cambios sin commitear sobre una rama de las que no se trabaja directo (desarrollo, main…): lo más fácil de pisar.
    if (repo.dirty > 0 && rules.protectedBranches.includes(repo.branch)) {
      out.push({ id: `wrong-branch:${repo.repo}:${repo.branch}`, kind: 'git-wrong-branch', priority: 90, link: '/entorno', title: `Cambios sin commitear en ${repo.branch}`, detail: `${repo.repo} está en ${repo.branch} con ${repo.dirty} ${repo.dirty === 1 ? 'archivo modificado' : 'archivos modificados'}. ¿No era una rama de ticket?` });
      continue;
    }
    if (!rules.workday) continue;
    if (repo.ahead > 0 && endOfDay) {
      out.push({ id: `unpushed:${repo.repo}:${repo.branch}:${repo.ahead}`, kind: 'git-unpushed', priority: 70, link: '/entorno', title: 'Commits sin pushear', detail: `${repo.repo} (${repo.branch}) tiene ${repo.ahead} ${repo.ahead === 1 ? 'commit' : 'commits'} que no están en el remoto, y se acerca la salida.` });
    }
    if (repo.dirty > 0 && (repo.lastCommitAt === null || rules.now.getTime() - repo.lastCommitAt.getTime() > DIRTY_AFTER_HOURS * MS_HOUR)) {
      const hours = repo.lastCommitAt ? Math.floor((rules.now.getTime() - repo.lastCommitAt.getTime()) / MS_HOUR) : null;
      out.push({ id: `dirty:${repo.repo}:${repo.branch}:${repo.dirty}`, kind: 'git-dirty', priority: 50, link: '/entorno', title: 'Cambios sin commitear', detail: `${repo.repo} (${repo.branch}) tiene ${repo.dirty} ${repo.dirty === 1 ? 'archivo' : 'archivos'} sin commitear${hours !== null ? ` y su último commit es de hace ${hours} h` : ''}.` });
    }
  }
  return out;
};

// ------------------------------------------------------------------ servicios
/** Un corte parcial: hay servicios obligatorios corriendo y otros no, o contenedores con el healthcheck en rojo. Con todo apagado no se avisa (todavía no se levantó nada). */
export const serviceNudges = (required: string[], containers: Array<{ name: string; service: string | null; state: string; status: string }>): Nudge[] => {
  const running = (service: string) => containers.some((container) => container.service === service && container.state === 'running');
  const down = required.filter((service) => !running(service));
  const unhealthy = containers.filter((container) => container.status.includes('unhealthy')).map((container) => container.name);
  const out: Nudge[] = [];
  if (down.length > 0 && down.length < required.length) {
    out.push({ id: `service-down:${down.join(',')}`, kind: 'service-down', priority: 80, link: '/servicios', title: 'Servicios obligatorios caídos', detail: `No están corriendo: ${down.join(', ')}.` });
  } else if (unhealthy.length > 0) {
    out.push({ id: `service-unhealthy:${unhealthy.join(',')}`, kind: 'service-down', priority: 75, link: '/servicios', title: 'Contenedores con el healthcheck en rojo', detail: unhealthy.join(', ') });
  }
  return out;
};

// ------------------------------------------------------------------ datos de prueba
/** Tickets ya aprobados o entregados que dejaron datos de prueba `[ticket]` en el Mongo local. */
export const testDataNudges = (leftovers: Array<{ ticket: string; count: number }>): Nudge[] =>
  leftovers.filter((item) => item.count > 0).map((item) => ({ id: `test-data:${item.ticket}:${item.count}`, kind: 'test-data' as const, priority: 40, link: '/datos', title: `Datos de prueba sin limpiar (#${item.ticket})`, detail: `El ticket ya está aprobado y quedan ${item.count} documentos marcados [${item.ticket}] en el Mongo local.` }));

// ------------------------------------------------------------------ jornada
export interface WorkdayRules {
  now: Date;
  entry: string;
  exit: string;
  workday: boolean;
  /** Pasos del checklist diario por id → hecho. */
  done: Record<string, boolean>;
  dailySaved: boolean;
}

/** Lo que falta de la rutina del día, a su hora (entrada, salida, horas y notas) y el daily sin guardar. Nada en fin de semana ni feriados. */
export const workdayNudges = (rules: WorkdayRules): Nudge[] => {
  if (!rules.workday) return [];
  const day = iso(rules.now);
  const now = clock(rules.now);
  const entry = minutesOf(rules.entry);
  const exit = minutesOf(rules.exit);
  const out: Nudge[] = [];
  if (entry !== null && now >= entry + 15 && now < entry + 4 * 60 && rules.done['marcar-entrada'] === false) {
    out.push({ id: `workday:marcar-entrada:${day}`, kind: 'workday', priority: 60, link: '/', title: 'Marcar la entrada', detail: `Ya pasó tu horario de entrada (${rules.entry}) y «Marcar entrada» sigue sin tildar.` });
  }
  if (exit !== null && now >= exit) {
    if (rules.done['marcar-salida'] === false) out.push({ id: `workday:marcar-salida:${day}`, kind: 'workday', priority: 60, link: '/', title: 'Marcar la salida', detail: `Ya pasó tu horario de salida (${rules.exit}).` });
    const missing = [['cargar-horas', 'las horas'], ['cargar-notas', 'las notas']].filter(([id]) => rules.done[id!] === false).map(([, label]) => label);
    if (missing.length) out.push({ id: `workday:cargar:${missing.length}:${day}`, kind: 'workday', priority: 55, link: '/', title: `Falta cargar ${missing.join(' y ')}`, detail: 'Antes de cerrar el día.' });
  }
  if (exit !== null && now >= exit - END_OF_DAY_MINUTES && !rules.dailySaved) {
    out.push({ id: `daily-unsaved:${day}`, kind: 'daily-unsaved', priority: 35, link: '/daily', title: 'El daily de hoy no está guardado', detail: 'Se acerca la salida: en Daily podés armar el borrador y guardarlo.' });
  }
  return out;
};

// ------------------------------------------------------------------ feriados
/** Un feriado que cae en el próximo día de semana (mañana, o el lunes si hoy es viernes). Dice cuándo se vuelve a trabajar. */
export const holidayNudges = (now: Date, holidays: Holiday[], offDays: string[]): Nudge[] => {
  if (!isWorkday(now, offDays)) return [];
  for (let ahead = 1; ahead <= 3; ahead += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const holiday = holidays.find((item) => item.date === iso(day) && offDays.includes(item.date));
    if (!holiday) return [];
    const comes = nextWorkdayName(now, offDays);
    return [{ id: `holiday:${holiday.date}`, kind: 'holiday', priority: 30, link: null, title: `Feriado ${ahead === 1 ? 'mañana' : `el ${WEEKDAYS[day.getDay()]}`}: ${holiday.name}`, detail: `Volvés ${comes}: dejá ordenado lo que quede para entonces.` }];
  }
  return [];
};

// ------------------------------------------------------------------ recolección
export interface NudgeDeps {
  runner?: Runner;
  now?: Date;
  repoStates?: () => Promise<RepoState[]>;
  containers?: typeof listContainers;
  leftovers?: () => Promise<Array<{ ticket: string; count: number }>>;
  holidays?: (year: number) => Promise<Holiday[]>;
  checklist?: () => Record<string, boolean>;
  dailySaved?: () => boolean;
}

const gitOut = async (runner: Runner, repo: string, args: string[]): Promise<string | null> => {
  const result = await runner('git', ['-C', repo, ...args], 15_000);
  return result.ok ? result.stdout.trim() : null;
};

/** Estado git de los repos configurados que existen en esta máquina. */
export const readRepoStates = async (config: DevPanelConfig, runner: Runner = run): Promise<RepoState[]> => {
  const states: RepoState[] = [];
  for (const repo of config.repos) {
    const cwd = join(config.paths.projects, repo);
    if (!existsSync(join(cwd, '.git'))) continue;
    const branch = await gitOut(runner, cwd, ['branch', '--show-current']);
    if (!branch) continue;
    const status = await gitOut(runner, cwd, ['status', '--porcelain']);
    const ahead = await gitOut(runner, cwd, ['rev-list', '--count', '@{u}..HEAD']);
    const last = await gitOut(runner, cwd, ['log', '-1', '--format=%cI']);
    states.push({ repo, branch, dirty: status ? status.split('\n').filter(Boolean).length : 0, ahead: ahead && /^\d+$/.test(ahead) ? Number(ahead) : 0, lastCommitAt: last && !Number.isNaN(Date.parse(last)) ? new Date(last) : null });
  }
  return states;
};

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Todos los candidatos de este momento, los más importantes primero. Cada fuente que falla se saltea sin tirar abajo a las demás. */
export const collectNudges = async (config: DevPanelConfig, deps: NudgeDeps = {}): Promise<Nudge[]> => {
  const now = deps.now ?? new Date();
  const runner = deps.runner ?? run;
  const out: Nudge[] = [];
  const safe = async <T,>(job: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await job();
    } catch {
      return fallback;
    }
  };

  const years = [...new Set([now.getFullYear(), new Date(now.getTime() + 4 * 86_400_000).getFullYear()])];
  const lists = await safe(() => Promise.all(years.map((year) => (deps.holidays ?? holidaysOf)(year))), [] as Holiday[][]);
  const holidays = lists.flat();
  const offDays = holidays.filter((holiday) => holiday.type === 'inamovible' || holiday.type === 'trasladable').map((holiday) => holiday.date);
  const workday = isWorkday(now, offDays);

  const repoStates = await safe(() => (deps.repoStates ? deps.repoStates() : readRepoStates(config, runner)), [] as RepoState[]);
  out.push(...gitNudges(repoStates, { now, exit: config.workday.exit, protectedBranches: [...new Set([config.git.baseBranch, 'main', 'master', 'produccion'])], workday }));

  const containers = await safe(() => (deps.containers ?? listContainers)(runner), []);
  out.push(...serviceNudges([...config.startup.stage1, ...config.startup.stage2, ...config.startup.mandatory], containers));

  out.push(...testDataNudges(await safe(() => (deps.leftovers ? deps.leftovers() : approvedLeftovers(config, runner)), [])));

  const done = await safe(async () => (deps.checklist ? deps.checklist() : dailyDone(config)), {} as Record<string, boolean>);
  const dailySaved = await safe(async () => (deps.dailySaved ? deps.dailySaved() : existsSync(join(config.paths.daily, `${localDay(now)}.md`))), true);
  out.push(...workdayNudges({ now, entry: config.workday.entry, exit: config.workday.exit, workday, done, dailySaved }));
  out.push(...holidayNudges(now, holidays, offDays));

  return out.sort((a, b) => b.priority - a.priority);
};

const dailyDone = async (config: DevPanelConfig): Promise<Record<string, boolean>> => {
  const { getDailyChecklist } = await import('./checklists.js');
  return Object.fromEntries(getDailyChecklist(config.checklists.daily).items.map((item) => [item.id, item.done]));
};

// Los datos de prueba se cuentan con Mongo (varias consultas por ticket): se guardan 30 min y se miran pocos tickets por vez.
let leftoversCache: { at: number; rows: Array<{ ticket: string; count: number }> } | null = null;
const LEFTOVERS_MS = 30 * 60_000;
const MAX_LEFTOVER_TICKETS = 3;

const approvedLeftovers = async (config: DevPanelConfig, runner: Runner): Promise<Array<{ ticket: string; count: number }>> => {
  if (leftoversCache && Date.now() - leftoversCache.at < LEFTOVERS_MS) return leftoversCache.rows;
  const approved = new Set(config.redmine.approvedStatuses.map(normalize));
  const tickets = listTickets(config.paths.extra, ignoredDirs(config))
    .filter((item) => item.ticket && item.estado && approved.has(normalize(item.estado)))
    .sort((a, b) => b.lastUpdated - a.lastUpdated)
    .slice(0, MAX_LEFTOVER_TICKETS);
  const rows: Array<{ ticket: string; count: number }> = [];
  for (const item of tickets) {
    const counts = await listTestData(config, item.ticket!, runner);
    rows.push({ ticket: item.ticket!, count: counts.reduce((sum, row) => sum + (Number.isFinite(row.count) ? row.count : 0), 0) });
  }
  leftoversCache = { at: Date.now(), rows };
  return rows;
};

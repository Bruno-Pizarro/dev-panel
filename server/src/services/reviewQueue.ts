import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { plainNote, dayOf, findCurrentSprint, type CurrentSprint } from './homeNotices.js';
import { httpProblem, loadCredentials, mapIssue, RedmineError, type Credentials, type JsonFetcher } from './redmine.js';
import { normalizeStatus, statusIn } from './sprintPoints.js';

/**
 * Tickets en Revisión del sprint actual (de cualquier persona, menos los míos) cuyo Control QA todavía no tomó nadie, para empezar
 * a revisarlos. Entran los que no tienen Control QA y los que lo tienen asignado a mí o al usuario Backlog e-sueldos (si está asignado a
 * otra persona, es una revisión de otro). Además, «nadie lo tomó» = el QA no tiene comentarios de usuarios con el rol de revisor (por defecto «Desarrollador») que no
 * sean el autor del propio QA (el autor es quien armó el plan de pruebas). Solo lectura contra Redmine; lo único que se escribe es
 * la carpeta local del ticket (`startReview`).
 */
export interface ReviewComment {
  user: string;
  at: string;
  notes: string;
}

export interface ReviewQa {
  id: number;
  url: string;
  status: string;
  assignedTo: string | null;
  author: string | null;
  description: string;
  comments: ReviewComment[];
  /** Comentarios de revisores (distintos del autor del QA): si hay alguno, alguien ya lo tomó. */
  reviewerComments: number;
}

export interface ReviewMr {
  url: string;
  repo: string | null;
  iid: number;
}

export interface ReviewQueueItem {
  id: number;
  url: string;
  title: string;
  tracker: string;
  status: string;
  assignedTo: string | null;
  storyPoints: number | null;
  description: string;
  comments: ReviewComment[];
  qa: ReviewQa | null;
  mrs: ReviewMr[];
  /** Carpeta del ticket en `_EXTRA` si ya existe. */
  folder: string | null;
}

export interface ReviewSkipped {
  id: number;
  title: string;
  /** Por qué no está en la lista. */
  reason: 'mine' | 'qa-other' | 'taken';
  /** Detalle legible (a quién está asignado el QA, quién comentó…). */
  detail: string;
}

export interface ReviewQueue {
  sprint: { id: number; subject: string; url: string } | null;
  items: ReviewQueueItem[];
  /** Los de Revisión del sprint que se evaluaron y NO entraron, con el motivo (para entender por qué falta uno). */
  skipped: ReviewSkipped[];
  /** Cuántos tickets tiene relacionados el sprint (de cualquiera) y cuántos de ellos están en Revisión: un ticket que no está relacionado al sprint no se puede ver. */
  sprintTickets: number;
  inReview: number;
  /** Rol de Redmine que se toma como «revisor». */
  reviewerRole: string;
  /** `false` si no se pudieron leer los roles del proyecto: no se pudo descartar a nadie y se muestran todos los de Revisión. */
  rolesKnown: boolean;
}

interface RawJournal {
  user?: { id: number; name: string };
  created_on: string;
  notes?: string;
}

interface RawDetail {
  id: number;
  subject?: string;
  description?: string | null;
  project?: { id: number; name: string };
  tracker?: { name: string };
  status?: { name: string };
  author?: { id: number; name: string };
  assigned_to?: { id: number; name: string };
  journals?: RawJournal[];
  children?: Array<{ id: number; tracker?: { name: string } }>;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Los últimos `limit` comentarios con texto, del más viejo al más nuevo, en texto plano. */
export const lastComments = (journals: RawJournal[] | undefined, limit = 5): ReviewComment[] =>
  (journals ?? [])
    .filter((journal) => journal.notes?.trim())
    .slice(-limit)
    .map((journal) => ({ user: journal.user?.name ?? '—', at: journal.created_on, notes: clip(plainNote(journal.notes!), 600) }));

/** Los MRs de GitLab que se mencionan en los textos (enlaces `…/<repo>/-/merge_requests/<n>`), sin repetir. */
export const extractMrs = (texts: string[]): ReviewMr[] => {
  const found = new Map<string, ReviewMr>();
  for (const text of texts) {
    for (const match of text.matchAll(/https?:\/\/[^\s"'<>)\]]+?\/([\w.-]+)\/-\/merge_requests\/(\d+)/g)) {
      const url = match[0].replace(/[.,;:]+$/, '');
      if (!found.has(url)) found.set(url, { url, repo: match[1] ?? null, iid: Number(match[2]) });
    }
  }
  return [...found.values()];
};

/** Cuántos comentarios del QA son de revisores (por id de usuario), sin contar los del autor del propio QA. */
export const reviewerCommentCount = (journals: RawJournal[] | undefined, reviewerIds: ReadonlySet<number>, authorId: number | null): number =>
  (journals ?? []).filter((journal) => journal.notes?.trim() && journal.user && reviewerIds.has(journal.user.id) && journal.user.id !== authorId).length;

/**
 * El Control QA es «para mí» si no tiene a nadie asignado, está asignado a mí, al usuario bolsa (Backlog e-sueldos) o a la MISMA
 * persona que el ticket padre (nadie más lo tomó: lo dejó a su nombre). Cualquier otra persona asignada significa que es una revisión
 * de otro.
 */
export const qaIsForMe = (assignee: { id: number; name: string } | null | undefined, meId: number | null, backlogUser: string, parentAssigneeId: number | null = null): boolean =>
  !assignee || assignee.id === meId || normalizeStatus(assignee.name) === normalizeStatus(backlogUser) || (parentAssigneeId !== null && assignee.id === parentAssigneeId);

/** Sin revisor = ningún comentario de revisor; con los roles sin leer no se puede descartar a nadie. */
export const isUnclaimed = (reviewerComments: number, rolesKnown: boolean): boolean => !rolesKnown || reviewerComments === 0;

export const slugify = (title: string): string =>
  normalizeStatus(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'ticket';

const makeGet = (credentials: Credentials, fetcher: JsonFetcher) => async (path: string): Promise<unknown> => {
  let response;
  try {
    response = await fetcher(`${credentials.baseUrl}${path}`, { headers: { 'X-Redmine-API-Key': credentials.key }, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new RedmineError('No se pudo conectar con Redmine', 502);
  }
  if (!response.ok) throw await httpProblem(response);
  return response.json();
};

// Pocas llamadas a Redmine: la lista se arma al abrir el modal, se guarda 10 minutos y los roles del proyecto 1 hora; solo se vuelve a
// consultar antes con «Actualizar». Cada ticket cuesta 2 llamadas (él y su Control QA), por eso el tope.
const MAX_ITEMS = 20;
const CACHE_MS = 10 * 60_000;
const ROLES_MS = 60 * 60_000;
let cached: { at: number; value: ReviewQueue } | null = null;
let rolesCache: { at: number; projectId: number; ids: number[] } | null = null;

/** Carpeta de `_EXTRA` que ya existe para el ticket (empieza con `<número>-`). */
export const existingFolder = (extra: string, ticket: number): string | null => {
  if (!existsSync(extra)) return null;
  return readdirSync(extra, { withFileTypes: true }).find((entry) => entry.isDirectory() && entry.name.startsWith(`${ticket}-`))?.name ?? null;
};

/** Los tickets de Revisión del sprint actual que nadie está revisando todavía. */
export const fetchReviewQueue = async (config: DevPanelConfig, fetcher: JsonFetcher = fetch as unknown as JsonFetcher, now = new Date(), force = false): Promise<ReviewQueue> => {
  if (!force && cached && now.getTime() - cached.at < CACHE_MS) return { ...cached.value, items: cached.value.items.map((item) => ({ ...item, folder: existingFolder(config.paths.extra, item.id) })) };
  const credentials = loadCredentials(config);
  if (!credentials) throw new RedmineError('Redmine no está configurado: falta la API key (skill redmine-drive o REDMINE_API_KEY)', 503);
  const get = makeGet(credentials, fetcher);
  const reviewerRole = config.redmine.reviewerRole;

  const found: CurrentSprint | null = await findCurrentSprint(get, credentials, fetcher, dayOf(now));
  if (!found) return { sprint: null, items: [], skipped: [], sprintTickets: 0, inReview: 0, reviewerRole, rolesKnown: true };
  const sprint = { id: found.sprint.id, subject: found.sprint.subject, url: `${credentials.baseUrl}/issues/${found.sprint.id}` };

  // Todos los tickets del sprint (de cualquiera) que están en Revisión y no son míos ni de QA
  const me = (await get('/users/current.json')) as { user?: { id: number } };
  const listed = (await get(`/issues.json?issue_id=${found.related.join(',')}&status_id=*&limit=100`)) as { issues?: Parameters<typeof mapIssue>[0][] };
  const inReview = (listed.issues ?? [])
    .map((raw) => ({ raw: raw as unknown as RawDetail, issue: mapIssue(raw, credentials.baseUrl) }))
    .filter(({ issue }) => statusIn(issue.status, config.redmine.reviewStatuses) && issue.tracker !== 'Control QA');
  const sprintTickets = (listed.issues ?? []).length;
  const skipped: ReviewSkipped[] = [];
  // Los míos no se revisan (y no cuestan llamadas); el tope se aplica después, sobre los que sí hay que mirar
  const toCheck = inReview.filter(({ issue, raw }) => {
    if (raw.assigned_to?.id !== me.user?.id) return true;
    skipped.push({ id: issue.id, title: issue.title, reason: 'mine', detail: 'Es un ticket tuyo' });
    return false;
  }).slice(0, MAX_ITEMS);

  // Roles del proyecto: quiénes son «revisores»
  let rolesKnown = true;
  const reviewerIds = new Set<number>();
  const projectId = toCheck[0]?.raw.project?.id;
  if (projectId && rolesCache && rolesCache.projectId === projectId && now.getTime() - rolesCache.at < ROLES_MS) {
    rolesCache.ids.forEach((id) => reviewerIds.add(id));
    rolesKnown = reviewerIds.size > 0;
  } else if (projectId) {
    try {
      const memberships = (await get(`/projects/${projectId}/memberships.json?limit=100`)) as { memberships?: Array<{ user?: { id: number }; roles?: Array<{ name: string }> }> };
      for (const membership of memberships.memberships ?? []) {
        if (membership.user && (membership.roles ?? []).some((role) => normalizeStatus(role.name) === normalizeStatus(reviewerRole))) reviewerIds.add(membership.user.id);
      }
      rolesKnown = reviewerIds.size > 0;
      if (rolesKnown) rolesCache = { at: now.getTime(), projectId, ids: [...reviewerIds] };
    } catch {
      rolesKnown = false;
    }
  }

  const items: ReviewQueueItem[] = [];
  for (const { issue, raw: listedRaw } of toCheck) {
    const detail = (await get(`/issues/${issue.id}.json?include=journals,children`)) as { issue?: RawDetail };
    const raw = detail.issue;
    if (!raw) continue;
    const qaChild = (raw.children ?? []).find((child) => child.tracker?.name === 'Control QA');
    let qa: ReviewQa | null = null;
    let qaRaw: RawDetail | undefined;
    if (qaChild) {
      qaRaw = ((await get(`/issues/${qaChild.id}.json?include=journals`)) as { issue?: RawDetail }).issue;
      if (qaRaw) {
        // Ya asignado a otra persona: es una revisión para ese otro
        if (!qaIsForMe(qaRaw.assigned_to, me.user?.id ?? null, config.redmine.backlogUser, listedRaw.assigned_to?.id ?? null)) {
          skipped.push({ id: issue.id, title: issue.title, reason: 'qa-other', detail: `El QA #${qaRaw.id} está asignado a ${qaRaw.assigned_to?.name ?? '—'}${listedRaw.assigned_to ? `, y el ticket a ${listedRaw.assigned_to.name}` : ''}` });
          continue;
        }
        const reviewerComments = reviewerCommentCount(qaRaw.journals, reviewerIds, qaRaw.author?.id ?? null);
        if (!isUnclaimed(reviewerComments, rolesKnown)) {
          skipped.push({ id: issue.id, title: issue.title, reason: 'taken', detail: `El QA #${qaRaw.id} tiene ${reviewerComments} comentario${reviewerComments === 1 ? '' : 's'} de revisores (alguien ya lo tomó)` });
          continue;
        }
        qa = { id: qaRaw.id, url: `${credentials.baseUrl}/issues/${qaRaw.id}`, status: qaRaw.status?.name ?? '—', assignedTo: qaRaw.assigned_to?.name ?? null, author: qaRaw.author?.name ?? null, description: clip(plainNote(qaRaw.description ?? ''), 3000), comments: lastComments(qaRaw.journals), reviewerComments };
      }
    }
    items.push({
      id: issue.id,
      url: issue.url,
      title: issue.title,
      tracker: issue.tracker,
      status: issue.status,
      assignedTo: issue.assignedTo,
      storyPoints: issue.storyPoints,
      description: clip(plainNote(raw.description ?? ''), 3000),
      comments: lastComments(raw.journals),
      qa,
      mrs: extractMrs([raw.description ?? '', qaRaw?.description ?? '', ...(raw.journals ?? []).map((journal) => journal.notes ?? ''), ...(qaRaw?.journals ?? []).map((journal) => journal.notes ?? '')]),
      folder: existingFolder(config.paths.extra, issue.id),
    });
  }
  const value: ReviewQueue = { sprint, items, skipped, sprintTickets, inReview: inReview.length, reviewerRole, rolesKnown };
  cached = { at: now.getTime(), value };
  return value;
};

/** El pedido para Claude: todo lo que hace falta para arrancar la revisión de ese ticket. */
export const reviewPrompt = (item: ReviewQueueItem, dir: string): string => {
  const mrs = item.mrs.length ? item.mrs.map((mr) => `- ${mr.repo ?? 'repo'} !${mr.iid}: ${mr.url}`).join('\n') : '- No encontré MRs en el ticket ni en el QA: buscalos en los comentarios o preguntame.';
  return [
    `Quiero que empieces la revisión del ticket #${item.id} «${item.title}» (de ${item.assignedTo ?? 'otra persona'}), que está en Revisión en el sprint actual.`,
    '',
    '## Datos',
    `- Ticket: ${item.url}`,
    item.qa ? `- Control QA: ${item.qa.url} (nadie lo tomó todavía${item.qa.assignedTo ? `, asignado a ${item.qa.assignedTo}` : ''}; estado ${item.qa.status})` : '- Control QA: no tiene subtarea de QA todavía.',
    `- Carpeta en la base de conocimiento: _EXTRA/${dir} (ya creada con tipo «revision»; en el Dev Panel aparece en Pruebas como solo revisión)`,
    '- Merge requests:',
    mrs,
    '',
    '## Qué hacer, en orden',
    '1. Leé el ticket y el QA con el MCP del Dev Panel (`redmine_issue`, descripción y últimos comentarios) y `ticket_detail` de la carpeta. Si falta contexto, preguntame antes de seguir.',
    '2. Revisá el código de los MRs con `mr_changes` y `mr_file_diff` (solo lectura). Armá la lista de hallazgos por severidad; no modifiques nada en las ramas.',
    '3. Si hay que probarlo, decime qué servicios levantar y probalo en un navegador solo en Empresa Demo SA, con los usuarios de prueba (nunca en Triunfo ni con datos reales).',
    `4. Registrá el avance en \`_EXTRA/${dir}/ticket.json\` con la skill dev-panel (leyendo antes y mezclando): \`codeReview[]\` y \`pruebas[]\`, con fecha de hoy y sin credenciales.`,
    '5. Dejá el informe en un MD de esa carpeta y comentá los hallazgos en los MRs con `mr_note_add` solo si te lo confirmo.',
    '6. Resumime el veredicto (aprobado / con cambios) y qué dejaría como comentario en el Control QA de Redmine; lo subo yo.',
    '',
    'No mergees ni cierres nada, y no escribas en Redmine.',
  ].join('\n');
};

export interface StartedReview {
  dir: string;
  created: boolean;
  /** Si la carpeta ya existía con otro tipo (desarrollo), no se la cambió a revisión. */
  kind: string;
  prompt: string;
}

/**
 * Prepara la revisión de un ticket de la cola: crea la carpeta mínima en `_EXTRA` (si no existe) con `tipo: "revision"` para que
 * aparezca en Pruebas como solo revisión, y arma el pedido para Claude. Solo agrega: no pisa un `ticket.json` existente (mezcla y deja
 * el `tipo` que ya tenía) ni borra nada.
 */
export const startReview = async (config: DevPanelConfig, ticket: number, fetcher?: JsonFetcher, now = new Date()): Promise<StartedReview> => {
  const queue = await fetchReviewQueue(config, fetcher, now);
  const item = queue.items.find((candidate) => candidate.id === ticket);
  if (!item) throw new RedmineError('Ese ticket ya no está en la cola de revisión (quizá alguien lo tomó): actualizá la lista.', 404);
  const extra = config.paths.extra;
  const existing = existingFolder(extra, ticket);
  const dir = existing ?? `${ticket}-${slugify(item.title)}`;
  const folder = join(extra, dir);
  const file = join(folder, 'ticket.json');
  let meta: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      meta = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch {
      throw new RedmineError('El ticket.json de esa carpeta no es JSON válido: arreglalo antes de empezar la revisión.', 409);
    }
  }
  const created = !existsSync(folder);
  mkdirSync(folder, { recursive: true });
  const merged: Record<string, unknown> = {
    ...meta,
    ticket: String(ticket),
    titulo: (meta['titulo'] as string | undefined) ?? item.title,
    url: (meta['url'] as string | undefined) ?? item.url,
    estado: (meta['estado'] as string | undefined) ?? item.status,
    ...(item.assignedTo && !meta['responsable'] ? { responsable: item.assignedTo } : {}),
    tipo: (meta['tipo'] as string | undefined) ?? 'revision',
    ...(item.mrs.length && !Array.isArray(meta['mrs']) ? { mrs: item.mrs.map((mr) => ({ ...(mr.repo ? { repo: mr.repo } : {}), iid: mr.iid, url: mr.url, estado: 'abierto' })) } : {}),
  };
  writeFileSync(`${file}.tmp`, `${JSON.stringify(merged, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  return { dir, created, kind: String(merged['tipo']), prompt: reviewPrompt(item, dir) };
};

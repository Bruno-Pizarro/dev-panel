import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DevPanelConfig } from '../config.js';
import { GitlabError } from './gitlab.js';
import { dailyToken } from './gitlabDaily.js';
import { claudeEnvFile } from './claudeEnv.js';

/**
 * Escrituras acotadas en GitLab con el token diario de Claude: crear un MR y comentar en uno. A propósito NO hay forma de
 * cerrar, mergear, borrar ramas ni editar MRs de otras personas: eso se hace en GitLab.
 */
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
export const MAX_TITLE = 255;
export const MAX_TEXT = 20_000;

export type JsonFetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface CreateMrInput {
  repo: string;
  source: string;
  target?: string | undefined;
  title: string;
  description?: string | undefined;
}

const projectOf = (config: DevPanelConfig, repo: string): string => {
  if (!REPO.test(repo) || !existsSync(join(config.paths.projects, repo, '.git'))) throw new GitlabError('Ese repo no existe en esta máquina', 400);
  return encodeURIComponent(`${config.gitlab.group}/${repo}`);
};

const call = async (config: DevPanelConfig, path: string, payload: Record<string, unknown>, file: string, fetcher: JsonFetcher): Promise<Record<string, unknown>> => {
  const response = await fetcher(`${config.gitlab.baseUrl.replace(/\/$/, '')}/api/v4${path}`, {
    method: 'POST',
    headers: { 'PRIVATE-TOKEN': dailyToken(file), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => {
    throw new GitlabError('No se pudo conectar con GitLab', 502);
  });
  if (response.status === 401) throw new GitlabError('GitLab rechazó el token (vencido): renovalo en Configuración → Variables de Claude', 401);
  if (response.status === 409) throw new GitlabError('Ya existe un MR abierto de esa rama hacia esa rama', 409);
  if (!response.ok) throw new GitlabError(`GitLab respondió ${response.status}`, response.status >= 500 ? 502 : response.status);
  return (await response.json()) as Record<string, unknown>;
};

export const createMr = async (config: DevPanelConfig, input: CreateMrInput, options: { file?: string; fetcher?: JsonFetcher } = {}): Promise<{ iid: number; url: string }> => {
  const target = input.target ?? config.git.baseBranch;
  const title = input.title.trim();
  if (!BRANCH.test(input.source) || !BRANCH.test(target)) throw new GitlabError('Nombre de rama inválido', 400);
  if (input.source === target) throw new GitlabError('La rama origen y destino son la misma', 400);
  if (!title || title.length > MAX_TITLE) throw new GitlabError(`El título va de 1 a ${MAX_TITLE} caracteres`, 400);
  const description = input.description ?? '';
  if (description.length > MAX_TEXT) throw new GitlabError('La descripción es demasiado larga', 400);
  const body = await call(
    config,
    `/projects/${projectOf(config, input.repo)}/merge_requests`,
    { source_branch: input.source, target_branch: target, title, description, remove_source_branch: false, squash: false },
    options.file ?? claudeEnvFile(),
    options.fetcher ?? (fetch as unknown as JsonFetcher),
  );
  return { iid: Number(body['iid']), url: String(body['web_url'] ?? '') };
};

export const addMrNote = async (config: DevPanelConfig, input: { repo: string; iid: number; body: string }, options: { file?: string; fetcher?: JsonFetcher } = {}): Promise<{ id: number }> => {
  const text = input.body.trim();
  if (!Number.isInteger(input.iid) || input.iid < 1) throw new GitlabError('Número de MR inválido', 400);
  if (!text || text.length > MAX_TEXT) throw new GitlabError('El comentario va de 1 a 20000 caracteres', 400);
  const body = await call(config, `/projects/${projectOf(config, input.repo)}/merge_requests/${input.iid}/notes`, { body: text }, options.file ?? claudeEnvFile(), options.fetcher ?? (fetch as unknown as JsonFetcher));
  return { id: Number(body['id']) };
};


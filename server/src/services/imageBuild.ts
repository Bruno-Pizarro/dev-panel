import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { run, type Runner } from '../docker.js';

/** Archivos del contexto de build que, si cambian después de construir la imagen, la dejan desactualizada. */
export const WATCHED_FILES = ['package.json', 'yarn.lock', 'package-lock.json', 'Dockerfile'];

export interface BuildStatus {
  service: string;
  stale: boolean;
  /** Archivos modificados después de construir la imagen. */
  files: string[];
  /** Cuándo se construyó la imagen (ISO). */
  imageCreatedAt: string | null;
}

export type FileTimes = Array<{ name: string; mtimeMs: number }>;

/** Una imagen está desactualizada si algún archivo vigilado es posterior a su construcción. */
export const compareBuild = (imageCreatedMs: number, files: FileTimes): string[] =>
  files.filter((file) => file.mtimeMs > imageCreatedMs).map((file) => file.name);

const readFileTimes = async (context: string): Promise<FileTimes> => {
  const times: FileTimes = [];
  for (const name of WATCHED_FILES) {
    try {
      times.push({ name, mtimeMs: (await stat(join(context, name))).mtimeMs });
    } catch {
      // el archivo no existe en este repo
    }
  }
  return times;
};

/** Servicio de compose → carpeta de su contexto de build (solo los que se construyen desde el repo). */
export const readBuildContexts = async (composeFile: string, runner: Runner = run): Promise<Record<string, string>> => {
  const result = await runner('docker', ['compose', '-f', composeFile, 'config', '--format', 'json'], 30_000);
  if (!result.ok) return {};
  try {
    const parsed = JSON.parse(result.stdout) as { services?: Record<string, { build?: { context?: string } }> };
    return Object.fromEntries(
      Object.entries(parsed.services ?? {}).flatMap(([service, definition]) => (definition.build?.context ? [[service, definition.build.context]] : [])),
    );
  } catch {
    return {};
  }
};

/** Estado de la imagen de cada contenedor que se construye desde un repo del compose. */
export const readBuildStatus = async (
  composeFile: string,
  containers: Array<{ name: string; service: string | null }>,
  runner: Runner = run,
  readTimes: (context: string) => Promise<FileTimes> = readFileTimes,
): Promise<BuildStatus[]> => {
  const contexts = await readBuildContexts(composeFile, runner);
  const buildable = containers.filter((container): container is { name: string; service: string } => !!container.service && !!contexts[container.service]);
  if (!buildable.length) return [];
  const images = await runner('docker', ['inspect', '--format', '{{.Name}}\t{{.Image}}', ...buildable.map((container) => container.name)], 30_000);
  const imageOf = new Map(images.stdout.split('\n').map((line) => line.split('\t') as [string, string]));
  const ids = [...new Set([...imageOf.values()].filter(Boolean))];
  const created = await runner('docker', ['image', 'inspect', '--format', '{{.Id}}\t{{.Created}}', ...ids], 30_000);
  const createdOf = new Map(created.stdout.split('\n').map((line) => line.split('\t') as [string, string]));
  const statuses: BuildStatus[] = [];
  for (const container of buildable) {
    const createdAt = createdOf.get(imageOf.get(`/${container.name}`) ?? '');
    const createdMs = createdAt ? Date.parse(createdAt) : NaN;
    if (Number.isNaN(createdMs)) continue;
    const files = compareBuild(createdMs, await readTimes(contexts[container.service]!));
    statuses.push({ service: container.service, stale: files.length > 0, files, imageCreatedAt: createdAt ?? null });
  }
  return statuses;
};

/** Reconstruye la imagen del servicio y recrea su contenedor, siempre con el compose general. */
export const rebuildService = async (composeFile: string, service: string, runner: Runner = run): Promise<{ ok: boolean; output: string }> => {
  const build = await runner('docker', ['compose', '-f', composeFile, 'build', service], 900_000);
  if (!build.ok) return { ok: false, output: `${build.stdout}\n${build.stderr}`.trim().slice(-2000) };
  const up = await runner('docker', ['compose', '-f', composeFile, 'up', '-d', '--no-deps', service], 120_000);
  return { ok: up.ok, output: `${up.stdout}\n${up.stderr}`.trim().slice(-2000) };
};

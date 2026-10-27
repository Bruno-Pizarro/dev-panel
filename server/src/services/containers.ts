import { run, type Runner } from '../docker.js';

export interface ContainerInfo {
  name: string;
  /** Nombre del servicio en el docker-compose (puede diferir del nombre del contenedor). */
  service: string | null;
  image: string;
  state: string;
  status: string;
  ports: string;
  /** Último arranque (ISO); null si nunca arrancó. */
  startedAt: string | null;
  /** Posición en el orden de levantado (la completa la ruta con la configuración). */
  rank?: number;
}

export type TscState = 'ok' | 'errors' | 'stuck' | 'unknown';
export interface TscStatus {
  state: TscState;
  errors: number | null;
}

export const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

const dockerRun =
  (runner: Runner) =>
  (args: string[], timeoutMs?: number) =>
    runner('docker', args, timeoutMs);

export const listContainers = async (runner: Runner = run): Promise<ContainerInfo[]> => {
  const result = await dockerRun(runner)([
    'ps', '-a', '--format', '{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}\t{{.Label "com.docker.compose.service"}}',
  ]);
  if (!result.ok) return [];
  const containers: ContainerInfo[] = result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name = '', state = '', status = '', ports = '', image = '', service = ''] = line.split('\t');
      return { name, state, status, ports, image, service: service || null, startedAt: null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  if (containers.length) {
    const inspect = await dockerRun(runner)(['inspect', '--format', '{{.Name}}\t{{.State.StartedAt}}', ...containers.map((container) => container.name)], 30_000);
    const started = new Map(inspect.stdout.split('\n').map((line) => line.split('\t') as [string, string]));
    for (const container of containers) {
      const value = started.get(`/${container.name}`);
      container.startedAt = value && !value.startsWith('0001-') ? value : null;
    }
  }
  return containers;
};

/**
 * Lee el resultado del compilador en modo watch (`tsc --watch`) desde los logs.
 * "stuck": el último `TS6053` (archivo no encontrado, típico tras cambiar de rama) es posterior al último `Found N errors`.
 */
export const parseTscStatus = (logs: string): TscStatus => {
  const found = [...logs.matchAll(/Found (\d+) errors?/g)];
  const last = found[found.length - 1];
  const stuckAt = logs.lastIndexOf('TS6053');
  if (stuckAt >= 0 && (!last || stuckAt > (last.index ?? 0))) return { state: 'stuck', errors: null };
  if (!last) return { state: 'unknown', errors: null };
  const errors = Number(last[1]);
  return { state: errors === 0 ? 'ok' : 'errors', errors };
};

/** Estado de `tsc` de un contenedor: solo mira los logs desde su último arranque. */
export const readTscStatus = async (name: string, runner: Runner = run): Promise<TscStatus> => {
  const docker = dockerRun(runner);
  const inspect = await docker(['inspect', '--format', '{{.State.StartedAt}}', name]);
  const since = inspect.ok ? inspect.stdout : '';
  const logs = await docker(['logs', ...(since ? ['--since', since] : []), '--tail', '3000', name], 20_000);
  return logs.ok ? parseTscStatus(`${logs.stdout}\n${logs.stderr}`) : { state: 'unknown', errors: null };
};

export const readLogs = async (name: string, tail: number, runner: Runner = run): Promise<string> => {
  const logs = await dockerRun(runner)(['logs', '--tail', String(tail), name], 20_000);
  return `${logs.stdout}\n${logs.stderr}`.trim();
};

export const restartContainer = (name: string, runner: Runner = run) => dockerRun(runner)(['restart', name], 120_000);

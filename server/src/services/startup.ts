import type { DevPanelConfig } from '../config.js';
import type { Runner } from '../docker.js';

export type StageId = 'stage1' | 'stage2' | 'wait' | 'stage3';
export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
export type RunStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled';
export type LogLevel = 'info' | 'warn' | 'error' | 'ok';

export interface StepState {
  id: StageId;
  label: string;
  services: string[];
  status: StepStatus;
  message: string | null;
}

export interface RunLog {
  at: number;
  level: LogLevel;
  text: string;
}

export interface RunState {
  id: string;
  status: RunStatus;
  startedAt: number | null;
  finishedAt: number | null;
  selected: string[];
  steps: StepState[];
  log: RunLog[];
}

export interface EngineDeps {
  getConfig: () => DevPanelConfig;
  runner: Runner;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onChange?: (state: RunState) => void;
}

const MAX_LOG = 600;
const COMPOSE_TIMEOUT_MS = 15 * 60_000;
const POLL_MS = 2_000;

export class StartupError extends Error {}

const unique = (items: string[]): string[] => [...new Set(items)];

const emptyState = (): RunState => ({ id: '', status: 'idle', startedAt: null, finishedAt: null, selected: [], steps: [], log: [] });

/**
 * Levanta el stack por etapas, en el orden que exige el entorno:
 *  1. MinIO (compose de file-manager) → 2. RabbitMQ y Mongo (+ dependencias de grupos como Leia)
 *  → espera a que RabbitMQ loguee que sus plugins cargaron → 3. obligatorios + los elegidos.
 * Usa `up -d --no-deps` para que Compose no altere el orden por sus `depends_on`.
 */
export class StartupEngine {
  private state: RunState = emptyState();
  private cancelled = false;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly deps: EngineDeps) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = deps.now ?? Date.now;
  }

  get snapshot(): RunState {
    return this.state;
  }

  get running(): boolean {
    return this.state.status === 'running';
  }

  /** Arma las etapas de una corrida sin ejecutar nada. */
  plan(selected: string[]): StepState[] {
    const { startup } = this.deps.getConfig();
    const stage2 = unique([...startup.stage2, ...selected.flatMap((name) => startup.groups[name]?.withStage2 ?? [])]);
    const stage3 = unique([...startup.mandatory, ...selected]).filter((name) => !stage2.includes(name));
    const step = (id: StageId, label: string, services: string[]): StepState => ({ id, label, services, status: 'pending', message: null });
    return [
      step('stage1', 'Etapa 1 · MinIO', startup.stage1),
      step('stage2', 'Etapa 2 · RabbitMQ y Mongo', stage2),
      step('wait', 'Espera · RabbitMQ y Mongo listos', [startup.rabbitReady.container, this.deps.getConfig().mongo.container]),
      step('stage3', 'Etapa 3 · Servicios', stage3),
    ];
  }

  validateSelection(selected: string[]): void {
    const { startup } = this.deps.getConfig();
    const invalid = selected.filter((name) => !startup.optional.includes(name));
    if (invalid.length) throw new StartupError(`Servicios no permitidos: ${invalid.join(', ')}`);
  }

  cancel(): void {
    if (this.running) this.cancelled = true;
  }

  /** Corre todas las etapas, o desde `from` (reintento tras un error). La promesa termina al finalizar la corrida. */
  async run(selected: string[], from: StageId = 'stage1'): Promise<RunState> {
    if (this.running) throw new StartupError('Ya hay un levantado en curso');
    this.validateSelection(selected);
    this.cancelled = false;
    const steps = this.plan(selected);
    const startIndex = Math.max(0, steps.findIndex((item) => item.id === from));
    steps.slice(0, startIndex).forEach((item) => (item.status = 'skipped'));
    this.state = { id: `run-${this.now()}`, status: 'running', startedAt: this.now(), finishedAt: null, selected, steps, log: [] };
    this.emit();

    try {
      await this.preflight(steps.slice(startIndex));
      for (const item of steps.slice(startIndex)) {
        if (this.cancelled) throw new StartupError('Cancelado por el usuario');
        item.status = 'running';
        this.emit();
        const message = await this.execute(item);
        item.status = 'done';
        item.message = message;
        this.emit();
      }
      this.finish('done');
      this.log('ok', 'Stack levantado.');
    } catch (error) {
      const current = steps.find((item) => item.status === 'running');
      const text = (error as Error).message;
      if (current) {
        current.status = 'error';
        current.message = text;
      }
      this.finish(this.cancelled ? 'cancelled' : 'error');
      this.log(this.cancelled ? 'warn' : 'error', text);
    }
    return this.state;
  }

  /** Antes de tocar nada: todos los servicios de la corrida deben existir en el compose que corresponde. */
  private async preflight(steps: StepState[]): Promise<void> {
    const { compose } = this.deps.getConfig();
    const checks: Array<{ file: string; services: string[] }> = [
      { file: compose.minio, services: steps.filter((item) => item.id === 'stage1').flatMap((item) => item.services) },
      { file: compose.main, services: steps.filter((item) => item.id === 'stage2' || item.id === 'stage3').flatMap((item) => item.services) },
    ];
    for (const { file, services } of checks) {
      if (!services.length) continue;
      const result = await this.deps.runner('docker', ['compose', '-f', file, 'config', '--services'], 30_000);
      if (!result.ok) throw new StartupError(`No se pudo leer ${file}: ${result.stderr.split('\n').slice(-2).join(' ')}`);
      const known = new Set(result.stdout.split('\n').filter(Boolean));
      const missing = services.filter((name) => !known.has(name));
      if (missing.length) {
        throw new StartupError(`Servicios que no existen en ${file}: ${missing.join(', ')}. Revisá la configuración (nombre de servicio, no de contenedor).`);
      }
    }
    this.log('info', 'Configuración verificada contra los compose.');
  }

  private finish(status: RunStatus): void {
    this.state.status = status;
    this.state.finishedAt = this.now();
    this.emit();
  }

  private emit(): void {
    this.deps.onChange?.(this.state);
  }

  private log(level: LogLevel, text: string): void {
    this.state.log.push({ at: this.now(), level, text });
    if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);
    this.emit();
  }

  private docker(args: string[], timeoutMs?: number) {
    return this.deps.runner('docker', args, timeoutMs);
  }

  private async execute(step: StepState): Promise<string> {
    const { compose } = this.deps.getConfig();
    if (step.id === 'stage1') return this.up(step, compose.minio);
    if (step.id === 'stage2' || step.id === 'stage3') return this.up(step, compose.main);
    return this.waitForInfrastructure();
  }

  /** Servicios de compose que ya están corriendo (se omiten: así el levantado es idempotente). */
  private async runningServices(): Promise<Set<string>> {
    const result = await this.docker(['ps', '--filter', 'status=running', '--format', '{{.Label "com.docker.compose.service"}}']);
    return new Set(result.ok ? result.stdout.split('\n').filter(Boolean) : []);
  }

  private async up(step: StepState, composeFile: string): Promise<string> {
    const running = await this.runningServices();
    const already = step.services.filter((name) => running.has(name));
    const pending = step.services.filter((name) => !running.has(name));
    if (already.length) this.log('info', `Ya levantados: ${already.join(', ')}`);
    if (!pending.length) return 'Todo estaba levantado.';

    this.log('info', `docker compose up -d --no-deps ${pending.join(' ')}`);
    const result = await this.deps.runner('docker', ['compose', '-f', composeFile, 'up', '-d', '--no-deps', ...pending], COMPOSE_TIMEOUT_MS);
    if (!result.ok) throw new StartupError(`No se pudo levantar ${pending.join(', ')}: ${result.stderr.split('\n').slice(-3).join(' ')}`);
    this.log('ok', `Levantados: ${pending.join(', ')}`);
    return `Levantados: ${pending.join(', ')}`;
  }

  private async waitForInfrastructure(): Promise<string> {
    const config = this.deps.getConfig();
    const { rabbitReady } = config.startup;
    const deadline = this.now() + rabbitReady.timeoutSec * 1000;
    const begun = this.now();
    let rabbitOk = false;
    let mongoOk = false;
    let lastNotice = begun;

    while (!(rabbitOk && mongoOk)) {
      if (this.cancelled) throw new StartupError('Cancelado por el usuario');
      if (this.now() > deadline) {
        const missing = [!rabbitOk && `RabbitMQ (no apareció "${rabbitReady.logMatch}")`, !mongoOk && 'Mongo (no está sano)'].filter(Boolean);
        throw new StartupError(`Tiempo agotado (${rabbitReady.timeoutSec}s) esperando: ${missing.join(' y ')}`);
      }
      if (!rabbitOk) rabbitOk = await this.rabbitReady(rabbitReady.container, rabbitReady.logMatch);
      if (rabbitOk && !mongoOk) this.log('ok', 'RabbitMQ listo.');
      if (!mongoOk) mongoOk = await this.mongoHealthy(config.mongo.container);
      if (mongoOk && !(rabbitOk && mongoOk)) this.log('ok', 'Mongo listo.');
      if (!(rabbitOk && mongoOk)) {
        if (this.now() - lastNotice >= 10_000) {
          lastNotice = this.now();
          this.log('info', `Esperando… ${Math.round((this.now() - begun) / 1000)}s (RabbitMQ: ${rabbitOk ? 'listo' : 'esperando'}, Mongo: ${mongoOk ? 'listo' : 'esperando'})`);
        }
        await this.sleep(POLL_MS);
      }
    }
    return 'RabbitMQ y Mongo listos.';
  }

  /** Busca el texto de "listo" solo en los logs posteriores al último arranque del contenedor. */
  private async rabbitReady(container: string, match: string): Promise<boolean> {
    const inspect = await this.docker(['inspect', '--format', '{{.State.Running}}|{{.State.StartedAt}}', container]);
    if (!inspect.ok) return false;
    const [running, startedAt] = inspect.stdout.split('|');
    if (running !== 'true' || !startedAt) return false;
    const logs = await this.docker(['logs', '--since', startedAt, container], 20_000);
    return `${logs.stdout}\n${logs.stderr}`.includes(match);
  }

  private async mongoHealthy(container: string): Promise<boolean> {
    const inspect = await this.docker(['inspect', '--format', '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', container]);
    if (!inspect.ok) return false;
    const [running, health] = inspect.stdout.split('|');
    return running === 'true' && (health === 'healthy' || health === 'none');
  }
}

/** Detiene servicios del compose. `apps` = obligatorios + opcionales; `all` suma infraestructura y MinIO. */
export const stopServices = async (config: DevPanelConfig, scope: 'apps' | 'all', runner: Runner): Promise<string[]> => {
  const { startup, compose } = config;
  const grouped = Object.values(startup.groups).flatMap((group) => group.withStage2);
  const apps = unique([...startup.mandatory, ...startup.optional, ...grouped.filter((name) => !startup.stage2.includes(name))]);
  const main = scope === 'all' ? unique([...apps, ...startup.stage2, ...grouped]) : apps;
  const stopped: string[] = [];
  const stopIn = async (file: string, services: string[]) => {
    const result = await runner('docker', ['compose', '-f', file, 'stop', ...services], 180_000);
    if (!result.ok) throw new StartupError(`No se pudo detener: ${result.stderr.split('\n').slice(-2).join(' ')}`);
    stopped.push(...services);
  };
  await stopIn(compose.main, main);
  if (scope === 'all') await stopIn(compose.minio, startup.stage1);
  return stopped;
};

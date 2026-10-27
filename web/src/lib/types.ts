export interface DevPanelConfig {
  paths: { projects: string; extra: string; daily: string };
  compose: { main: string; minio: string };
  mongo: { container: string };
  startup: {
    stage1: string[];
    stage2: string[];
    rabbitReady: { container: string; logMatch: string; timeoutSec: number };
    mandatory: string[];
    optional: string[];
    groups: Record<string, { withStage2: string[] }>;
    presets: Array<{ name: string; services: string[] }>;
  };
  repos: string[];
}

export type ConfigResponse = { configured: true; config: DevPanelConfig } | { configured: false; reason: string };

export interface ToolStatus {
  ok: boolean;
  version: string;
  error: string | null;
}

export interface SetupDetect {
  docker: ToolStatus;
  compose: ToolStatus;
  paths: Record<string, { value: string; exists: boolean }>;
  repos: Array<{ name: string; exists: boolean }>;
  containers: string[];
  missingServices: string[];
  suggested: DevPanelConfig;
}

export interface ContainerInfo {
  name: string;
  service: string | null;
  image: string;
  state: string;
  status: string;
  ports: string;
}

export type TscState = 'ok' | 'errors' | 'stuck' | 'unknown';
export interface TscStatus {
  state: TscState;
  errors: number | null;
}

export type StageId = 'stage1' | 'stage2' | 'wait' | 'stage3';
export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
export type RunStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

export interface StepState {
  id: StageId;
  label: string;
  services: string[];
  status: StepStatus;
  message: string | null;
}

export interface RunState {
  id: string;
  status: RunStatus;
  startedAt: number | null;
  finishedAt: number | null;
  selected: string[];
  steps: StepState[];
  log: Array<{ at: number; level: 'info' | 'warn' | 'error' | 'ok'; text: string }>;
}

export interface Preset {
  name: string;
  services: string[];
}

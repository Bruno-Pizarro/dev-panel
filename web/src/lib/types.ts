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

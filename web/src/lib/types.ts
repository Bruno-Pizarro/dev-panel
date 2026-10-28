export interface DevPanelConfig {
  paths: { projects: string; extra: string; daily: string; scripts: string; ignoreDirs: string[] };
  remoteBackup: { script: string; types: string[] };
  workday: { entry: string; exit: string; punchUrl: string };
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
  startedAt: string | null;
  rank: number;
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

export interface TicketMr {
  repo?: string;
  iid?: number;
  url?: string;
  autor?: string;
  estado?: string;
}
export interface TicketMeta {
  ticket?: string;
  titulo?: string;
  url?: string;
  estado?: string;
  responsable?: string;
  rama?: string;
  repos?: string[];
  mrs?: TicketMr[];
  codeReview?: Array<{ fecha?: string; veredicto?: string; resumen?: string; hallazgos?: number }>;
  tipo?: 'desarrollo' | 'revision';
  pruebas?: Array<{ conclusion?: string; fecha?: string; resumen?: string; resultado?: string; archivo?: string; capturas?: string[] }>;
  plan?: { resumen?: string; diagrama?: string; referenciaVisual?: string };
}
export interface TicketSummary {
  dir: string;
  ticket: string | null;
  title: string;
  estado: string | null;
  rama: string | null;
  repos: string[];
  mrs: number;
  lastUpdated: number;
  docs: number;
  images: number;
  hasMeta: boolean;
  lastTest: { fecha: string | null; resultado: string | null } | null;
  review: string | null;
  testStatus?: TestStatus;
  /** "revision" = solo se revisa el desarrollo de otra persona: va solo a Pruebas. */
  kind?: 'desarrollo' | 'revision';
  readyForTests?: boolean;
  services?: { optional: string[]; skipped: string[]; source: 'ticket.json' | 'repos' | 'ninguno' };
}
export interface TicketDetail extends TicketSummary {
  meta: TicketMeta | null;
  files: { docs: string[]; diagrams: string[]; images: string[] };
}

export interface ManagedLine {
  line: number;
  key: string;
  active: boolean;
  text: string;
  group: 'minio' | 'remote';
}
export interface EnvRepo {
  repo: string;
  file: string;
  container: string | null;
  exists: boolean;
  state: 'local' | 'remote' | 'mixed' | 'unknown';
  managed: ManagedLine[];
  missing: string[];
  conflicts: string[];
}
export interface EnvChange {
  line: number;
  from: string;
  to: string;
}
export interface SnapshotItem {
  db: string;
  collection: string;
  count: number;
  file: string;
  size: number;
}
export interface Snapshot {
  id: string;
  label: string;
  createdAt: string;
  items: SnapshotItem[];
}
export interface DailyList {
  dir: string;
  today: string;
  dates: string[];
  maxFiles: number;
}

export interface RepoStatus {
  repo: string;
  exists: boolean;
  branch: string | null;
  base: { name: string; ahead: number; behind: number } | null;
  dirty: Array<{ status: string; path: string }>;
  last: { hash: string; subject: string; when: string; author: string } | null;
  upstream: { name: string; ahead: number; behind: number } | null;
  commits: Array<{ hash: string; subject: string; when: string; author: string }>;
  stashes: number;
  ticket: string | null;
}
export interface Check {
  id: string;
  title: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  hint?: string;
}
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
}
export interface MintedSession {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
  frontUrl: string;
  expiresAt: string;
}
export interface ActiveSession {
  id: string;
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}
export interface TestDataRow {
  db: string;
  collection: string;
  field: string;
  count: number;
}

export interface RedmineIssue {
  id: number;
  url: string;
  subject: string;
  title: string;
  storyPoints: number | null;
  module: string | null;
  status: string;
  statusClosed: boolean | null;
  tracker: string;
  priority: string;
  project: string;
  author: string | null;
  assignedTo: string | null;
  startDate: string | null;
  dueDate: string | null;
  doneRatio: number;
  estimatedHours: number | null;
  spentHours: number | null;
  createdOn: string;
  updatedOn: string;
  closedOn: string | null;
  relations: number;
  lastNotes: Array<{ user: string; date: string; notes: string }>;
}

export interface ClaudeUsageWindow {
  usedPercentage: number;
  resetsAt: number;
}
export interface ClaudeUsage {
  source: 'statusline' | 'cache' | 'live';
  capturedAt: string;
  ageSeconds: number;
  model: string | null;
  costUsd: number | null;
  contextUsedPercentage: number | null;
  fiveHour: ClaudeUsageWindow | null;
  sevenDay: ClaudeUsageWindow | null;
}
export interface ClaudeAccount {
  id: string;
  label: string;
  color: string;
  configDir: string;
  status: { loggedIn: boolean; email: string | null; orgName: string | null; plan: string | null; method: string | null };
  usage: ClaudeUsage | null;
  usageProblem?: string | null;
  snippets: { terminal: string; alias: string | null; vscodeCode: string; vscodeSetting: string | null };
}
export interface ClaudeLogin {
  accountId: string | null;
  status: 'idle' | 'starting' | 'waiting-code' | 'done' | 'error';
  url: string | null;
  message: string | null;
}

export type Conclusion = 'aprobado' | 'requiere-cambios' | 'sin-conclusion';
export interface TestStatus {
  runs: number;
  conclusion: Conclusion;
  checklistDone: number;
  checklistTotal: number;
}
export interface TestRunState {
  items: Record<string, boolean>;
  conclusion: Conclusion | null;
  updatedAt: string | null;
}
export interface ActivityEvent {
  id: string;
  type: 'commit' | 'push' | 'mr' | 'review' | 'analysis' | 'estimation' | 'test';
  at: string;
  title: string;
  repo?: string;
  ticket?: string;
  detail?: string;
}
export interface DailyChecklist {
  workday?: { entry: string; exit: string; punchUrl: string };
  date: string;
  items: Array<{ id: string; label: string; done: boolean }>;
}
export interface BoardStatus {
  id: number;
  name: string;
  closed: boolean;
}
export interface Board {
  scope: 'me';
  days: number;
  statuses: BoardStatus[];
  issues: RedmineIssue[];
  truncated: boolean;
  fetchedAt: string;
}

export interface SpWeek {
  weekStart: string;
  sp: number;
  tickets: Array<{ id: number; title: string; sp: number | null; at: string }>;
  withoutSp: number;
}
export interface SpHistory {
  weeks: SpWeek[];
  average: number;
  averageClosed: number | null;
  doneStatuses: string[];
  source: 'redmine' | 'saved';
  generatedAt: string;
}

export interface WeeklyReport {
  range: { start: string; end: string; label: string };
  tickets: Array<{ ticket: string | null; title: string | null; redmineStatus: string | null }>;
  data: string;
  prompt: string;
}

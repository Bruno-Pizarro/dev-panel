import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { ClaudeAccount } from './claudeAccounts.js';

export interface SkillInfo {
  /** Nombre de la carpeta (es el que se invoca con `/nombre`). */
  id: string;
  name: string;
  description: string;
  /** Si el SKILL.md declara `version` en su cabecera. */
  version: string | null;
  /** Última modificación de cualquier archivo de la skill (ISO): es lo que dice "qué tan nueva es". */
  modifiedAt: string;
  /** Archivo que cambió más recientemente, relativo a la carpeta de la skill. */
  modifiedFile: string;
  files: number;
  path: string;
  /** `user`: carpeta de skills de la cuenta; `plugin`: viene de un plugin instalado. */
  source: 'user' | 'plugin';
  plugin: string | null;
  /** Solo plugins: false si la cuenta lo tiene desactivado en `enabledPlugins`. */
  enabled: boolean;
}

const IGNORED = new Set(['node_modules', '.git', '__pycache__']);
const MAX_FILES = 2000;

/** Cabecera `---` de un SKILL.md: solo claves simples `clave: valor` (y bloques `>`/`|` de una descripción larga). */
export const parseFrontmatter = (text: string): Record<string, string> => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const out: Record<string, string> = {};
  const lines = match[1]!.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[index]!);
    if (!pair) continue;
    let value = pair[2]!.trim();
    if (/^[>|][+-]?$/.test(value)) {
      const parts: string[] = [];
      while (index + 1 < lines.length && /^\s+\S/.test(lines[index + 1]!)) parts.push(lines[(index += 1)]!.trim());
      value = parts.join(' ');
    }
    out[pair[1]!] = value.replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
};

const newest = (root: string): { at: number; file: string; files: number } => {
  let best = { at: 0, file: '', files: 0 };
  const walk = (dir: string, relative: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (best.files >= MAX_FILES) return;
      if (IGNORED.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(full, rel);
      else {
        best.files += 1;
        if (stat.mtimeMs > best.at) best = { ...best, at: stat.mtimeMs, file: rel };
      }
    }
  };
  walk(root, '');
  return best;
};

/** Carpeta de skills de la cuenta: la carpeta de configuración de Claude + `/skills`. */
export const skillsDirOf = (account: ClaudeAccount, home: string = homedir()): string => join(account.configDir || join(home, '.claude'), 'skills');

interface ScanOptions {
  source: SkillInfo['source'];
  plugin?: string;
  enabled?: boolean;
  version?: string | null;
  /** Fecha de instalación/actualización del plugin: cuenta como modificación si es más nueva que sus archivos. */
  updatedAt?: string;
}

const scanDir = (dir: string, options: ScanOptions): SkillInfo[] => {
  if (!existsSync(dir)) return [];
  const skills: SkillInfo[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    // Las skills pueden ser enlaces simbólicos a otra carpeta: statSync los sigue.
    let isDir = false;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      isDir = false;
    }
    const manifest = join(path, 'SKILL.md');
    if (!isDir || !existsSync(manifest)) continue;
    let meta: Record<string, string> = {};
    try {
      meta = parseFrontmatter(readFileSync(manifest, 'utf8'));
    } catch {
      meta = {};
    }
    const latest = newest(path);
    const fileTime = latest.at || statSync(manifest).mtimeMs;
    const installed = options.updatedAt ? Date.parse(options.updatedAt) : 0;
    skills.push({
      id: options.plugin ? `${options.plugin}:${entry.name}` : entry.name,
      name: meta['name'] || entry.name,
      description: (meta['description'] ?? '').slice(0, 600),
      version: meta['version'] || options.version || null,
      modifiedAt: new Date(Math.max(fileTime, Number.isNaN(installed) ? 0 : installed)).toISOString(),
      modifiedFile: latest.file || 'SKILL.md',
      files: latest.files,
      path,
      source: options.source,
      plugin: options.plugin ?? null,
      enabled: options.enabled ?? true,
    });
  }
  return skills;
};

const readJson = (file: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

interface PluginInstall {
  installPath?: unknown;
  version?: unknown;
  lastUpdated?: unknown;
  installedAt?: unknown;
}

/**
 * Skills de los plugins instalados: Claude Code los registra en `<config>/plugins/installed_plugins.json` (con la ruta de
 * cada instalación) y los activa en `enabledPlugins` de `settings.json`. Se ignora toda ruta fuera de `<config>/plugins`.
 */
const pluginSkills = (configDir: string): SkillInfo[] => {
  const pluginsRoot = resolve(configDir, 'plugins');
  const installed = readJson(join(pluginsRoot, 'installed_plugins.json'))['plugins'];
  if (!installed || typeof installed !== 'object') return [];
  const enabledMap = (readJson(join(configDir, 'settings.json'))['enabledPlugins'] ?? {}) as Record<string, unknown>;
  const out: SkillInfo[] = [];
  for (const [key, value] of Object.entries(installed as Record<string, unknown>)) {
    const installs = Array.isArray(value) ? (value as PluginInstall[]) : [];
    const plugin = key.split('@')[0] ?? key;
    for (const install of installs) {
      if (typeof install.installPath !== 'string') continue;
      const root = resolve(install.installPath);
      if (!root.startsWith(`${pluginsRoot}${sep}`)) continue;
      const updated = typeof install.lastUpdated === 'string' ? install.lastUpdated : typeof install.installedAt === 'string' ? install.installedAt : undefined;
      out.push(...scanDir(join(root, 'skills'), { source: 'plugin', plugin, enabled: enabledMap[key] !== false, version: typeof install.version === 'string' ? install.version : null, ...(updated ? { updatedAt: updated } : {}) }));
    }
  }
  return out;
};

/** Skills de una cuenta: las propias (`<config>/skills`) y las de sus plugins (solo lectura), las modificadas más recientemente primero. */
export const listSkills = (account: ClaudeAccount, home: string = homedir()): { dir: string; skills: SkillInfo[] } => {
  const configDir = account.configDir || join(home, '.claude');
  const skills = [...scanDir(skillsDirOf(account, home), { source: 'user' }), ...pluginSkills(configDir)];
  skills.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.id.localeCompare(b.id));
  return { dir: configDir, skills };
};

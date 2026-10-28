import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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

/** Skills instaladas para una cuenta (solo lectura: nombre, descripción y fecha de la última modificación), las más nuevas primero. */
export const listSkills = (account: ClaudeAccount, home: string = homedir()): { dir: string; skills: SkillInfo[] } => {
  const dir = skillsDirOf(account, home);
  if (!existsSync(dir)) return { dir, skills: [] };
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
    skills.push({
      id: entry.name,
      name: meta['name'] || entry.name,
      description: (meta['description'] ?? '').slice(0, 600),
      version: meta['version'] || null,
      modifiedAt: new Date(latest.at || statSync(manifest).mtimeMs).toISOString(),
      modifiedFile: latest.file || 'SKILL.md',
      files: latest.files,
      path,
    });
  }
  skills.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.id.localeCompare(b.id));
  return { dir, skills };
};

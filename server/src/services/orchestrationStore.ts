import { homedir } from 'node:os';
import { join } from 'node:path';
import { paths } from '../config.js';
import { loadAccounts } from './claudeAccounts.js';
import { createOrchestration, type ClaudeDir } from './orchestration.js';

/** El escáner de orquestación único del servidor (guarda en `data/orchestration.json`). */
export const orchestration = createOrchestration({ file: join(paths.data, 'orchestration.json') });

/** Carpetas de configuración de Claude: la de siempre y las de las cuentas agregadas en el panel. */
export const claudeDirs = (): ClaudeDir[] => {
  const base = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');
  const accounts = loadAccounts().accounts;
  const list: ClaudeDir[] = [{ dir: base, label: accounts.find((account) => account.configDir === base)?.label ?? 'Claude' }];
  for (const account of accounts) if (!list.some((item) => item.dir === account.configDir)) list.push({ dir: account.configDir, label: account.label });
  return list;
};

/** Se vuelve a leer como mucho cada tanto (una pasada sin cambios cuesta casi nada, pero no hace falta pedirla por cada pantalla). */
export const SCAN_EVERY_MS = 15_000;

export const scanIfStale = async (force = false): Promise<void> => {
  if (force || Date.now() - orchestration.lastScanAt() > SCAN_EVERY_MS) await orchestration.scan(claudeDirs());
};

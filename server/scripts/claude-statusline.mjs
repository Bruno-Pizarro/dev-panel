#!/usr/bin/env node
// Colector del statusLine de Claude Code para el Dev Panel.
// Claude Code ejecuta este script y le pasa por stdin un JSON con la sesión (modelo, costo, % de contexto y, en Pro/Max,
// `rate_limits`). Se guarda lo mínimo y NO hay credenciales en ese JSON. Debe ser rápido y no fallar nunca: si algo sale mal, imprime "—".
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const readStdin = async () => {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
};

try {
  const input = JSON.parse(await readStdin());
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const account = process.env.CLAUDE_CONFIG_DIR ? basename(resolve(configDir)).replace(/^\./, '') || 'cuenta' : 'default';
  const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const dir = join(process.env.DEV_PANEL_DATA || join(root, 'data'), 'claude-usage');
  mkdirSync(dir, { recursive: true });

  const limits = input.rate_limits ?? null;
  const snapshot = {
    capturedAt: new Date().toISOString(),
    account,
    configDir,
    version: input.version ?? null,
    sessionId: input.session_id ?? null,
    model: input.model?.display_name ?? input.model?.id ?? null,
    costUsd: input.cost?.total_cost_usd ?? null,
    contextUsedPercentage: input.context_window?.used_percentage ?? null,
    rateLimits: limits,
    // Para descubrir qué campos trae cada versión (solo nombres).
    topLevelKeys: Object.keys(input),
  };
  const write = (name, value) => {
    const file = join(dir, name);
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
  write(`${account}.json`, snapshot);
  // Entrada completa del último render, solo mientras se investiga el formato.
  if (process.env.DEV_PANEL_STATUSLINE_RAW === '1') write(`_raw-${account}.json`, input);

  const part = (label, window) => (window && typeof window.used_percentage === 'number' ? `${label} ${Math.round(window.used_percentage)}%` : null);
  const text = [part('5h', limits?.five_hour), part('7d', limits?.seven_day)].filter(Boolean).join(' · ');
  process.stdout.write(text || '—');
} catch {
  process.stdout.write('—');
}

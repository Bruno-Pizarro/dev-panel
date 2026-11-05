#!/usr/bin/env node
/**
 * Agrega (o quita) en el settings.json de Claude Code las guardas de las variables de Claude:
 *   · permissions.deny: Read/Edit/Write sobre ~/.config/dev-panel/**
 *   · hook PreToolUse (Bash) → claude-env-guard.mjs, que frena imprimir el entorno o leer el archivo de variables
 *
 * Uso:   yarn node server/scripts/install-claude-env-guards.mjs [--remove] [--settings <ruta>]
 * Igual que install-agent-hooks.mjs: copia de respaldo (settings.json.bak-dev-panel), solo suma sus entradas y es idempotente.
 * Lo corre el usuario: el asistente no edita ese archivo.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const settingsPath = option('--settings', join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json'));
const guard = join(dirname(fileURLToPath(import.meta.url)), 'claude-env-guard.mjs');
const MARK = 'claude-env-guard.mjs';
export const DENY = ['Read(~/.config/dev-panel/**)', 'Edit(~/.config/dev-panel/**)', 'Write(~/.config/dev-panel/**)'];
const isOurs = (hook) => typeof hook?.command === 'string' && hook.command.includes(MARK);

export const apply = (settings, remove, guardPath = guard) => {
  const next = structuredClone(settings);
  const deny = (Array.isArray(next.permissions?.deny) ? next.permissions.deny : []).filter((rule) => !DENY.includes(rule));
  const groups = (Array.isArray(next.hooks?.PreToolUse) ? next.hooks.PreToolUse : [])
    .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((hook) => !isOurs(hook)) }))
    .filter((group) => group.hooks.length > 0);
  if (!remove) {
    deny.push(...DENY);
    groups.push({ matcher: 'Bash', hooks: [{ type: 'command', command: `node ${guardPath}`, timeout: 5 }] });
  }
  if (deny.length) next.permissions = { ...next.permissions, deny };
  else if (next.permissions) {
    delete next.permissions.deny;
    if (Object.keys(next.permissions).length === 0) delete next.permissions;
  }
  if (groups.length) next.hooks = { ...next.hooks, PreToolUse: groups };
  else if (next.hooks) {
    delete next.hooks.PreToolUse;
    if (Object.keys(next.hooks).length === 0) delete next.hooks;
  }
  return next;
};

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  if (!existsSync(settingsPath)) {
    console.error(`No existe ${settingsPath}`);
    process.exit(1);
  }
  const raw = readFileSync(settingsPath, 'utf8');
  const before = JSON.parse(raw);
  const after = apply(before, flag('--remove'));
  if (JSON.stringify(before) === JSON.stringify(after)) {
    console.log('Sin cambios: ya estaba como se pidió.');
    process.exit(0);
  }
  copyFileSync(settingsPath, `${settingsPath}.bak-dev-panel`);
  writeFileSync(settingsPath, `${JSON.stringify(after, null, raw.includes('\n    "') ? 4 : 2)}${raw.endsWith('\n') ? '\n' : ''}`);
  console.log(`${flag('--remove') ? 'Guardas quitadas de' : 'Guardas agregadas a'} ${settingsPath}`);
  console.log(`Copia de respaldo: ${settingsPath}.bak-dev-panel`);
  console.log('Se aplican al abrir una sesión nueva de Claude Code (o con /hooks en la actual).');
}

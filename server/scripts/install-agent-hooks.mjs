#!/usr/bin/env node
/**
 * Agrega (o quita) en el settings.json de Claude Code los hooks que avisan al Dev Panel cuando se delega un agente:
 *   PreToolUse (herramienta Agent) · SubagentStart · SubagentStop  →  POST http://127.0.0.1:4777/api/agents/event
 *
 * Uso:   yarn node server/scripts/install-agent-hooks.mjs [--remove] [--settings <ruta>] [--port 4777]
 * Por defecto toca <CLAUDE_CONFIG_DIR o ~/.claude>/settings.json. Antes de escribir guarda una copia
 * (settings.json.bak-dev-panel) y NO modifica nada de lo que ya hay: solo suma sus entradas (reconocibles por la URL) o,
 * con --remove, saca solo esas. Se puede correr las veces que haga falta. Si el panel no está levantado el hook no hace nada
 * (el curl falla en silencio en 1 segundo) y no frena a Claude.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const port = Number(option('--port', '4777'));
const settingsPath = option('--settings', join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json'));
const MARK = '/api/agents/event';
const command = `curl -s -m 1 -X POST -H "Content-Type: application/json" -H "X-Dev-Panel: 1" --data-binary @- http://127.0.0.1:${port}${MARK} >/dev/null 2>&1 || true`;
const isOurs = (hook) => typeof hook?.command === 'string' && hook.command.includes(MARK);

/** Lo que se suma, por evento. */
const WANTED = {
  PreToolUse: { matcher: 'Agent|Task' },
  SubagentStart: {},
  SubagentStop: {},
};

export const apply = (settings, remove) => {
  const next = structuredClone(settings);
  next.hooks ??= {};
  for (const [event, extra] of Object.entries(WANTED)) {
    const groups = Array.isArray(next.hooks[event]) ? next.hooks[event] : [];
    // Siempre se saca lo nuestro primero: así no se duplica y se puede cambiar el puerto volviendo a correrlo.
    const cleaned = groups
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((hook) => !isOurs(hook)) }))
      .filter((group) => group.hooks.length > 0);
    if (!remove) cleaned.push({ ...extra, hooks: [{ type: 'command', command, timeout: 2 }] });
    if (cleaned.length) next.hooks[event] = cleaned;
    else delete next.hooks[event];
  }
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
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
  console.log(`${flag('--remove') ? 'Hooks del Dev Panel quitados de' : 'Hooks del Dev Panel agregados a'} ${settingsPath}`);
  console.log(`Copia de respaldo: ${settingsPath}.bak-dev-panel`);
  console.log('Los hooks se leen al abrir una sesión nueva de Claude Code (o con /hooks en la actual).');
}

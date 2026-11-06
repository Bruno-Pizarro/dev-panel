#!/usr/bin/env node
/**
 * Revisa qué le falta a esta instalación del Dev Panel para quedar lista y dice qué hacer con cada cosa.
 * Pensado para que la sesión de Claude de cada dev lo corra al empezar y vaya pidiendo lo que falte (ver «Primera sesión» en CLAUDE.md).
 *
 * Uso:   yarn node server/scripts/doctor.mjs [--json]
 *
 * Solo LEE. Nunca imprime valores de credenciales: de los tokens y claves solo informa si están (nombre y sí/no).
 * Siempre termina con código 0: el informe es el resultado, no un fallo.
 *   ok       → está bien
 *   falta    → hace falta para que el panel sirva para lo básico
 *   opcional → habilita una función extra; se pregunta si la quiere
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const asJson = process.argv.includes('--json');

const checks = [];
const add = (group, id, status, what, todo = '') => checks.push({ group, id, status, what, todo });

const run = (command, args) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
const readText = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const exists = (path) => typeof path === 'string' && path !== '' && existsSync(path);

// ---------- Herramientas ----------
const nodeVersion = process.versions.node.split('.').map(Number);
add('Herramientas', 'node', nodeVersion[0] > 18 || (nodeVersion[0] === 18 && nodeVersion[1] >= 14) ? 'ok' : 'falta', `Node ${process.versions.node} (hace falta 18.14 o superior)`, 'Instalar Node 18.14+ (por ejemplo con nvm).');
add('Herramientas', 'yarn', run('yarn', ['--version'])?.startsWith('1.') ? 'ok' : 'falta', `yarn ${run('yarn', ['--version']) ?? '(no está)'} (hace falta la v1; nunca npm)`, 'Instalar yarn v1 (`corepack enable` o `npm i -g yarn` una sola vez).');
add('Herramientas', 'git', run('git', ['--version']) ? 'ok' : 'falta', run('git', ['--version']) ?? 'git no está instalado', 'Instalar git.');
add('Herramientas', 'docker', run('docker', ['info', '--format', '{{.ServerVersion}}']) ? 'ok' : 'falta', run('docker', ['info', '--format', '{{.ServerVersion}}']) ? 'Docker responde' : 'Docker no responde', 'Instalar o iniciar Docker (con Compose): el panel levanta y mira los contenedores.');
add('Herramientas', 'claude-cli', run('claude', ['--version']) ? 'ok' : 'opcional', run('claude', ['--version']) ? 'CLI de Claude instalada' : 'CLI `claude` no encontrada', 'Opcional: sin ella no hay cuentas ni skills en la vista Claude ni se puede registrar el MCP.');
add('Herramientas', 'dependencies', existsSync(join(root, 'node_modules')) ? 'ok' : 'falta', existsSync(join(root, 'node_modules')) ? 'Dependencias instaladas' : 'Falta instalar las dependencias', 'Correr `yarn install` en la carpeta del repo.');

// ---------- Rama (modelo: cada dev trabaja solo en su propia rama) ----------
const branch = run('git', ['-C', root, 'branch', '--show-current']);
add('Rama', 'branch', branch && branch !== 'main' ? 'ok' : 'falta', branch ? `Rama actual: ${branch}` : 'No pude leer la rama', 'Estás en `main` (la base compartida, que no se modifica acá). Crear tu rama: `git switch -c dev/<tu-nombre>` y trabajar solo en ella. Ver docs/PERSONALIZAR.md.');

// ---------- Configuración ----------
const configPath = process.env.DEV_PANEL_CONFIG || join(root, 'config.json');
const config = readJson(configPath);
add('Configuración', 'config', config ? 'ok' : 'falta', config ? `config.json encontrado (${configPath})` : 'Todavía no hay config.json', 'Levantar el panel (`yarn start`) y completar el asistente del primer arranque; o copiar config.example.json a config.json y editarlo.');
if (config) {
  add('Configuración', 'userName', config.userName ? 'ok' : 'opcional', config.userName ? `Nombre: ${config.userName}` : 'userName vacío', 'Opcional: poner tu nombre (Configuración → Perfil); algunas frases del Inicio lo usan.');
  for (const key of ['projects', 'extra', 'daily', 'scripts']) {
    const value = config.paths?.[key];
    add('Configuración', `paths.${key}`, exists(value) ? 'ok' : key === 'scripts' ? 'opcional' : 'falta', `paths.${key}: ${value || '(vacío)'}${exists(value) ? '' : ' — no existe'}`, key === 'scripts' ? 'Opcional: carpeta con los scripts de backup remoto (Datos).' : `Corregir paths.${key} en Configuración → Rutas.`);
  }
  for (const key of ['main', 'minio']) {
    const value = config.compose?.[key];
    add('Configuración', `compose.${key}`, exists(value) ? 'ok' : key === 'main' ? 'falta' : 'opcional', `compose.${key}: ${value || '(vacío)'}${exists(value) ? '' : ' — no existe'}`, `Corregir compose.${key} en Configuración → Rutas (el panel solo invoca ese archivo, no lo modifica).`);
  }
  const repos = Array.isArray(config.repos) ? config.repos : [];
  const missingRepos = repos.filter((repo) => !exists(join(config.paths?.projects ?? '', repo, '.git')));
  add('Configuración', 'repos', repos.length > 0 && missingRepos.length === 0 ? 'ok' : 'falta', repos.length === 0 ? 'No hay repos configurados' : missingRepos.length ? `Repos sin clonar: ${missingRepos.join(', ')}` : `${repos.length} repos encontrados`, 'Clonar los repos que falten dentro de paths.projects o sacarlos de la lista (Configuración → Repos).');
  add('Configuración', 'workday', config.workday?.entry && config.workday?.exit ? 'ok' : 'opcional', config.workday?.entry ? `Jornada ${config.workday.entry}–${config.workday.exit}` : 'Sin horarios de jornada', 'Opcional: horario de entrada/salida y enlace de marcación (Configuración → Jornada y marcación). Colorea el checklist diario y ajusta los saludos.');
}

// ---------- Credenciales (solo nombres, nunca valores) ----------
const claudeEnvFile = process.env.DEV_PANEL_CLAUDE_ENV || join(homedir(), '.config', 'dev-panel', 'claude.env');
const envNames = new Set(readText(claudeEnvFile).split('\n').map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1]).filter(Boolean));
const have = (name) => envNames.has(name) || Boolean(process.env[name]);
const skillRedmine = readJson(join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'skills', 'redmine-drive', 'config.json'));
const redmineKey = have('REDMINE_API_KEY') || Boolean(config?.redmine?.apiKey) || Boolean(skillRedmine?.api_key);
add('Credenciales', 'redmine', redmineKey ? 'ok' : 'opcional', redmineKey ? 'API key de Redmine disponible' : 'Sin API key de Redmine', 'Opcional (Kanban, datos de tickets, avisos): cargarla en Configuración → Redmine. Pegala ahí o en Claude → Variables, nunca en el chat.');
const gitlab = have('GITLAB_TOKEN') || have('GITLAB_RW_TOKEN') || Boolean(config?.gitlab?.token) || config?.gitlab?.sshAuto === true;
add('Credenciales', 'gitlab', gitlab ? 'ok' : 'opcional', gitlab ? 'Acceso a GitLab configurado' : 'Sin token de GitLab', 'Opcional (MRs, pipelines, abrir MRs desde el panel): token en Configuración → GitLab, o activar el token diario para Claude. Cuidado: el modo SSH crea un token en tu cuenta; no se activa sin tu OK.');
add('Credenciales', 'claude-env', existsSync(claudeEnvFile) ? 'ok' : 'opcional', existsSync(claudeEnvFile) ? `Variables de Claude: ${envNames.size} cargadas (${[...envNames].join(', ') || 'ninguna'})` : 'Todavía no hay variables de Claude', 'Opcional: pestaña Claude → Variables, para tokens que Claude usa sin leerlos (GITHUB_TOKEN, DISCORD_BOT_TOKEN, DISCORD_WEBHOOK_MR…).');
add('Credenciales', 'dpx', run('sh', ['-c', 'command -v dpx']) ? 'ok' : 'opcional', run('sh', ['-c', 'command -v dpx']) ? '`dpx` disponible en el PATH' : '`dpx` no está en el PATH', `Opcional (usar las variables de Claude desde la terminal): \`mkdir -p ~/.local/bin && ln -s ${join(root, 'server/scripts/dpx.mjs')} ~/.local/bin/dpx\`.`);

// ---------- Claude Code ----------
const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
const settings = readText(join(claudeDir, 'settings.json'));
const claudeJson = readText(join(homedir(), '.claude.json'));
add('Claude Code', 'mcp', /dev-panel/.test(claudeJson) && /mcp\.js/.test(claudeJson) ? 'ok' : 'opcional', /mcp\.js/.test(claudeJson) ? 'MCP del panel registrado' : 'El MCP del panel no está registrado', `Opcional (que Claude consulte el panel): \`yarn build\` y \`claude mcp add dev-panel -- node ${join(root, 'server/dist/mcp.js')}\`.`);
add('Claude Code', 'agent-hooks', settings.includes('/api/agents/event') ? 'ok' : 'opcional', settings.includes('/api/agents/event') ? 'Hooks de avisos de agentes instalados' : 'Hooks de avisos de agentes sin instalar', 'Opcional (aviso en pantalla cuando Claude delega a un subagente): lo instala EL DEV con `yarn node server/scripts/install-agent-hooks.mjs`. Claude no edita settings.json.');
add('Claude Code', 'env-guards', settings.includes('claude-env-guard') ? 'ok' : 'opcional', settings.includes('claude-env-guard') ? 'Guardas de variables instaladas' : 'Guardas de variables sin instalar', 'Recomendado si usa Claude → Variables: lo instala EL DEV con `yarn node server/scripts/install-claude-env-guards.mjs` (frena que Claude lea el archivo de tokens).');
add('Claude Code', 'skill-dev-panel', exists(join(claudeDir, 'skills', 'dev-panel')) ? 'ok' : 'opcional', exists(join(claudeDir, 'skills', 'dev-panel')) ? 'Skill `dev-panel` instalada' : 'Skill `dev-panel` sin instalar', `Opcional (Pruebas y Desarrollo viven de ticket.json): enlazar \`ln -s ${join(root, 'skills/dev-panel')} ${join(claudeDir, 'skills/dev-panel')}\` y preguntar al dev antes de tocar las otras 5 skills (ver CLAUDE.md, «Skills del pipeline»).`);

// ---------- Personalización ----------
add('Personalización', 'personal-notes', existsSync(join(root, 'docs', 'PERSONAL.md')) ? 'ok' : 'opcional', existsSync(join(root, 'docs', 'PERSONAL.md')) ? 'docs/PERSONAL.md existe (tus decisiones y preferencias)' : 'Todavía no hay docs/PERSONAL.md', 'Opcional: copiar docs/PERSONAL.example.md a docs/PERSONAL.md y contar cómo trabajás y qué querés del panel; Claude lo lee en cada sesión.');
add('Personalización', 'discord-people', config && Object.keys(config.discord?.people ?? {}).length > 0 ? 'ok' : 'opcional', config && Object.keys(config.discord?.people ?? {}).length > 0 ? 'discord.people cargado' : 'discord.people vacío', 'Opcional (etiquetar por nombre en Discord): agregar `{ "Nombre": "id de Discord" }` en config.json (local, nunca en el repo).');

// ---------- Salida ----------
if (asJson) {
  process.stdout.write(`${JSON.stringify({ root, checks }, null, 2)}\n`);
} else {
  const mark = { ok: '✓', falta: '✗', opcional: '·' };
  let group = '';
  for (const check of checks) {
    if (check.group !== group) {
      group = check.group;
      process.stdout.write(`\n${group}\n`);
    }
    process.stdout.write(`  ${mark[check.status]} ${check.what}\n`);
    if (check.status !== 'ok') process.stdout.write(`      → ${check.todo}\n`);
  }
  const missing = checks.filter((check) => check.status === 'falta').length;
  const optional = checks.filter((check) => check.status === 'opcional').length;
  process.stdout.write(`\n${missing === 0 ? 'Lo básico está listo.' : `Faltan ${missing} cosas básicas (✗).`} ${optional} opcionales sin configurar (·).\n`);
}

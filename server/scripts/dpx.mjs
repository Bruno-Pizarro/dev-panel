#!/usr/bin/env node
// dpx — usa las variables de Claude (~/.config/dev-panel/claude.env) sin mostrarlas.
//   dpx run -- <comando> [args]   corre el comando con las variables en el entorno y tapa sus valores en la salida
//   dpx names                     lista los nombres disponibles (nunca los valores)
//   dpx gitlab-mr create --repo R --source RAMA [--target RAMA] --title T [--description-file F | --description D]
//   dpx gitlab-mr note --repo R --iid N (--body-file F | --body TEXTO)
// Los MRs y comentarios los hace el panel con su token diario; dpx solo le pide la acción.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FILE = process.env.DEV_PANEL_CLAUDE_ENV || join(homedir(), '.config', 'dev-panel', 'claude.env');
const PANEL = `http://127.0.0.1:${process.env.DEV_PANEL_PORT || 4777}`;
const MASK = '[oculto]';

const readVars = () => {
  let text = '';
  try {
    text = readFileSync(FILE, 'utf8');
  } catch {
    return {};
  }
  const vars = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) vars[match[1]] = match[2];
  }
  return vars;
};

/** Variantes en las que un valor podría aparecer en la salida: tal cual, URL-encoded, base64 y base64 sin relleno. */
const variants = (value) => {
  const base64 = Buffer.from(value).toString('base64');
  return [...new Set([value, encodeURIComponent(value), base64, base64.replace(/=+$/, '')])].filter((item) => item.length >= 6).sort((a, b) => b.length - a.length);
};

const maskerFor = (vars) => {
  const secrets = Object.values(vars).flatMap(variants);
  return (text) => secrets.reduce((current, secret) => current.split(secret).join(MASK), text);
};

const fail = (message, code = 1) => {
  process.stderr.write(`dpx: ${message}\n`);
  process.exit(code);
};

const flags = (args) => {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!key?.startsWith('--') || args[index + 1] === undefined) fail(`argumento inválido: ${key ?? ''}`, 2);
    result[key.slice(2)] = args[index + 1];
  }
  return result;
};

const post = async (path, body) => {
  let response;
  try {
    response = await fetch(`${PANEL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dev-Panel': '1' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  } catch {
    fail('no se pudo conectar con el Dev Panel (¿está levantado?)');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) fail(data.error || `el panel respondió ${response.status}`);
  return data;
};

const text = (options, inline, file) => (options[file] ? readFileSync(options[file], 'utf8') : options[inline] ?? '');

const [command, ...rest] = process.argv.slice(2);

if (command === 'names') {
  for (const name of Object.keys(readVars()).sort()) process.stdout.write(`${name}\n`);
} else if (command === 'run') {
  const separator = rest.indexOf('--');
  const argv = separator >= 0 ? rest.slice(separator + 1) : rest;
  if (!argv.length) fail('uso: dpx run -- <comando> [args]', 2);
  const vars = readVars();
  const mask = maskerFor(vars);
  const child = spawn(argv[0], argv.slice(1), { env: { ...process.env, ...vars }, stdio: ['inherit', 'pipe', 'pipe'] });
  const pipe = (stream, target) => {
    let pending = '';
    stream.on('data', (chunk) => {
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) target.write(`${mask(line)}\n`);
    });
    stream.on('end', () => pending && target.write(mask(pending)));
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('error', (error) => fail(mask(error.message), 127));
  child.on('close', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} else if (command === 'gitlab-mr') {
  const [action, ...args] = rest;
  const options = flags(args);
  if (action === 'create') {
    if (!options.repo || !options.source || !options.title) fail('uso: dpx gitlab-mr create --repo R --source RAMA [--target RAMA] --title T [--description-file F]', 2);
    const created = await post('/api/gitlab/mr', { repo: options.repo, source: options.source, ...(options.target ? { target: options.target } : {}), title: options.title, description: text(options, 'description', 'description-file') });
    process.stdout.write(`MR !${created.iid}: ${created.url}\n`);
  } else if (action === 'note') {
    if (!options.repo || !options.iid) fail('uso: dpx gitlab-mr note --repo R --iid N (--body-file F | --body TEXTO)', 2);
    await post('/api/gitlab/mr-note', { repo: options.repo, iid: Number(options.iid), body: text(options, 'body', 'body-file') });
    process.stdout.write('Comentario agregado\n');
  } else fail('acción desconocida (create | note)', 2);
} else {
  fail('uso: dpx run -- <comando> | dpx names | dpx gitlab-mr create|note ...', 2);
}

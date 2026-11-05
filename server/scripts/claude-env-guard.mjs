#!/usr/bin/env node
/**
 * Hook PreToolUse (herramienta Bash) de Claude Code: frena los comandos que leerían o imprimirían las variables de Claude
 * (~/.config/dev-panel/claude.env). Lo que sí se puede es `dpx run -- comando`, que tapa los valores en la salida.
 * Es una barrera contra descuidos, no un sandbox: un comando armado a propósito puede rodearla.
 * Entrada: el JSON del hook por stdin. Salida: exit 2 con el motivo si lo frena; exit 0 si lo deja pasar.
 */
const FILE = /claude\.env|\.config\/dev-panel/;
const ENV_DUMP = /^(printenv|env|set|export|declare|typeset|compgen)(\s+-\S*)*\s*$/;
const PROC_ENV = /\/proc\/[^\s]*\/environ/;
const PRINT_SECRET = /^(echo|printf|cat|print)\b.*\$\{?[A-Za-z0-9_]*(TOKEN|SECRET|KEY|PASSWORD|PASS|PWD)[A-Za-z0-9_]*/i;

const segments = (command) => command.split(/&&|\|\||[;|\n]/).map((part) => part.trim()).filter(Boolean);

/** Motivo por el que se frena, o null si puede correr. */
export const check = (command) => {
  if (typeof command !== 'string') return null;
  if (FILE.test(command)) return 'Ese archivo es de las variables de Claude: no se lee desde acá. Usá `dpx run -- comando` o `dpx names`.';
  if (PROC_ENV.test(command)) return 'Leer el entorno de otro proceso puede mostrar variables secretas.';
  for (const segment of segments(command)) {
    if (/^dpx(\s|$)/.test(segment)) continue;
    if (ENV_DUMP.test(segment)) return 'Imprimir el entorno puede mostrar variables secretas. Para ver nombres usá `dpx names`.';
    if (PRINT_SECRET.test(segment)) return 'No imprimas una variable secreta. Para usarla corré el comando con `dpx run -- comando`.';
  }
  return null;
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  let input = '';
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    let command = null;
    try {
      command = JSON.parse(input)?.tool_input?.command ?? null;
    } catch {
      // entrada rara: no se frena nada
    }
    const reason = check(command);
    if (reason) {
      process.stderr.write(`Bloqueado por Dev Panel: ${reason}\n`);
      process.exit(2);
    }
  });
}

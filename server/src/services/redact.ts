/**
 * Tapa los secretos más obvios de un texto antes de guardarlo (el pedido y la respuesta de un agente pueden traer tokens,
 * claves o contraseñas pegadas). Es un filtro de patrones conocidos, no una garantía: una contraseña común escrita en medio
 * de una frase, sin ningún indicio, no se puede detectar.
 */
export const REDACTED = '[oculto]';

interface Rule {
  pattern: RegExp;
  replace: string | ((match: string, ...groups: string[]) => string);
}

const RULES: Rule[] = [
  // Bloques de clave privada completos.
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, replace: `[clave privada ${REDACTED}]` },
  // Tokens con prefijo conocido: GitHub, GitLab, Anthropic, OpenAI y similares, AWS, Slack.
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, replace: REDACTED },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replace: REDACTED },
  { pattern: /\bglpat-[A-Za-z0-9_-]{10,}/g, replace: REDACTED },
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{10,}/g, replace: REDACTED },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replace: REDACTED },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replace: REDACTED },
  { pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, replace: REDACTED },
  // JWT: tres tramos en base64url, los dos primeros empiezan con "eyJ".
  { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: REDACTED },
  // Encabezados de autorización y credenciales dentro de una URL (https://usuario:clave@host).
  { pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/g, replace: (_match, kind) => `${kind} ${REDACTED}` },
  { pattern: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]+(@)/gi, replace: (_match, start, at) => `${start}${REDACTED}${at}` },
  // "clave = valor", "password: valor", "api_key=valor"… (con o sin comillas): se tapa el valor y se deja el nombre.
  {
    pattern: /(\b[\w.-]*(?:pass(?:word|wd)?|pwd|clave|contrase(?:ñ|n)a|secret(?:o)?|token|api[_-]?key|apikey|credencial(?:es)?|pin)[\w.-]*["']?\s*[:=]\s*["']?)([^\s"',;]{3,})/gi,
    replace: (_match, name) => `${name}${REDACTED}`,
  },
];

export const redactSecrets = (text: string): string => RULES.reduce((current, rule) => current.replace(rule.pattern, rule.replace as never), text);

export const MAX_CONTENT = 20_000;
const TRUNCATED = '\n…[recortado]';

/**
 * Texto de varias líneas listo para guardar: sin caracteres de control (salvo saltos de línea y tabulaciones), con los
 * secretos tapados y recortado a `max`. Vacío o que no es texto: null.
 */
export const cleanBlock = (value: unknown, max = MAX_CONTENT): string | null => {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = redactSecrets(value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')).trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}${TRUNCATED}` : text;
};

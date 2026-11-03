/**
 * Coloreado de sintaxis liviano para el visor de diffs: una línea por vez, sin dependencias. No es un parser: reconoce comentarios de
 * una línea, textos, números, palabras clave, tipos y nombres de función, que alcanza para leer un diff. Lo que no entiende queda
 * sin color (nunca se rompe ni se pierde texto).
 */
export type TokenClass = 'kw' | 'str' | 'num' | 'com' | 'type' | 'fn' | 'prop';
export interface Token { text: string; cls: TokenClass | null }
export type Language = 'js' | 'markup' | 'css' | 'hash' | 'sql' | 'plain';

const words = (text: string) => new Set(text.split(' '));
const JS_KEYWORDS = words('abstract as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of private protected public readonly return set static super switch this throw true try type typeof undefined var void while with yield declare namespace keyof satisfies');
const HASH_KEYWORDS = words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return try while with yield True False fi then do done esac case function export local echo true false null');
const SQL_KEYWORDS = words('select from where and or not in is null insert into values update set delete create table alter drop index join left right inner outer on group by order having limit as distinct union all case when then else end primary key foreign references default');

const EXTENSIONS: Record<string, Language> = {
  ts: 'js', tsx: 'js', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', json: 'js', java: 'js', cs: 'js', go: 'js', mts: 'js', cts: 'js',
  html: 'markup', htm: 'markup', xml: 'markup', vue: 'markup', svg: 'markup',
  css: 'css', scss: 'css', less: 'css',
  yml: 'hash', yaml: 'hash', sh: 'hash', bash: 'hash', py: 'hash', env: 'hash', toml: 'hash', dockerfile: 'hash', mmd: 'plain',
  sql: 'sql',
};

export const languageOf = (path: string): Language => {
  const name = path.split('/').pop() ?? '';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : name.toLowerCase();
  return EXTENSIONS[ext] ?? 'plain';
};

const STRING = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|` + '`(?:[^`\\\\]|\\\\.)*`';
const NUMBER = String.raw`\b0x[\da-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:px|rem|em|%|ms|s)?\b`;
const IDENT = String.raw`[A-Za-z_$][\w$]*`;
const CSS_IDENT = String.raw`[A-Za-z_$][\w$-]*`;

// [comentario, texto, número, identificador]
const PATTERNS: Partial<Record<Language, RegExp>> = {
  js: new RegExp(`(//.*$|/\\*.*?\\*/)|(${STRING})|(${NUMBER})|(${IDENT})`, 'g'),
  hash: new RegExp(`(#.*$)|(${STRING})|(${NUMBER})|(${IDENT})`, 'g'),
  sql: new RegExp(`(--.*$)|(${STRING})|(${NUMBER})|(${IDENT})`, 'gi'),
  css: new RegExp(`(/\\*.*?\\*/)|(${STRING})|(${NUMBER})|(@?[#.]?${CSS_IDENT})`, 'g'),
};
const MARKUP = /(<!--.*?-->)|(<\/?[A-Za-z][\w:.-]*)|("[^"]*"|'[^']*')|(\s[@:*#[(]?[\w:.-]+[\])]?(?==))/g;

/** Una línea de código de un lenguaje a una lista de trozos con su clase (null = sin color). */
export const tokenizeLine = (line: string, language: Language): Token[] => {
  if (!line) return [];
  if (language === 'plain') return /^#{1,6}\s/.test(line) ? [{ text: line, cls: 'kw' }] : [{ text: line, cls: null }];
  // Líneas de un comentario de bloque (/** … */ partido en varias líneas).
  if (language === 'js' && /^\s*(\/\*|\*(\s|\/|$))/.test(line)) return [{ text: line, cls: 'com' }];
  const tokens: Token[] = [];
  let last = 0;
  const push = (text: string, cls: TokenClass | null) => text && tokens.push({ text, cls });

  if (language === 'markup') {
    for (const match of line.matchAll(MARKUP)) {
      push(line.slice(last, match.index), null);
      push(match[0], match[1] ? 'com' : match[2] ? 'kw' : match[3] ? 'str' : 'type');
      last = match.index! + match[0].length;
    }
    push(line.slice(last), null);
    return tokens;
  }

  const pattern = PATTERNS[language]!;
  const keywords = language === 'js' ? JS_KEYWORDS : language === 'hash' ? HASH_KEYWORDS : SQL_KEYWORDS;
  for (const match of line.matchAll(pattern)) {
    push(line.slice(last, match.index), null);
    const [text, comment, string, number, ident] = match;
    const after = line.slice(match.index! + text.length);
    if (comment) push(text, 'com');
    else if (string) push(text, /^\s*:/.test(after) ? 'prop' : 'str');
    else if (number) push(text, 'num');
    else if (language === 'css') push(text, text.startsWith('@') ? 'kw' : /^\s*:/.test(after) && !/^[#.]/.test(text) ? 'prop' : /^[#.]/.test(text) ? 'type' : null);
    else if (ident && keywords.has(language === 'sql' ? ident.toLowerCase() : ident)) push(text, 'kw');
    else if (ident && /^[A-Z]/.test(ident) && language !== 'sql') push(text, 'type');
    else if (ident && /^\s*\(/.test(after)) push(text, 'fn');
    else if (ident && language === 'js' && /^\s*\??:/.test(after)) push(text, 'prop');
    else push(text, null);
    last = match.index! + text.length;
  }
  push(line.slice(last), null);
  return tokens;
};

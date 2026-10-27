export interface AnsiStyle {
  color?: string;
  background?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface AnsiSegment {
  text: string;
  style: AnsiStyle;
}

// Paleta pensada para el fondo oscuro del panel (los colores "puros" de la terminal quedan ilegibles).
const NORMAL = ['#6e7681', '#f0626c', '#3fb980', '#e5a93b', '#5b9cf5', '#c084fc', '#56b6e8', '#d0d7de'];
const BRIGHT = ['#8b949e', '#ff8a92', '#6fe3a8', '#f5c969', '#8ab8ff', '#d8a8ff', '#85d4f5', '#ffffff'];

const color256 = (n: number): string | undefined => {
  if (n < 8) return NORMAL[n];
  if (n < 16) return BRIGHT[n - 8];
  if (n < 232) {
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    const i = n - 16;
    return `rgb(${level(Math.floor(i / 36))}, ${level(Math.floor(i / 6) % 6)}, ${level(i % 6)})`;
  }
  const gray = 8 + (n - 232) * 10;
  return `rgb(${gray}, ${gray}, ${gray})`;
};

// Las secuencias de escape de ANSI contienen el carácter de control ESC a propósito.
/* eslint-disable no-control-regex */
const ESCAPE = /\u001b\[([0-9;]*)m/g;
// Cualquier otra secuencia de control (cursor, borrado de línea…) se descarta.
const OTHER_ESCAPES = /\u001b\[[0-9;?]*[A-HJKSTfhlsu]|\u001b\][^\u0007]*\u0007/g;

/* eslint-enable no-control-regex */

export const hasAnsi = (text: string): boolean => text.includes('\u001b[');

/** Convierte texto con secuencias SGR de ANSI (los colores de la consola de Docker) en segmentos con estilo. */
export const parseAnsi = (input: string): AnsiSegment[] => {
  const text = input.replace(OTHER_ESCAPES, '');
  const segments: AnsiSegment[] = [];
  let style: AnsiStyle = {};
  let last = 0;

  const push = (end: number) => {
    if (end > last) segments.push({ text: text.slice(last, end), style: { ...style } });
  };

  for (const match of text.matchAll(ESCAPE)) {
    push(match.index!);
    last = match.index! + match[0].length;
    const codes = (match[1] || '0').split(';').map(Number);
    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i]!;
      if (code === 0) style = {};
      else if (code === 1) style.bold = true;
      else if (code === 2) style.dim = true;
      else if (code === 3) style.italic = true;
      else if (code === 4) style.underline = true;
      else if (code === 22) (delete style.bold, delete style.dim);
      else if (code === 23) delete style.italic;
      else if (code === 24) delete style.underline;
      else if (code >= 30 && code <= 37) style.color = NORMAL[code - 30]!;
      else if (code >= 90 && code <= 97) style.color = BRIGHT[code - 90]!;
      else if (code >= 40 && code <= 47) style.background = `${NORMAL[code - 40]!}55`;
      else if (code >= 100 && code <= 107) style.background = `${BRIGHT[code - 100]!}55`;
      else if (code === 39) delete style.color;
      else if (code === 49) delete style.background;
      else if (code === 38 || code === 48) {
        const target = code === 38 ? 'color' : 'background';
        let value: string | undefined;
        if (codes[i + 1] === 5) (value = color256(codes[i + 2] ?? 0), (i += 2));
        else if (codes[i + 1] === 2) (value = `rgb(${codes[i + 2] ?? 0}, ${codes[i + 3] ?? 0}, ${codes[i + 4] ?? 0})`, (i += 4));
        if (value) style[target] = value;
      }
    }
  }
  push(text.length);
  return segments;
};

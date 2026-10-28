/**
 * Redmine guarda las descripciones en Textile (`h2.`, `bq.`, `*negrita*`, `"texto":url`…). Esto convierte lo habitual a
 * Markdown para dibujarlo con el mismo componente de siempre. Si el texto no parece Textile, se devuelve igual.
 * No es un intérprete completo de Textile: cubre títulos, citas, listas, tablas, bloques de código y el formato en línea.
 */
const LOOKS_LIKE_TEXTILE = /^(h[1-6]|bq|p|fn\d+)\.\s|"[^"\n]+":https?:\/\/|^\|_\.|<\/?(pre|notextile)>/m;

const BOUNDARY_AFTER = String.raw`(?=[\s).,;:!?]|$)`;
const span = (mark: string) => new RegExp(String.raw`(^|[\s(])${mark}(\S(?:[^\n]*?\S)?)${mark}${BOUNDARY_AFTER}`, 'g');
const BOLD = span(String.raw`\*`);
const ITALIC = span('_');
const DELETED = span('-');

/** Formato en línea. Los códigos (`@x@`) y los enlaces se apartan antes para no tocar guiones bajos ni asteriscos de adentro. */
const inline = (text: string): string => {
  const kept: string[] = [];
  const keep = (value: string) => `§${kept.push(value) - 1}§`;
  let out = text
    .replace(/@([^@\n]+)@/g, (_all, code: string) => keep(`\`${code}\``))
    .replace(/"([^"\n]+)":(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)])/g, (_all, label: string, url: string) => keep(`[${label}](${url})`))
    .replace(/!(https?:\/\/[^\s!]+)!/g, (_all, url: string) => keep(`![](${url})`));
  out = out.replace(BOLD, '$1**$2**').replace(ITALIC, '$1*$2*').replace(DELETED, '$1~~$2~~');
  return out.replace(/§(\d+)§/g, (_all, index: string) => kept[Number(index)]!);
};

const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
const cleanCell = (cell: string) => inline(cell.replace(/^\s*(_|[<>=^~])\.\s*/, '').trim());

export const textileToMarkdown = (source: string): string => {
  if (!LOOKS_LIKE_TEXTILE.test(source)) return source;
  const out: string[] = [];
  let inPre = false;
  let inTable = false;
  const block = (line: string) => {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
    out.push(line);
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*<\/pre>\s*$/i.test(raw) || (inPre && /<\/pre>\s*$/i.test(raw))) {
      const tail = raw.replace(/<\/(code|pre)>/gi, '');
      if (tail.trim()) out.push(tail);
      out.push('```');
      inPre = false;
      continue;
    }
    if (inPre) {
      out.push(raw);
      continue;
    }
    if (/^\s*<pre>/i.test(raw)) {
      block('```');
      const rest = raw.replace(/^\s*<pre>(<code[^>]*>)?/i, '');
      const closes = /<\/pre>\s*$/i.test(rest);
      if (rest.trim()) out.push(rest.replace(/<\/(code|pre)>/gi, ''));
      if (closes) out.push('```');
      else inPre = true;
      continue;
    }

    const line = raw.replace(/\s+$/, '');
    const table = /^\|.*\|$/.test(line.trim());
    if (!table) inTable = false;
    if (line.trim() === '') {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      continue;
    }

    const heading = /^h([1-6])\.\s+(.*)$/.exec(line);
    const quote = /^bq\.\s+(.*)$/.exec(line);
    const paragraph = /^p(?:[<>=]|\([^)]*\))*\.\s+(.*)$/.exec(line);
    const item = /^([*#]+)\s+(.*)$/.exec(line);
    if (heading) block(`${'#'.repeat(Number(heading[1]))} ${inline(heading[2]!)}`);
    else if (quote) block(`> ${inline(quote[1]!)}`);
    else if (paragraph) block(inline(paragraph[1]!));
    else if (item) {
      const depth = item[1]!.length - 1;
      const marker = item[1]!.endsWith('#') ? '1.' : '-';
      if (out.length > 0 && out[out.length - 1] !== '' && !/^\s*(-|\d+\.)\s/.test(out[out.length - 1]!)) out.push('');
      out.push(`${'  '.repeat(depth)}${marker} ${inline(item[2]!)}`);
    } else if (table) {
      const row = cells(line);
      const isHeader = row.every((cell) => /^\s*_\./.test(cell));
      if (!inTable) {
        block(isHeader ? `| ${row.map(cleanCell).join(' | ')} |` : `|${row.map(() => '   ').join('|')}|`);
        out.push(`|${row.map(() => ' --- ').join('|')}|`);
        inTable = true;
        if (isHeader) continue;
      }
      out.push(`| ${row.map(cleanCell).join(' | ')} |`);
    } else {
      // Textile respeta los saltos de línea simples dentro de un párrafo; Markdown los une salvo con dos espacios al final.
      const previous = out[out.length - 1];
      if (previous !== undefined && previous !== '' && /^[^#>|`\s-]/.test(previous) && !/^\d+\./.test(previous)) out[out.length - 1] = `${previous}  `;
      out.push(inline(line));
    }
  }
  if (inPre) out.push('```');
  return out.join('\n');
};

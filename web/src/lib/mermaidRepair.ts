/**
 * Mermaid no acepta comillas dentro de una etiqueta sin comillas: `Z[Menú sin "Pendientes"]` da error de sintaxis.
 * Si el diagrama falla, se reintenta con esas etiquetas entre comillas y las internas como `#quot;`.
 * Solo toca etiquetas de nodos de flowchart/graph (`ID[...]`, `ID(...)`, `ID{...}`); el resto queda igual.
 */
const NODE_LABEL = /(\b[A-Za-z_][\w-]*)(\[|\(|\{)([^\])}\n]*"[^\])}\n]*)(\]|\)|\})/g;
const ESCAPED_QUOTE = /(?:#quot;|&quot;)/;

export const repairMermaid = (code: string): string =>
  code.replace(NODE_LABEL, (match, id: string, open: string, label: string, close: string) => {
    const trimmed = label.trim();
    // Ya viene entre comillas (o con comillas escapadas): está bien escrita.
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && !trimmed.slice(1, -1).includes('"')) return match;
    if (ESCAPED_QUOTE.test(label) && !label.includes('"')) return match;
    return `${id}${open}"${label.replace(/"/g, '#quot;')}"${close}`;
  });

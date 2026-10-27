/**
 * Mermaid no acepta comillas dentro de una etiqueta sin comillas: `Z[Menú sin "Pendientes"]` da error de sintaxis.
 * Si el diagrama falla, se reintenta con esas etiquetas entre comillas y las internas como `#quot;`.
 *
 * Conservador a propósito: solo flowchart/graph, solo etiquetas de nodo `ID[...]`, `ID(...)` o `ID{...}` cuyo
 * cierre es el del mismo tipo, y nunca las que ya empiezan con comillas (esas son válidas aunque lleven paréntesis).
 */
const NODE = /(\b[A-Za-z_][\w-]*)(?:\[([^\]\n]*)\]|\(([^)\n]*)\)|\{([^}\n]*)\})/g;

const isFlowchart = (code: string): boolean => /^\s*(flowchart|graph)\b/.test(code.trimStart());

export const repairMermaid = (code: string): string => {
  if (!isFlowchart(code)) return code;
  return code.replace(NODE, (match, id: string, square?: string, round?: string, curly?: string) => {
    const label = square ?? round ?? curly ?? '';
    if (!label.includes('"') || label.trimStart().startsWith('"')) return match;
    const [open, close] = square !== undefined ? ['[', ']'] : round !== undefined ? ['(', ')'] : ['{', '}'];
    return `${id}${open}"${label.replace(/"/g, '#quot;')}"${close}`;
  });
};

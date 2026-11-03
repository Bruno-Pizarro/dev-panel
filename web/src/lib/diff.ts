export type DiffLine = { kind: 'hunk'; text: string } | { kind: 'add' | 'del' | 'ctx'; old: number | null; next: number | null; text: string };

/** Pasa el diff de git a líneas con su numeración (vieja y nueva); descarta la cabecera técnica (diff --git, index, ---, +++). */
export const parseDiffLines = (diff: string): DiffLine[] => {
  const lines: DiffLine[] = [];
  let old = 0;
  let next = 0;
  let inHunk = false;
  for (const raw of diff.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      old = Number(hunk[1]);
      next = Number(hunk[2]);
      inHunk = true;
      lines.push({ kind: 'hunk', text: raw });
    } else if (!inHunk || raw.startsWith('\\')) continue;
    else if (raw.startsWith('+')) lines.push({ kind: 'add', old: null, next: next++, text: raw.slice(1) });
    else if (raw.startsWith('-')) lines.push({ kind: 'del', old: old++, next: null, text: raw.slice(1) });
    else if (raw.length > 0) lines.push({ kind: 'ctx', old: old++, next: next++, text: raw.slice(1) });
  }
  return lines;
};

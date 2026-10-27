import { describe, expect, it } from 'vitest';
import { repairMermaid } from './mermaidRepair';

describe('repairMermaid', () => {
  it('entrecomilla las etiquetas con comillas adentro', () => {
    expect(repairMermaid('flowchart TD\n  A -->|No| Z[Menú sin "Pendientes de firma"]')).toBe('flowchart TD\n  A -->|No| Z["Menú sin #quot;Pendientes de firma#quot;"]');
    expect(repairMermaid('X{¿Hay "algo"?}')).toBe('X{"¿Hay #quot;algo#quot;?"}');
    expect(repairMermaid('Y(Tab "Docs" y "Legajo")')).toBe('Y("Tab #quot;Docs#quot; y #quot;Legajo#quot;")');
  });

  it('no toca etiquetas ya correctas ni texto sin comillas', () => {
    const ok = 'flowchart TD\n  A["Con #quot;comillas#quot;"] --> B[Sin comillas]\n  C["Ya entre comillas"]';
    expect(repairMermaid(ok)).toBe(ok);
    expect(repairMermaid('sequenceDiagram\n  A->>B: dice "hola"')).toBe('sequenceDiagram\n  A->>B: dice "hola"');
  });
});

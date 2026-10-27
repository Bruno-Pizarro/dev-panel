import { describe, expect, it } from 'vitest';
import { repairMermaid } from './mermaidRepair';

describe('repairMermaid', () => {
  it('entrecomilla las etiquetas con comillas adentro', () => {
    expect(repairMermaid('flowchart TD\n  A -->|No| Z[Menú sin "Pendientes de firma"]')).toBe('flowchart TD\n  A -->|No| Z["Menú sin #quot;Pendientes de firma#quot;"]');
    expect(repairMermaid('graph TD\n  X{¿Hay "algo"?}')).toBe('graph TD\n  X{"¿Hay #quot;algo#quot;?"}');
    expect(repairMermaid('graph LR\n  Y(Tab "Docs" y "Legajo")')).toBe('graph LR\n  Y("Tab #quot;Docs#quot; y #quot;Legajo#quot;")');
  });

  it('no toca etiquetas ya válidas, aunque lleven paréntesis o corchetes adentro (casos reales de _EXTRA)', () => {
    const valid = [
      'flowchart LR\n  subgraph chat["Camino de chat (tiempo real)"]\n    RS["retrieve() — SIN TOCAR<br/>8 llamadores"]\n    RN["retrieve_with_sources() — NUEVO"]\n  end',
      'flowchart TD\n  A["Con #quot;comillas#quot;"] --> B[Sin comillas]\n  C["Ya entre comillas"]',
    ];
    for (const code of valid) expect(repairMermaid(code)).toBe(code);
  });

  it('solo actúa sobre flowchart/graph: otros tipos (ER, secuencia) quedan igual', () => {
    const er = 'erDiagram\n  MORA_BLOCK_RUN }o--o{ CONFIG_RRHH_LEGAJO : "empresas[].config"';
    const seq = 'sequenceDiagram\n  A->>B: dice "hola"';
    expect(repairMermaid(er)).toBe(er);
    expect(repairMermaid(seq)).toBe(seq);
  });
});

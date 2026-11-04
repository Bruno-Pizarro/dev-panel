import { describe, expect, it } from 'vitest';
import type { AgentSummary } from './agents.js';
import { BLOCK_GAP_MS, formatExtras, statusChangesOf, suggestHours, ticketOfSubject, type ActivityPoint } from './dailyExtras.js';

const MIN = 60_000;
const t0 = Date.parse('2026-11-03T10:00:00-03:00');
const point = (ticket: string | null, minutes: number, endMinutes?: number): ActivityPoint => ({ ticket, at: t0 + minutes * MIN, ...(endMinutes !== undefined ? { endAt: t0 + endMinutes * MIN } : {}) });

describe('suggestHours: sugerencia de horas por ticket', () => {
  it('un solo punto cuenta como un bloque mínimo de media hora', () => {
    expect(suggestHours([point('33527', 0)])).toEqual([{ ticket: '33527', hours: 0.5, blocks: 1 }]);
  });

  it('puntos cercanos son un mismo bloque: de 10:00 a 12:00 más el margen previo son ~2,5 h', () => {
    const points = [0, 30, 60, 90, 120].map((m) => point('33527', m));
    expect(suggestHours(points)).toEqual([{ ticket: '33527', hours: 2.5, blocks: 1 }]);
  });

  it('un hueco largo parte la actividad en dos bloques que se suman por separado (el almuerzo no cuenta)', () => {
    const points = [point('1', 0), point('1', 30), point('1', 30 + BLOCK_GAP_MS / MIN + 120), point('1', 30 + BLOCK_GAP_MS / MIN + 150)];
    const [result] = suggestHours(points);
    expect(result!.blocks).toBe(2);
    expect(result!.hours).toBe(1.5); // (30+20) + (30+20) min = 100 min → 1,5 h
  });

  it('un agente cuenta con su duración (intervalo) y se suma al bloque de commits cercano', () => {
    const [result] = suggestHours([point('1', 0), point('1', 10, 70)]);
    expect(result).toMatchObject({ blocks: 1, hours: 1.5 }); // 0→70 + 20 = 90 min
  });

  it('separa por ticket, ordena de mayor a menor y deja "sin ticket" al final en los empates', () => {
    const result = suggestHours([point('A', 0), point(null, 0), point('B', 0), point('B', 30), point('B', 60)]);
    expect(result.map((item) => [item.ticket, item.hours])).toEqual([['B', 1.5], ['A', 0.5], [null, 0.5]]);
  });

  it('sin actividad no sugiere nada y los puntos desordenados dan lo mismo', () => {
    expect(suggestHours([])).toEqual([]);
    expect(suggestHours([point('1', 60), point('1', 0), point('1', 30)])).toEqual(suggestHours([point('1', 0), point('1', 30), point('1', 60)]));
  });
});

describe('ticketOfSubject', () => {
  it('toma el número citado en el asunto del commit', () => {
    expect(ticketOfSubject('feat(firmas): pantalla (#33527)')).toBe('33527');
    expect(ticketOfSubject('fix: algo #33526')).toBe('33526');
    expect(ticketOfSubject('sin número')).toBeNull();
    expect(ticketOfSubject('año #2026')).toBeNull();
  });
});

describe('statusChangesOf', () => {
  const statuses = new Map([['16', 'Desarrollo'], ['20', 'Revisión']]);
  const journals = [
    { created_on: '2026-11-02T10:00:00Z', details: [{ property: 'attr', name: 'status_id', old_value: '16', new_value: '20' }] },
    { created_on: '2026-10-01T10:00:00Z', details: [{ property: 'attr', name: 'status_id', old_value: '16', new_value: '20' }] },
    { created_on: '2026-11-03T10:00:00Z', details: [{ property: 'attr', name: 'assigned_to_id', old_value: '1', new_value: '2' }] },
  ];
  it('solo los cambios de estado posteriores a la fecha, con los nombres de los estados', () => {
    expect(statusChangesOf(33526, 'Pendientes', journals, statuses, Date.parse('2026-11-01T00:00:00Z'))).toEqual([{ id: 33526, title: 'Pendientes', from: 'Desarrollo', to: 'Revisión', at: '2026-11-02T10:00:00Z' }]);
    expect(statusChangesOf(1, 'x', journals, new Map(), Date.parse('2026-11-01T00:00:00Z'))[0]).toMatchObject({ from: '?', to: '?' });
  });
});

describe('formatExtras', () => {
  const agent = (ticket: string | null, description: string) => ({ ticket, description }) as AgentSummary;
  it('arma las tres secciones con los enlaces y el total sugerido', () => {
    const lines = formatExtras(
      { agents: [agent('33527', 'Buscar el visor'), agent('33527', 'Revisar tests'), agent(null, 'Otra cosa')], changes: [{ id: 33526, title: 'Pendientes', from: 'Desarrollo', to: 'Revisión', at: 'x' }], hours: [{ ticket: '33527', hours: 2.5, blocks: 2 }, { ticket: null, hours: 0.5, blocks: 1 }] },
      (ticket) => `https://r.example/issues/${ticket}`,
    ).join('\n');
    expect(lines).toContain('## Agentes de Claude');
    expect(lines).toContain('[#33527](https://r.example/issues/33527): 2 agentes — Buscar el visor · Revisar tests');
    expect(lines).toContain('sin ticket: 1 agente — Otra cosa');
    expect(lines).toContain('[#33526](https://r.example/issues/33526) Pendientes: Desarrollo → **Revisión**');
    expect(lines).toContain('## Horas (sugerencia)');
    expect(lines).toContain('ajustalo a tu criterio');
    expect(lines).toContain('~2,5 h (2 bloques de actividad)');
    expect(lines).toContain('**Total sugerido: ~3 h**');
  });
  it('sin nada que sumar no agrega secciones', () => {
    expect(formatExtras({ agents: [], changes: [], hours: [] })).toEqual([]);
  });
});

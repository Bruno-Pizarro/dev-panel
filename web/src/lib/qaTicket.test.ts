import { describe, expect, it } from 'vitest';
import { activeTicket } from './qaTicket';

describe('ticket de Redmine que se muestra', () => {
  it('un desarrollo propio abre el ticket principal; uno de solo revisión, su QA', () => {
    expect(activeTicket('33527', [33945], null, false)).toBe('33527');
    expect(activeTicket('33526', [33812], null, true)).toBe('33812');
  });
  it('sin ticket de QA, un ticket de solo revisión abre el principal', () => {
    expect(activeTicket('33526', [], null, true)).toBe('33526');
  });
  it('la elección del usuario manda, en un sentido y en el otro', () => {
    expect(activeTicket('33526', [33812], '33526', true)).toBe('33526');
    expect(activeTicket('33527', [33945], '33945', false)).toBe('33945');
  });
  it('una elección que ya no existe (otro ticket) se ignora', () => {
    expect(activeTicket('33527', [33945], '99999', false)).toBe('33527');
    expect(activeTicket('33527', [33945], '99999', true)).toBe('33945');
  });
  it('sin ticket principal devuelve null', () => {
    expect(activeTicket(null, [], null, false)).toBeNull();
  });
});

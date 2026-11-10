import { describe, expect, it } from 'vitest';
import { allNavItems, visibleNavGroups } from './nav';

describe('visibleNavGroups', () => {
  it('sin ocultos deja todo', () => {
    expect(visibleNavGroups([]).flatMap((group) => group.items)).toHaveLength(allNavItems.length);
  });
  it('quita lo oculto pero nunca Inicio, Claude ni Configuración', () => {
    const paths = visibleNavGroups(['/kanban', '/logros', '/claude', '/configuracion', '/']).flatMap((group) => group.items.map((item) => item.path));
    expect(paths).not.toContain('/kanban');
    expect(paths).not.toContain('/logros');
    expect(paths).toEqual(expect.arrayContaining(['/', '/claude', '/configuracion']));
  });
  it('un grupo sin items desaparece', () => {
    const entorno = ['/servicios', '/levantado', '/datos', '/sesiones', '/entorno'];
    expect(visibleNavGroups(entorno).map((group) => group.label)).not.toContain('Entorno');
  });
});

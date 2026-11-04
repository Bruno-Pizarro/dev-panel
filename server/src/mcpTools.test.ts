import { describe, expect, it } from 'vitest';
import { mcpTools, type CallApi } from './mcpTools.js';

const find = (name: string) => mcpTools.find((tool) => tool.name === name)!;

describe('herramientas MCP', () => {
  it('no expone nada destructivo: restaurar, resetear, sesiones, limpiar, reiniciar, aplicar .env, detener', () => {
    const names = mcpTools.map((tool) => tool.name).join(' ');
    expect(names).not.toMatch(/restore|reset|password|session|clean|restart|apply|stop|revoke|delete/);
  });

  it('la única herramienta que escribe algo propio del panel es reminder_add, y solo agrega (no hay forma de borrar ni editar)', () => {
    const names = mcpTools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['reminders', 'reminder_add']));
    expect(names.filter((name) => /reminder/.test(name)).sort()).toEqual(['reminder_add', 'reminders']);
  });

  it('reminder_add manda el texto y la fecha (si hay) al panel y valida el texto', async () => {
    const calls: Array<[string, string, unknown]> = [];
    const spy: CallApi = async (method, path, body) => (calls.push([method, path, body]), {});
    await find('reminder_add').run({ text: 'Probar lo de Mariano', at: '2026-11-06' }, spy);
    await find('reminder_add').run({ text: 'Sin fecha' }, spy);
    expect(calls).toEqual([['POST', '/api/reminders', { text: 'Probar lo de Mariano', at: '2026-11-06' }], ['POST', '/api/reminders', { text: 'Sin fecha' }]]);
    const schema = find('reminder_add').shape['text'] as { safeParse: (value: unknown) => { success: boolean } };
    expect(schema.safeParse('ok').success).toBe(true);
    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse('x'.repeat(201)).success).toBe(false);
  });

  it('el único POST que modifica el entorno es el levantado en orden (los otros solo calculan y devuelven datos o agregan un recordatorio)', async () => {
    const calls: Array<[string, string]> = [];
    const spy: CallApi = async (method, path) => (calls.push([method, path]), {});
    for (const tool of mcpTools) await tool.run({ services: ['firma'], dir: 'x', ticket: '33526', since: 'today', text: 'recordar' }, spy);
    const posts = calls.filter(([method]) => method === 'POST').map(([, path]) => path);
    expect(posts.sort()).toEqual(['/api/daily/draft', '/api/daily/weekly', '/api/reminders', '/api/startup/run']);
  });

  it('arma las rutas con parámetros escapados', async () => {
    const paths: string[] = [];
    const spy: CallApi = async (_method, path) => (paths.push(path), {});
    await find('startup_plan').run({ services: ['firma', 'leia'] }, spy);
    await find('ticket_detail').run({ dir: '33526-pendientes firma/../x' }, spy);
    expect(paths).toEqual(['/api/startup/plan?services=firma%2Cleia', '/api/tickets/33526-pendientes%20firma%2F..%2Fx']);
  });

  it('valida el número de ticket antes de llamar', () => {
    const schema = (find('testdata').shape['ticket'] as { safeParse: (value: unknown) => { success: boolean } });
    expect(schema.safeParse('33526').success).toBe(true);
    expect(schema.safeParse('33526; drop').success).toBe(false);
  });
});

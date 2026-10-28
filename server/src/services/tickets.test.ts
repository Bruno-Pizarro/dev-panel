import { mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { defaultConfig } from '../config.js';
import { TicketDeleteError, getTicket, ignoredDirs, servicesForTicket, listTickets, parseDirName, resolveTicketFile, trashTicket } from './tickets.js';

let extra: string;
const write = (path: string, content: string | Buffer = 'x') => {
  const full = join(extra, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
  return full;
};

beforeAll(() => {
  extra = mkdtempSync(join(tmpdir(), 'dev-panel-extra-'));
  write('33526-pendientes-firma/00_BRIEF.md', '# Brief');
  write('33526-pendientes-firma/plan/flujo.mmd', 'graph TD; A-->B');
  write('33526-pendientes-firma/pruebas/capturas/a.png', Buffer.from([137, 80, 78, 71]));
  write('33526-pendientes-firma/pruebas/secreto.json', '{"token":"no"}');
  write('33526-pendientes-firma/ticket.json', JSON.stringify({ ticket: 33526, titulo: 'Pendientes de firma', rama: 'feature/x', repos: ['front'], estado: 'En revisión', mrs: [{ repo: 'front', iid: 1 }], pruebas: [{ fecha: '2026-10-27', resultado: '31/31' }], codeReview: [{ veredicto: 'aprobado' }] }));
  write('32519-pruebas/informe.md', '# Informe');
  utimesSync(join(extra, '32519-pruebas/informe.md'), new Date('2026-01-01'), new Date('2026-01-01'));
  write('ORACULO/notas.md', '# Notas');
  write('.oculta/x.md', 'x');
  write('suelto.md', 'no es carpeta');
  write('afuera/secreto.md', 'secreto fuera del ticket');
  symlinkSync(join(extra, 'afuera/secreto.md'), join(extra, '32519-pruebas/enlace.md'));
  // Las carpetas se crean en el mismo instante: se fija cuál es la más reciente para que el orden no dependa del azar.
  const future = new Date(Date.now() + 3_600_000);
  utimesSync(join(extra, '33526-pendientes-firma/ticket.json'), future, future);
});

describe('parseDirName', () => {
  it('separa número de ticket y título', () => {
    expect(parseDirName('33526-pendientes-firma')).toEqual({ ticket: '33526', title: 'Pendientes firma' });
    expect(parseDirName('ORACULO')).toEqual({ ticket: null, title: 'ORACULO' });
  });
});

describe('listTickets', () => {
  it('lista solo carpetas visibles, la más reciente primero, con datos de ticket.json', () => {
    const tickets = listTickets(extra);
    expect(tickets.map((ticket) => ticket.dir)[0]).toBe('33526-pendientes-firma');
    expect(tickets.map((ticket) => ticket.dir)).not.toContain('.oculta');
    const first = tickets.find((ticket) => ticket.dir === '33526-pendientes-firma')!;
    expect(first).toMatchObject({ ticket: '33526', title: 'Pendientes de firma', rama: 'feature/x', mrs: 1, review: 'aprobado', hasMeta: true, images: 1, lastTest: { resultado: '31/31' } });
  });

  it('sin ticket.json deduce lo básico del nombre de la carpeta', () => {
    const old = listTickets(extra).find((ticket) => ticket.dir === '32519-pruebas')!;
    expect(old).toMatchObject({ ticket: '32519', hasMeta: false, estado: null, docs: 1 });
  });

  it('una carpeta de _EXTRA que no existe devuelve lista vacía', () => {
    expect(listTickets(join(extra, 'no-existe'))).toEqual([]);
  });
});

describe('getTicket', () => {
  it('clasifica documentos, diagramas e imágenes con rutas relativas', () => {
    const detail = getTicket(extra, '33526-pendientes-firma')!;
    expect(detail.files.docs).toEqual(['00_BRIEF.md']);
    expect(detail.files.diagrams).toEqual(['plan/flujo.mmd']);
    expect(detail.files.images).toEqual(['pruebas/capturas/a.png']);
  });

  it('rechaza carpetas que no están en la lista', () => {
    expect(getTicket(extra, '../etc')).toBeNull();
    expect(getTicket(extra, 'suelto.md')).toBeNull();
  });
});

describe('resolveTicketFile (seguridad)', () => {
  const resolveText = (path: string) => resolveTicketFile(extra, '33526-pendientes-firma', path, 'text');

  it('permite md, mmd y ticket.json, e imágenes en modo imagen', () => {
    expect(resolveText('00_BRIEF.md').ok).toBe(true);
    expect(resolveText('plan/flujo.mmd').ok).toBe(true);
    expect(resolveText('ticket.json').ok).toBe(true);
    expect(resolveTicketFile(extra, '33526-pendientes-firma', 'pruebas/capturas/a.png', 'image').ok).toBe(true);
  });

  it('rechaza recorrido de directorios, rutas absolutas y bytes nulos', () => {
    expect(resolveText('../32519-pruebas/informe.md')).toMatchObject({ ok: false, status: 400 });
    expect(resolveText('/etc/passwd')).toMatchObject({ ok: false, status: 400 });
    expect(resolveText('a\0.md')).toMatchObject({ ok: false, status: 400 });
  });

  it('rechaza extensiones no permitidas (otros .json, texto como imagen)', () => {
    expect(resolveText('pruebas/secreto.json')).toMatchObject({ ok: false, status: 400 });
    expect(resolveTicketFile(extra, '33526-pendientes-firma', '00_BRIEF.md', 'image')).toMatchObject({ ok: false, status: 400 });
  });

  it('un symlink que apunta fuera de la carpeta del ticket se rechaza', () => {
    expect(resolveTicketFile(extra, '32519-pruebas', 'enlace.md', 'text')).toMatchObject({ ok: false, status: 400 });
  });

  it('carpeta inexistente o archivo inexistente → 404', () => {
    expect(resolveTicketFile(extra, 'otra', 'x.md', 'text')).toMatchObject({ ok: false, status: 404 });
    expect(resolveText('nada.md')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('trashTicket (eliminar con confirmación)', () => {
  const make = () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-trash-'));
    mkdirSync(join(root, '40001-prueba'));
    writeFileSync(join(root, '40001-prueba', 'informe.md'), 'x');
    mkdirSync(join(root, 'afuera'));
    symlinkSync(join(root, 'afuera'), join(root, '40002-enlace'));
    return root;
  };

  it('mueve la carpeta a .papelera solo si se escribe el nombre exacto', () => {
    const root = make();
    expect(() => trashTicket(root, '40001-prueba', '40001')).toThrow(/no coincide/);
    expect(existsSync(join(root, '40001-prueba'))).toBe(true);
    const result = trashTicket(root, '40001-prueba', '40001-prueba');
    expect(existsSync(join(root, '40001-prueba'))).toBe(false);
    expect(result.movedTo.startsWith('.papelera/40001-prueba__')).toBe(true);
    expect(existsSync(join(root, result.movedTo, 'informe.md'))).toBe(true);
    // y la carpeta ya no aparece en la lista
    expect(listTickets(root).map((t) => t.dir)).not.toContain('40001-prueba');
  });

  it('rechaza nombres que no son carpetas del listado, recorrido de directorios y enlaces', () => {
    const root = make();
    expect(() => trashTicket(root, '../etc', '../etc')).toThrow(TicketDeleteError);
    expect(() => trashTicket(root, 'no-existe', 'no-existe')).toThrow(/no encontrado/);
    expect(() => trashTicket(root, '40002-enlace', '40002-enlace')).toThrow(/no encontrado/);
    expect(existsSync(join(root, 'afuera'))).toBe(true);
  });
});

describe('carpetas omitidas (daily y otras que no son tickets)', () => {
  it('la carpeta del Daily no aparece en el listado, no se puede abrir ni eliminar', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-ign-'));
    mkdirSync(join(root, '40010-ticket'));
    mkdirSync(join(root, 'daily'));
    writeFileSync(join(root, 'daily', '2026-10-27.md'), '# daily');
    const config = { ...defaultConfig('/x'), paths: { ...defaultConfig('/x').paths, extra: root, daily: join(root, 'daily') } };
    const ignore = ignoredDirs(config);
    expect(ignore).toContain('daily');
    expect(listTickets(root, ignore).map((t) => t.dir)).toEqual(['40010-ticket']);
    expect(listTickets(root).map((t) => t.dir)).toContain('daily');
    expect(getTicket(root, 'daily', ignore)).toBeNull();
    expect(resolveTicketFile(root, 'daily', '2026-10-27.md', 'text', ignore)).toMatchObject({ ok: false, status: 404 });
    expect(() => trashTicket(root, 'daily', 'daily', ignore)).toThrow(/no encontrado/);
    expect(existsSync(join(root, 'daily'))).toBe(true);
  });

  it('también omite la carpeta del Daily aunque tenga otro nombre, y las extra que se configuren', () => {
    const config = { ...defaultConfig('/x'), paths: { ...defaultConfig('/x').paths, extra: '/base', daily: '/base/resumenes', ignoreDirs: ['dev-panel'] } };
    expect(ignoredDirs(config).sort()).toEqual(['dev-panel', 'resumenes']);
    expect(ignoredDirs({ ...config, paths: { ...config.paths, daily: '/otro/lado/daily' } })).toEqual(['dev-panel']);
  });
});

describe('servicesForTicket (botón "Levantar servicios")', () => {
  const config = defaultConfig('/x');
  it('deduce los servicios de los repos del ticket, con los nombres distintos del compose, y descarta lo que no es servicio', () => {
    const result = servicesForTicket(config, { repos: ['front', 'legajo', 'documentos', 'control-horario', 'security'] } as never);
    expect(result.optional.sort()).toEqual(['controlhorario', 'documentos']);
    expect(result.skipped.sort()).toEqual(['front', 'legajo', 'security']);
    expect(result.source).toBe('repos');
  });
  it('un campo servicios de ticket.json manda sobre los repos y se valida contra los opcionales', () => {
    const result = servicesForTicket(config, { repos: ['firma'], servicios: ['leia', 'firma', 'rabbitmq'] } as never);
    expect(result).toEqual({ optional: ['leia', 'firma'], skipped: ['rabbitmq'], source: 'ticket.json' });
  });
  it('sin repos ni servicios no pide nada extra', () => {
    expect(servicesForTicket(config, null)).toEqual({ optional: [], skipped: [], source: 'ninguno' });
  });
});

describe('workday en la configuración', () => {
  it('acepta HH:MM y enlaces http(s), y rechaza horarios o enlaces inválidos', async () => {
    const { configSchema } = await import('../config.js');
    const base = defaultConfig('/x');
    expect(configSchema.safeParse({ ...base, workday: { entry: '09:00', exit: '18:30', punchUrl: 'https://triunfo.e-sueldos.com/control-horario/marcaciones/pin' } }).success).toBe(true);
    expect(configSchema.safeParse({ ...base, workday: { entry: '25:00', exit: '', punchUrl: '' } }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, workday: { entry: '', exit: '', punchUrl: 'javascript:alert(1)' } }).success).toBe(false);
    expect(configSchema.safeParse({ ...base, workday: { entry: '', exit: '', punchUrl: '' } }).success).toBe(true);
  });
});

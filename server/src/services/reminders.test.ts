import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Reminder } from './reminders.js';

// Guarda en disco: se carga después de apuntar los datos a una carpeta temporal (nunca a la real).
const dir = mkdtempSync(join(tmpdir(), 'dp-reminders-'));
let r: typeof import('./reminders.js');
beforeAll(async () => {
  process.env['DEV_PANEL_DATA'] = dir;
  r = await import('./reminders.js');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const base = (over: Partial<Reminder>): Reminder => ({ id: 'x', text: 't', at: null, createdAt: '2026-11-04T10:00:00Z', done: false, doneAt: null, ...over });

describe('cuándo le toca mostrarse a un recordatorio', () => {
  it('sin fecha siempre (es un pendiente); con día, desde ese día; con hora, desde ese momento; hecho, nunca', () => {
    const now = new Date(2026, 10, 5, 10, 30);
    expect(r.isDue(base({ at: null }), now)).toBe(true);
    expect(r.isDue(base({ at: '2026-11-05' }), now)).toBe(true);
    expect(r.isDue(base({ at: '2026-11-06' }), now)).toBe(false);
    expect(r.isDue(base({ at: new Date(2026, 10, 5, 10, 0).toISOString() }), now)).toBe(true);
    expect(r.isDue(base({ at: new Date(2026, 10, 5, 11, 0).toISOString() }), now)).toBe(false);
    expect(r.isDue(base({ at: null, done: true }), now)).toBe(false);
  });
});

describe('validaciones', () => {
  it('el texto se limpia (una línea, sin caracteres de control), se recorta y no puede quedar vacío', () => {
    expect(r.cleanReminderText('  probar\n\tlo   nuevo \u0007')).toBe('probar lo nuevo');
    expect(r.cleanReminderText('a'.repeat(500))).toHaveLength(r.MAX_TEXT);
    expect(() => r.cleanReminderText('   ')).toThrow(r.ReminderError);
    expect(() => r.cleanReminderText(42)).toThrow(r.ReminderError);
  });
  it('la fecha admite un día, un ISO con hora o nada; lo demás se rechaza', () => {
    expect(r.normalizeAt(undefined)).toBeNull();
    expect(r.normalizeAt('')).toBeNull();
    expect(r.normalizeAt('2026-11-05')).toBe('2026-11-05');
    expect(r.normalizeAt('2026-11-05T10:00:00-03:00')).toBe('2026-11-05T13:00:00.000Z');
    for (const bad of ['mañana', '2026-13-40', '2026-02-30', 42]) expect(() => r.normalizeAt(bad)).toThrow(r.ReminderError);
  });
});

describe('guardado', () => {
  it('agrega, lista (pendientes primero y por fecha), marca como hecho y borra', () => {
    const later = r.addReminder({ text: 'segundo', at: '2026-11-09' });
    const sooner = r.addReminder({ text: 'primero', at: '2026-11-05' });
    const undated = r.addReminder({ text: 'sin fecha' });
    expect(r.listReminders().map((x) => x.text)).toEqual(['primero', 'segundo', 'sin fecha']);
    r.setReminderDone(sooner.id, true);
    expect(r.listReminders().map((x) => [x.text, x.done])).toEqual([['segundo', false], ['sin fecha', false], ['primero', true]]);
    expect(r.setReminderDone(sooner.id, false).doneAt).toBeNull();
    r.removeReminder(later.id);
    r.removeReminder(undated.id);
    r.removeReminder(sooner.id);
    expect(r.listReminders()).toEqual([]);
    expect(() => r.removeReminder('nadie')).toThrow(r.ReminderError);
    expect(() => r.setReminderDone('nadie', true)).toThrow(r.ReminderError);
  });

  it('los hechos se borran solos pasada una semana y dueReminders devuelve solo los que ya les toca', () => {
    const old = r.addReminder({ text: 'viejo' });
    r.setReminderDone(old.id, true, new Date('2026-10-01T00:00:00Z'));
    const future = r.addReminder({ text: 'futuro', at: '2099-01-01' });
    const now = r.addReminder({ text: 'ahora' });
    expect(r.listReminders(new Date('2026-11-04T00:00:00Z')).map((x) => x.text)).not.toContain('viejo');
    expect(r.dueReminders(new Date('2026-11-04T12:00:00Z')).map((x) => x.text)).toEqual(['ahora']);
    r.removeReminder(future.id);
    r.removeReminder(now.id);
  });

  it('hay un máximo de recordatorios pendientes', () => {
    const ids = Array.from({ length: r.MAX_REMINDERS }, (_, i) => r.addReminder({ text: `r${i}` }).id);
    expect(() => r.addReminder({ text: 'uno más' })).toThrow(/demasiados/);
    ids.forEach((id) => r.removeReminder(id));
  });
});

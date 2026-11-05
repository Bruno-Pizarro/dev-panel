import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initTheme, storedTheme } from './theme';

const store: Record<string, string> = {};
const root = { dataset: {} as Record<string, string | undefined> };

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  root.dataset = {};
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => void (store[key] = value) }, dispatchEvent: () => true });
  vi.stubGlobal('document', { documentElement: root });
  vi.stubGlobal('Event', class {});
});

describe('tema guardado', () => {
  it('lo aplica al arrancar aunque el script de index.html no haya corrido', () => {
    store['dev-panel.theme'] = JSON.stringify('eclipse');
    initTheme();
    expect(root.dataset['theme']).toBe('eclipse');
  });
  it('ignora valores inválidos o mal formados', () => {
    for (const raw of ['eclipse', '"no-existe"', '{', '123']) {
      store['dev-panel.theme'] = raw;
      expect(storedTheme()).toBeNull();
    }
    initTheme();
    expect(root.dataset['theme']).toBeUndefined();
  });
  it('índigo es el de por defecto: no deja atributo', () => {
    store['dev-panel.theme'] = JSON.stringify('indigo');
    initTheme();
    expect(root.dataset['theme']).toBeUndefined();
  });
});

import { useCallback, useEffect, useState } from 'react';

export interface ThemeOption {
  id: string;
  label: string;
  /** Colores de la muestra: fondo, superficie y acento. */
  swatch: [string, string, string];
}

export const THEMES: ThemeOption[] = [
  { id: 'indigo', label: 'Índigo', swatch: ['#0f1419', '#242d3d', '#8a97ff'] },
  { id: 'ambar', label: 'Ámbar', swatch: ['#140f0c', '#33261b', '#fb923c'] },
  { id: 'violeta', label: 'Violeta', swatch: ['#110d1a', '#2c2344', '#c084fc'] },
  { id: 'bosque', label: 'Bosque', swatch: ['#0b120f', '#1e3028', '#4ade80'] },
  { id: 'oceano', label: 'Océano', swatch: ['#0a1118', '#1c3146', '#38bdf8'] },
  { id: 'rosa', label: 'Rosa', swatch: ['#180d13', '#3d2331', '#f472b6'] },
  { id: 'medianoche', label: 'Medianoche', swatch: ['#000000', '#1c1c1f', '#7dd3fc'] },
  { id: 'eclipse', label: 'Eclipse', swatch: ['#000000', '#1c1c1f', '#a78bfa'] },
  { id: 'claro', label: 'Claro', swatch: ['#f4f6f9', '#e4e8ef', '#4f46e5'] },
];

const KEY = 'dev-panel.theme';
const EVENT = 'dev-panel:theme';

const isTheme = (value: unknown): value is string => THEMES.some((theme) => theme.id === value);

export const currentTheme = (): string => {
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : 'indigo';
};

const apply = (id: string) => {
  if (id === 'indigo') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(id));
  } catch {
    /* sin almacenamiento: el tema vale solo para esta sesión */
  }
  window.dispatchEvent(new Event(EVENT));
};

/** Tema elegido (comodidad por usuario, en el navegador). */
export const useTheme = (): [string, (id: string) => void] => {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => {
    const sync = () => setTheme(currentTheme());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const choose = useCallback((id: string) => isTheme(id) && apply(id), []);
  return [theme, choose];
};

/** Lee un color del tema activo (canales RGB de la variable CSS) como `#rrggbb`, para librerías que no usan CSS. */
export const themeColor = (name: string): string => {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).map(Number);
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

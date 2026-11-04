/**
 * Temperatura actual para el Inicio. La ubicación la da el navegador (nunca se guarda en el servidor): llegan las coordenadas,
 * se redondean a 2 decimales (~1 km) y se consulta a Open-Meteo (gratis, sin clave). Lo único que sale de la máquina son esas
 * coordenadas redondeadas. Caché de 30 minutos por zona.
 */
export interface Weather {
  temperature: number;
  apparent: number;
  code: number;
  isDay: boolean;
  /** Descripción corta en español del código del clima. */
  label: string;
  time: string;
}

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export const WEATHER_CACHE_MS = 30 * 60_000;

/** Códigos WMO de Open-Meteo → texto. */
export const weatherLabel = (code: number): string => {
  if (code === 0) return 'Despejado';
  if (code === 1) return 'Mayormente despejado';
  if (code === 2) return 'Parcialmente nublado';
  if (code === 3) return 'Nublado';
  if (code === 45 || code === 48) return 'Niebla';
  if (code >= 51 && code <= 57) return 'Llovizna';
  if (code >= 61 && code <= 67) return 'Lluvia';
  if (code >= 71 && code <= 77) return 'Nieve';
  if (code >= 80 && code <= 82) return 'Chubascos';
  if (code === 85 || code === 86) return 'Nevadas';
  if (code >= 95) return 'Tormenta';
  return 'Clima variable';
};

export const roundCoordinate = (value: number): number => Math.round(value * 100) / 100;

export const isValidCoordinates = (lat: number, lon: number): boolean => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

const cache = new Map<string, { at: number; value: Weather }>();
export const clearWeatherCache = (): void => cache.clear();

export const parseWeather = (raw: unknown): Weather | null => {
  const body = raw !== null && typeof raw === 'object' ? (raw as { current?: Record<string, unknown> }) : {};
  const current = body.current;
  if (!current || typeof current['temperature_2m'] !== 'number') return null;
  const code = typeof current['weather_code'] === 'number' ? current['weather_code'] : -1;
  return {
    temperature: Math.round(current['temperature_2m']),
    apparent: Math.round(typeof current['apparent_temperature'] === 'number' ? current['apparent_temperature'] : current['temperature_2m']),
    code,
    isDay: current['is_day'] !== 0,
    label: weatherLabel(code),
    time: typeof current['time'] === 'string' ? current['time'] : '',
  };
};

export const fetchWeather = async (lat: number, lon: number, fetcher: Fetcher = fetch as unknown as Fetcher, now = Date.now()): Promise<Weather | null> => {
  const latitude = roundCoordinate(lat);
  const longitude = roundCoordinate(lon);
  const key = `${latitude},${longitude}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < WEATHER_CACHE_MS) return hit.value;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,is_day&timezone=auto`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return hit?.value ?? null;
    const value = parseWeather(await response.json());
    if (value) cache.set(key, { at: now, value });
    return value ?? hit?.value ?? null;
  } catch {
    return hit?.value ?? null;
  }
};

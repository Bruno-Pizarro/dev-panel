import { api } from '../api';
import type { WeatherNow } from '../types';
import type { TalkWeather } from './mascotTalk';

const PLACE_KEY = 'dev-panel.weather.place';
const TTL_MS = 30 * 60_000;

let cached: { at: number; value: TalkWeather } | null = null;

/** La ubicación que el usuario ya activó en el Inicio (botón «Ver el clima»). Sin ella la mascota no pide nada: nunca pide permisos por su cuenta. */
const storedPlace = (): { lat: number; lon: number } | null => {
  try {
    const raw = window.localStorage.getItem(PLACE_KEY);
    const place = raw ? (JSON.parse(raw) as { lat?: unknown; lon?: unknown } | null) : null;
    return place && typeof place.lat === 'number' && typeof place.lon === 'number' ? { lat: place.lat, lon: place.lon } : null;
  } catch {
    return null;
  }
};

/** El último clima conocido (sin pedir nada). */
export const currentTalkWeather = (): TalkWeather | null => cached?.value ?? null;

/** Pide el clima al servidor si hay ubicación activada y el último dato tiene más de 30 minutos; si falla, devuelve lo que había. */
export const refreshTalkWeather = async (): Promise<TalkWeather | null> => {
  const place = storedPlace();
  if (!place) return null;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const now = await api.get<WeatherNow>(`/api/weather?lat=${place.lat}&lon=${place.lon}`);
    cached = { at: Date.now(), value: { temperature: now.temperature, code: now.code, isDay: now.isDay } };
  } catch {
    /* sin clima: la mascota habla de lo demás */
  }
  return cached?.value ?? null;
};

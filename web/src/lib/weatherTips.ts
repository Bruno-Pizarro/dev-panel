export type WeatherIcon = 'sun' | 'moon' | 'cloud-sun' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

/** El ícono que corresponde a un código de clima de Open-Meteo (WMO), de día o de noche. */
export const weatherIcon = (code: number, isDay: boolean): WeatherIcon => {
  if (code === 0 || code === 1) return isDay ? 'sun' : 'moon';
  if (code === 2) return isDay ? 'cloud-sun' : 'cloud';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
};

/** Una frase corta que reacciona al clima (null si no hay nada que decir). */
export const weatherTip = (code: number, temperature: number): string | null => {
  if (code >= 95) return 'Tormenta: si podés, quedate adentro.';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'Llueve: llevá paraguas.';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Nieva: abrigate bien.';
  if (temperature >= 32) return 'Mucho calor: hidratate.';
  if (temperature <= 8) return 'Hace frío: abrigate.';
  return null;
};

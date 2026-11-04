import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, LocateFixed, MapPinOff, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStoredState } from '../lib/hooks';
import type { WeatherNow } from '../lib/types';
import { weatherIcon, weatherTip, type WeatherIcon } from '../lib/weatherTips';
import { useShortcut } from '../lib/useShortcuts';
import { Button } from './Button';
import { ShortcutKey } from './Key';

const ICONS: Record<WeatherIcon, LucideIcon> = { sun: Sun, moon: Moon, 'cloud-sun': CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

interface Place {
  lat: number;
  lon: number;
}

/**
 * Temperatura actual en el Inicio. La ubicación sale del navegador (se pide permiso una sola vez y queda guardada en este navegador,
 * redondeada a ~1 km); al servidor solo viajan esas coordenadas para consultar a Open-Meteo. Se puede quitar cuando se quiera.
 */
export const WeatherBadge = () => {
  const [place, setPlace] = useStoredState<Place | null>('dev-panel.weather.place', null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!place) {
      setWeather(null);
      return;
    }
    let active = true;
    const load = () =>
      api.get<WeatherNow>(`/api/weather?lat=${place.lat}&lon=${place.lon}`).then(
        (value) => active && (setWeather(value), setProblem(null)),
        () => active && setProblem('No se pudo consultar el clima.'),
      );
    void load();
    // El servidor lo guarda 30 minutos: pedirlo seguido no gasta consultas.
    const timer = window.setInterval(() => void load(), 30 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [place]);

  const ask = () => {
    if (!('geolocation' in navigator)) return setProblem('Este navegador no da la ubicación.');
    setAsking(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAsking(false);
        setPlace({ lat: Math.round(position.coords.latitude * 100) / 100, lon: Math.round(position.coords.longitude * 100) / 100 });
      },
      (error) => {
        setAsking(false);
        setProblem(error.code === error.PERMISSION_DENIED ? 'No diste permiso para la ubicación.' : 'No se pudo obtener la ubicación.');
      },
      { timeout: 10_000, maximumAge: 24 * 3_600_000 },
    );
  };

  // C: pide la ubicación si todavía no hay (si ya hay clima, no hace nada).
  useShortcut('home.weather', ask, !place);

  if (!place) {
    return (
      <div className="flex flex-col items-end gap-1" data-testid="weather-ask">
        <Button className="h-9" icon={<LocateFixed className="size-4" />} loading={asking} onClick={ask} title="Pide la ubicación al navegador, una sola vez. Al servidor solo viajan las coordenadas, redondeadas a ~1 km, para consultar a Open-Meteo.">Ver el clima<ShortcutKey id="home.weather" /></Button>
        {problem && <span className="text-sm text-warning">{problem}</span>}
      </div>
    );
  }
  if (!weather) return <span className="text-sm text-muted" data-testid="weather-loading">{problem ?? 'Consultando el clima…'}</span>;
  const Icon = ICONS[weatherIcon(weather.code, weather.isDay)];
  const tip = weatherTip(weather.code, weather.temperature);
  return (
    <div className="flex items-center gap-3 text-right" data-testid="weather">
      <div>
        <div className="text-2xl font-semibold leading-none tabular-nums">{weather.temperature}°</div>
        <div className="mt-1 text-sm text-muted">{weather.label} · sensación {weather.apparent}°</div>
        {tip && <div className="text-sm text-accent">{tip}</div>}
      </div>
      <Icon className="size-9 shrink-0 text-accent" aria-hidden />
      <button type="button" onClick={() => setPlace(null)} title="Quitar mi ubicación de este navegador" aria-label="Quitar la ubicación" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"><MapPinOff className="size-4" aria-hidden /></button>
    </div>
  );
};

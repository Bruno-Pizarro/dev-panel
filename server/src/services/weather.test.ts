import { beforeEach, describe, expect, it } from 'vitest';
import { clearWeatherCache, fetchWeather, isValidCoordinates, parseWeather, roundCoordinate, weatherLabel, WEATHER_CACHE_MS } from './weather.js';

const body = { current: { time: '2026-11-04T12:00', temperature_2m: 21.4, apparent_temperature: 22.6, weather_code: 2, is_day: 1 } };

describe('clima', () => {
  beforeEach(() => clearWeatherCache());

  it('traduce el código del clima y redondea la temperatura', () => {
    expect(weatherLabel(0)).toBe('Despejado');
    expect(weatherLabel(61)).toBe('Lluvia');
    expect(weatherLabel(95)).toBe('Tormenta');
    expect(parseWeather(body)).toEqual({ temperature: 21, apparent: 23, code: 2, isDay: true, label: 'Parcialmente nublado', time: '2026-11-04T12:00' });
    expect(parseWeather({ current: { ...body.current, is_day: 0 } })!.isDay).toBe(false);
    expect(parseWeather({})).toBeNull();
    expect(parseWeather(null)).toBeNull();
  });

  it('manda a Open-Meteo solo las coordenadas redondeadas a 2 decimales', async () => {
    let url = '';
    const weather = await fetchWeather(-34.603722, -58.381592, (async (requested: string) => { url = requested; return { ok: true, json: async () => body }; }) as never);
    expect(weather!.temperature).toBe(21);
    expect(url).toContain('latitude=-34.6&longitude=-58.38');
    expect(url).not.toContain('34.603722');
    expect(roundCoordinate(1.005)).toBeCloseTo(1, 1);
  });

  it('cachea 30 minutos por zona y, si la consulta falla, devuelve lo último', async () => {
    let calls = 0;
    const ok = (async () => { calls += 1; return { ok: true, json: async () => body }; }) as never;
    const t0 = 1_000_000;
    await fetchWeather(-34.6, -58.38, ok, t0);
    await fetchWeather(-34.601, -58.381, ok, t0 + 60_000); // misma zona redondeada
    expect(calls).toBe(1);
    await fetchWeather(-34.6, -58.38, ok, t0 + WEATHER_CACHE_MS + 1);
    expect(calls).toBe(2);
    const down = (async () => { throw new Error('sin red'); }) as never;
    expect((await fetchWeather(-34.6, -58.38, down, t0 + 2 * WEATHER_CACHE_MS + 5))!.temperature).toBe(21);
    expect(await fetchWeather(10, 10, down)).toBeNull();
  });

  it('valida las coordenadas', () => {
    expect(isValidCoordinates(-34.6, -58.4)).toBe(true);
    expect(isValidCoordinates(91, 0)).toBe(false);
    expect(isValidCoordinates(0, 181)).toBe(false);
    expect(isValidCoordinates(Number.NaN, 0)).toBe(false);
  });
});

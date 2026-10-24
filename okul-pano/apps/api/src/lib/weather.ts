import type { WeatherNow } from '@okulpano/shared';

/** Open-Meteo: anahtar gerektirmeyen, ücretsiz hava durumu servisi. Okul konumu başına 15 dk önbellek. */
const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; data: WeatherNow }>();
const inflight = new Map<string, Promise<WeatherNow | null>>();

interface OpenMeteoResponse {
  current?: { temperature_2m: number; weather_code: number; is_day: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
}

export async function getWeather(lat: number, lon: number, timezone: string, city: string | null): Promise<WeatherNow | null> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.data, city };

  let p = inflight.get(key);
  if (!p) {
    p = fetchWeather(lat, lon, timezone)
      .then((data) => {
        cache.set(key, { at: Date.now(), data });
        return data;
      })
      .catch(() => hit?.data ?? null)
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const data = await p;
  return data ? { ...data, city } : null;
}

async function fetchWeather(lat: number, lon: number, timezone: string): Promise<WeatherNow> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', timezone);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Hava durumu servisi yanıt vermedi: ${res.status}`);
  const json = (await res.json()) as OpenMeteoResponse;
  if (!json.current) throw new Error('Hava durumu verisi eksik');
  return {
    temperature: Math.round(json.current.temperature_2m),
    weatherCode: json.current.weather_code,
    isDay: json.current.is_day === 1,
    high: json.daily?.temperature_2m_max?.[0] != null ? Math.round(json.daily.temperature_2m_max[0]) : null,
    low: json.daily?.temperature_2m_min?.[0] != null ? Math.round(json.daily.temperature_2m_min[0]) : null,
    city: null,
    updatedAt: new Date().toISOString(),
  };
}

export interface GeoResult {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

export async function geocode(query: string): Promise<GeoResult[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'tr');
  url.searchParams.set('format', 'json');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Konum servisi yanıt vermedi: ${res.status}`);
  const json = (await res.json()) as {
    results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string }[];
  };
  return (json.results ?? []).map((r) => ({
    name: r.name,
    region: r.admin1 ?? null,
    country: r.country ?? null,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone ?? null,
  }));
}

export function clearWeatherCache(): void {
  cache.clear();
}

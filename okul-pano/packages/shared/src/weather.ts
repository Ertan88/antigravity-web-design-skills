import type { WeatherAlert } from './display.ts';

/** Open-Meteo günlük tahmininden (bugün, yarın) uyarı çıkarmak için gereken alanlar */
export interface DailyForecast {
  weatherCode: (number | null)[];
  tempMax: (number | null)[];
  tempMin: (number | null)[];
  /** cm */
  snowfall: (number | null)[];
  /** km/sa */
  gustMax: (number | null)[];
}

/**
 * Hava durumu uyarıları: yoğun kar (olası kar tatili), aşırı sıcak / soğuk, buzlanma, fırtına ve
 * gök gürültülü sağanak. Eşikler okul için anlamlı seviyelerde tutuldu.
 */
export function weatherAlerts(d: DailyForecast): WeatherAlert[] {
  const out: WeatherAlert[] = [];
  for (const i of [0, 1]) {
    const day = i === 0 ? 'today' : 'tomorrow';
    const when = i === 0 ? 'Bugün' : 'Yarın';
    const code = d.weatherCode[i] ?? null;
    const snow = d.snowfall[i] ?? 0;
    const max = d.tempMax[i] ?? null;
    const min = d.tempMin[i] ?? null;
    const gust = d.gustMax[i] ?? 0;
    if (snow >= 5 || code === 75 || code === 86) out.push({ kind: 'snow', day, text: `${when} yoğun kar yağışı bekleniyor` });
    else if (snow >= 1 || (code != null && [71, 73, 77, 85].includes(code))) out.push({ kind: 'snow', day, text: `${when} kar yağışı bekleniyor` });
    if (code != null && code >= 95) out.push({ kind: 'thunder', day, text: `${when} gök gürültülü sağanak bekleniyor` });
    if (max != null && max >= 35) out.push({ kind: 'heat', day, text: `${when} aşırı sıcak: ${Math.round(max)}°C` });
    if (min != null && min <= -10) out.push({ kind: 'cold', day, text: `${when} aşırı soğuk: ${Math.round(min)}°C` });
    else if (min != null && min <= 0 && (code === 56 || code === 57 || code === 66 || code === 67)) out.push({ kind: 'ice', day, text: `${when} buzlanma ve don riski` });
    if (gust >= 60) out.push({ kind: 'storm', day, text: `${when} kuvvetli rüzgâr ve fırtına bekleniyor` });
  }
  return out;
}

/** Avrupa hava kalitesi indeksi bantları (EEA) */
export function airQualityLevel(aqi: number): { label: string; tone: 'good' | 'fair' | 'moderate' | 'poor' } {
  if (aqi <= 20) return { label: 'İyi', tone: 'good' };
  if (aqi <= 40) return { label: 'Makul', tone: 'good' };
  if (aqi <= 60) return { label: 'Orta', tone: 'fair' };
  if (aqi <= 80) return { label: 'Kötü', tone: 'moderate' };
  if (aqi <= 100) return { label: 'Çok kötü', tone: 'poor' };
  return { label: 'Son derece kötü', tone: 'poor' };
}

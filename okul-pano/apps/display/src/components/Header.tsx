import { weatherInfo, type WeatherNow } from '@okulpano/shared/client';
import type { Connection } from '../hooks.ts';
import { SchoolIcon, WEATHER_ICONS, WifiOffIcon } from './Icons.tsx';

const timeFmt = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions, key: string) {
  const k = `${tz}|${key}`;
  let f = timeFmt.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('tr-TR', { timeZone: tz, ...opts });
    timeFmt.set(k, f);
  }
  return f;
}

interface Props {
  schoolName: string;
  logoUrl: string | null;
  timezone: string;
  now: Date;
  weather: WeatherNow | null;
  city: string | null;
  connection: Connection;
  lastUpdated: number | null;
}

export function Header({ schoolName, logoUrl, timezone, now, weather, city, connection, lastUpdated }: Props) {
  const hm = fmt(timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'hm').format(now);
  const sec = fmt(timezone, { second: '2-digit' }, 's').format(now).padStart(2, '0');
  const date = fmt(timezone, { day: 'numeric', month: 'long', year: 'numeric' }, 'date').format(now);
  const weekday = fmt(timezone, { weekday: 'long' }, 'wd').format(now);
  const info = weather ? weatherInfo(weather.weatherCode, weather.isDay) : null;
  const WeatherGlyph = info ? WEATHER_ICONS[info.icon] : null;

  return (
    <header className="header">
      <div className="header-weather">
        {weather && WeatherGlyph && info ? (
          <>
            <WeatherGlyph size={64} className="weather-icon" />
            <div>
              <div className="weather-temp">
                {weather.temperature}°<span className="weather-unit">C</span>
              </div>
              <div className="weather-meta">
                {info.label}
                {weather.high != null && weather.low != null && (
                  <span className="weather-range">
                    {' '}
                    · {weather.high}° / {weather.low}°
                  </span>
                )}
              </div>
              {(weather.city ?? city) && <div className="weather-city">{weather.city ?? city}</div>}
            </div>
          </>
        ) : (
          <div className="weather-meta muted">{city ?? 'Hava durumu'}</div>
        )}
      </div>

      <div className="header-school">
        {logoUrl ? <img src={logoUrl} alt="" className="school-logo" /> : <SchoolIcon size={56} className="school-logo-icon" />}
        <h1 className="school-name">{schoolName}</h1>
      </div>

      <div className="header-clock">
        <div className="clock">
          <span className="clock-hm">{hm}</span>
          <span className="clock-s">{sec}</span>
        </div>
        <div className="date">
          <span className="date-day">{date}</span>
          <span className="date-weekday">{weekday}</span>
        </div>
        {connection === 'offline' && (
          <div className="offline-chip" title="Sunucuya ulaşılamıyor; son kayıtlı veri gösteriliyor">
            <WifiOffIcon size={18} />
            Çevrimdışı
            {lastUpdated && (
              <span>
                · {fmt(timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'hm').format(new Date(lastUpdated))}
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

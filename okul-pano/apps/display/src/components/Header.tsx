import { splitSchoolName, weatherInfo, type WeatherNow } from '@okulpano/shared/client';
import type { Connection } from '../hooks.ts';
import { SchoolIcon, WEATHER_ICONS, WifiOffIcon } from './Icons.tsx';
import { SpecialMark } from './SpecialMark.tsx';

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
  /** Ayarlardaki okul türü; boşsa addan otomatik ayrılır */
  schoolType?: string;
  logoUrl: string | null;
  timezone: string;
  now: Date;
  weather: WeatherNow | null;
  city: string | null;
  connection: Connection;
  lastUpdated: number | null;
  /** O günün özel teması (millî bayram, 10 Kasım…): üst barın ortasında filigran */
  specialId?: string;
}

export function Header({ schoolName, schoolType, logoUrl, timezone, now, weather, city, connection, lastUpdated, specialId }: Props) {
  const hm = fmt(timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'hm').format(now);
  const sec = fmt(timezone, { second: '2-digit' }, 's').format(now).padStart(2, '0');
  const date = fmt(timezone, { day: 'numeric', month: 'long', year: 'numeric' }, 'date').format(now);
  const weekday = fmt(timezone, { weekday: 'long' }, 'wd').format(now);
  const info = weather ? weatherInfo(weather.weatherCode, weather.isDay) : null;
  const WeatherGlyph = info ? WEATHER_ICONS[info.icon] : null;
  const title = splitSchoolName(schoolName, schoolType);

  return (
    <header className="header">
      {specialId && <SpecialMark id={specialId} className="special-mark-header" />}
      <div className="header-school">
        <div className="school-badge">
          {logoUrl ? <img src={logoUrl} alt="" className="school-logo" /> : <SchoolIcon size={50} className="school-logo-icon" />}
        </div>
        <h1 className="school-title">
          <span className="school-name">{title.name}</span>
          {title.type && <span className="school-type">{title.type}</span>}
        </h1>
      </div>

      <div className="header-right">
        <div className="header-weather">
          {weather && WeatherGlyph && info ? (
            <>
              <WeatherGlyph size={58} className="weather-icon" />
              <div className="weather-text">
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
      </div>
    </header>
  );
}

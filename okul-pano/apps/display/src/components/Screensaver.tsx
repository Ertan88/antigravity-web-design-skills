import { splitSchoolName } from '@okulpano/shared/client';
import { SchoolIcon } from './Icons.tsx';

/** Ekran koruyucu her dakika yer değiştirir: aynı pikseller saatlerce yanıp ekranda iz bırakmasın */
const SPOTS = [
  [50, 50],
  [30, 35],
  [70, 62],
  [36, 68],
  [64, 34],
  [44, 42],
  [58, 58],
];

/** Gece / hafta sonu ekran koruyucusu: koyu zemin, büyük saat, tarih ve okul */
export function Screensaver({
  now,
  timezone,
  schoolName,
  schoolType,
  logoUrl,
}: {
  now: Date;
  timezone: string;
  schoolName: string;
  schoolType?: string;
  logoUrl: string | null;
}) {
  const title = splitSchoolName(schoolName, schoolType);
  const [x, y] = SPOTS[Math.floor(now.getTime() / 60_000) % SPOTS.length]!;
  const time = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(now);
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: timezone }).format(now);
  return (
    <div className="screensaver">
      <div className="screensaver-box" style={{ left: `${x}%`, top: `${y}%` }}>
        <div className="screensaver-time">{time}</div>
        <div className="screensaver-date">{date}</div>
        {/* Panonun üst barındaki gibi: logo, büyük okul adı ve altında okul türü */}
        <div className="screensaver-school">
          <div className="screensaver-badge">{logoUrl ? <img src={logoUrl} alt="" /> : <SchoolIcon size={40} />}</div>
          <div className="screensaver-title">
            <span className="screensaver-name">{title.name}</span>
            {title.type && <span className="screensaver-type">{title.type}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

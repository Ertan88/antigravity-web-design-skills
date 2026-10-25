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
export function Screensaver({ now, timezone, schoolName, logoUrl }: { now: Date; timezone: string; schoolName: string; logoUrl: string | null }) {
  const [x, y] = SPOTS[Math.floor(now.getTime() / 60_000) % SPOTS.length]!;
  const time = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(now);
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: timezone }).format(now);
  return (
    <div className="screensaver">
      <div className="screensaver-box" style={{ left: `${x}%`, top: `${y}%` }}>
        <div className="screensaver-time">{time}</div>
        <div className="screensaver-date">{date}</div>
        <div className="screensaver-school">
          {logoUrl ? <img src={logoUrl} alt="" /> : <SchoolIcon size={34} />}
          <span>{schoolName}</span>
        </div>
      </div>
    </div>
  );
}

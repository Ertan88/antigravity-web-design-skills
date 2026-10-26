import { formatDuration, splitSchoolName, type BellStatus, type DisplayFlash } from '@okulpano/shared/client';
import { describeBell } from './RightColumn.tsx';
import { AlertIcon, MegaphoneIcon, SchoolIcon } from './Icons.tsx';

/** Panoya anlık mesaj: üst şerit (gövdenin üstünde). Günün modu (kısaltılmış gün, sınav, zil kaydırma) da burada ince bir satırdır. */
export function FlashBanner({ items, day = null }: { items: DisplayFlash[]; day?: string | null }) {
  if (!items.length && !day) return null;
  return (
    <div className="flash-banner-stack" role="status">
      {day && <div className="day-strip">{day}</div>}
      {items.map((f) => (
        <div key={f.id} className={`flash-banner tone-${f.tone}`}>
          {f.tone === 'warning' ? <AlertIcon size={34} /> : <MegaphoneIcon size={34} />}
          <span>{f.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Panoya anlık mesaj: tam ekran (en yenisi); okul adı ve saat köşede */
export function FlashFullscreen({ flash, time }: { flash: DisplayFlash; time: string }) {
  return (
    <div className={`flash-full tone-${flash.tone}`} role="alert">
      <div className="flash-full-icon">{flash.tone === 'warning' ? <AlertIcon size={120} /> : <MegaphoneIcon size={120} />}</div>
      <div className="flash-full-text">{flash.text}</div>
      <div className="flash-full-time">{time}</div>
    </div>
  );
}

/** Tam ekran saat modu: büyük saat, tarih, zil durumu ve okul */
export function ClockScreen({
  now,
  timezone,
  bell,
  schoolName,
  schoolType,
  logoUrl,
  dayLabel,
}: {
  now: Date;
  timezone: string;
  bell: BellStatus;
  schoolName: string;
  schoolType?: string;
  logoUrl: string | null;
  dayLabel: string | null;
}) {
  const title = splitSchoolName(schoolName, schoolType);
  const time = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(now);
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: timezone }).format(now);
  const d = describeBell(bell);
  return (
    <div className="clock-screen">
      <div className="clock-screen-school">
        <div className="screensaver-badge">{logoUrl ? <img src={logoUrl} alt="" /> : <SchoolIcon size={40} />}</div>
        <div className="screensaver-title">
          <span className="screensaver-name">{title.name}</span>
          {title.type && <span className="screensaver-type">{title.type}</span>}
        </div>
      </div>
      <div className="clock-screen-time">{time}</div>
      <div className="clock-screen-date">{date}</div>
      <div className={`clock-screen-bell tone-${d.tone}`}>
        <span className="clock-screen-bell-title">{d.title}</span>
        {d.remaining != null && (
          <span>
            {d.caption} <b>{formatDuration(d.remaining)}</b>
          </span>
        )}
      </div>
      {dayLabel && <div className="clock-screen-day">{dayLabel}</div>}
    </div>
  );
}

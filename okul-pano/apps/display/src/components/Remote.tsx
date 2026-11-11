import { formatDuration, splitSchoolName, type BellStatus } from '@okulpano/shared/client';
import { describeBell, type BellDayContext } from './RightColumn.tsx';
import { AlertIcon, MegaphoneIcon, SchoolIcon } from './Icons.tsx';

/** Tam ekran saat modu: büyük saat, tarih, zil durumu ve okul */
export function ClockScreen({
  now,
  timezone,
  bell,
  day,
  schoolName,
  schoolType,
  logoUrl,
}: {
  now: Date;
  timezone: string;
  bell: BellStatus;
  day?: BellDayContext;
  schoolName: string;
  schoolType?: string;
  logoUrl: string | null;
}) {
  const title = splitSchoolName(schoolName, schoolType);
  const time = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(now);
  const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: timezone }).format(now);
  const d = describeBell(bell, day);
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
    </div>
  );
}

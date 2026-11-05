/** Okulun saat dilimine göre "duvar saati" hesapları. Cihaz saati yanlış ayarlı olsa bile doğru çalışır. */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  /** ISO hafta günü: 1 = Pazartesi ... 7 = Pazar */
  weekday: number;
  hour: number;
  minute: number;
  second: number;
  /** Gece yarısından bu yana geçen saniye */
  secondsOfDay: number;
  /** YYYY-MM-DD */
  isoDate: string;
  /** MM-DD */
  monthDay: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) parts[p.type] = p.value;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  return {
    year,
    month,
    day,
    weekday: WEEKDAYS[parts.weekday ?? 'Mon'] ?? 1,
    hour,
    minute,
    second,
    secondsOfDay: hour * 3600 + minute * 60 + second,
    isoDate: `${year}-${pad(month)}-${pad(day)}`,
    monthDay: `${pad(month)}-${pad(day)}`,
  };
}

/** "08:30" -> 30600 (gece yarısından itibaren saniye) */
export function parseClock(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`Geçersiz saat: ${value}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Geçersiz saat: ${value}`);
  return h * 3600 + min * 60;
}

export function formatClock(secondsOfDay: number): string {
  const h = Math.floor(secondsOfDay / 3600) % 24;
  const m = Math.floor((secondsOfDay % 3600) / 60);
  return `${pad(h)}:${pad(m)}`;
}

/** Kalan süreyi "MM:SS" ya da bir saati aşıyorsa "S:MM:SS" olarak biçimlendirir. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

export function countdown(targetMs: number, nowMs: number): CountdownParts {
  const diff = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  return {
    days: Math.floor(diff / 86400),
    hours: Math.floor((diff % 86400) / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
    done: diff === 0,
  };
}

/** Bugünden itibaren n günün MM-DD değerleri (doğum günü penceresi için). */
export function upcomingMonthDays(date: Date, timeZone: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(zonedParts(new Date(date.getTime() + i * 86400_000), timeZone).monthDay);
  }
  return out;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 29 Şubat doğumluları artık yıl olmayan yıllarda 28 Şubat'ta kutlanır. */
export function isBirthdayToday(birthMonthDay: string, today: ZonedParts): boolean {
  if (birthMonthDay === today.monthDay) return true;
  return birthMonthDay === '02-29' && today.monthDay === '02-28' && !isLeapYear(today.year);
}

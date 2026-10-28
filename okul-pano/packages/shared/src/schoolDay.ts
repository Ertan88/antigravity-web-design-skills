import { pickSchedule, sortPeriods, type BellScheduleLike, type Period } from './bell.ts';
import { formatClock, parseClock } from './time.ts';

/**
 * Okul günü hesabı: tatil, arife (yarım gün) ve köprü günleri.
 *
 * - Tam gün tatil (resmî / dini bayram ya da okulun eklediği tatil): zil çalmaz, ders yapılmaz.
 * - Arife: kamuda öğleden sonra tatildir (Ramazan, Kurban ve Cumhuriyet Bayramı arifesi). Dersler okulun
 *   belirlediği saatte (varsayılan 13:00) biter; o saatten sonra başlayan dersler yapılmaz, taşan ders o saatte biter.
 *   Okul arifeyi tam gün tatil saymak isterse aynı güne kendi tatilini ekler.
 * - Köprü günü: bayrama bitişik, hafta sonuyla arasında kalan 1–2 iş günü. Hükümet idari izin ilan edebilir;
 *   kesin olmadığı için kendiliğinden tatil sayılmaz, okula "tatil olarak işaretle" önerisi olarak sunulur.
 */

export interface DayHoliday {
  date: string;
  name: string;
}

/** Arifede derslerin bittiği varsayılan saat (kamuda arife 13.00'ten itibaren tatildir) */
export const HALF_DAY_END_DEFAULT = '13:00';

/** Yarım günde kısalan dersin bu süreden kısa kalan kısmı yapılmaz (dakika) */
const MIN_CLIPPED_MIN = 20;

/** ISO hafta günü (1 = Pazartesi … 7 = Pazar) */
export const isoWeekday = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

export const addIsoDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Yarım günde yapılan dersler: bitiş saatinden önce başlayanlar; taşan ders bitiş saatinde biter */
export function halfDayPeriods(periods: readonly Period[], end: string): Period[] {
  const limit = parseClock(end);
  return sortPeriods(periods).flatMap((p) => {
    const start = parseClock(p.start);
    if (start >= limit) return [];
    const stop = Math.min(parseClock(p.end), limit);
    const clipped = stop < parseClock(p.end);
    if (clipped && stop - start < MIN_CLIPPED_MIN * 60) return [];
    return [clipped ? { ...p, end: formatClock(stop) } : p];
  });
}

export interface SchoolDay {
  date: string;
  weekday: number;
  /** Tam gün tatil adı */
  holiday: string | null;
  /** Arife (yarım gün) adı */
  halfDay: string | null;
  /** O gün çalan ders saatleri: tatilde boş, arifede kısaltılmış */
  periods: Period[];
  /** Arifede derslerin bittiği saat */
  endsAt: string | null;
}

export interface SchoolCalendar<T extends BellScheduleLike = BellScheduleLike> {
  schedules: readonly T[];
  holidays: readonly DayHoliday[];
  halfDays: readonly DayHoliday[];
  /** Arifede derslerin bittiği saat (SS:DD) */
  halfDayEnd?: string;
}

/** Bir günün okul planı: tatil mi, yarım gün mü, hangi ders saatleri çalar */
export function schoolDay(date: string, cal: SchoolCalendar): SchoolDay {
  const weekday = isoWeekday(date);
  const holiday = cal.holidays.find((h) => h.date === date)?.name ?? null;
  const halfDay = holiday ? null : (cal.halfDays.find((h) => h.date === date)?.name ?? null);
  const schedule = holiday ? null : pickSchedule(cal.schedules, weekday);
  const end = cal.halfDayEnd || HALF_DAY_END_DEFAULT;
  const periods = schedule ? (halfDay ? halfDayPeriods(schedule.periods, end) : sortPeriods(schedule.periods)) : [];
  return { date, weekday, holiday, halfDay, periods, endsAt: halfDay ? end : null };
}

/** Bugünden sonraki ilk ders günü (tatil ve hafta sonu atlanır); `withinDays` içinde yoksa null */
export function nextSchoolDay(after: string, cal: SchoolCalendar, withinDays = 21): SchoolDay | null {
  for (let i = 1; i <= withinDays; i++) {
    const day = schoolDay(addIsoDays(after, i), cal);
    if (day.periods.length) return day;
  }
  return null;
}

export interface BridgeDay {
  date: string;
  /** Bitişik tatil (ör. "Kurban Bayramı 4. Gün") */
  near: string;
}

/**
 * Olası köprü günleri: bir tatil ile hafta sonu (ya da başka bir tatil) arasında kalan en çok 2 iş günü.
 * Arife bu günlerin içinde sayılır (yarım gün çalışılır). `holidays` aralığın birkaç gün öncesini ve sonrasını da kapsamalı.
 */
export function bridgeDays(from: string, to: string, holidays: readonly DayHoliday[]): BridgeDay[] {
  const full = new Map(holidays.map((h) => [h.date, h.name]));
  const off = (d: string) => isoWeekday(d) >= 6 || full.has(d);
  const out: BridgeDay[] = [];
  let d = addIsoDays(from, -3);
  const stop = addIsoDays(to, 3);
  while (d <= stop) {
    if (off(d)) {
      d = addIsoDays(d, 1);
      continue;
    }
    const run: string[] = [];
    while (!off(d) && run.length < 3) {
      run.push(d);
      d = addIsoDays(d, 1);
    }
    const before = addIsoDays(run[0]!, -1);
    const after = d;
    if (run.length <= 2 && off(before) && off(after)) {
      // "Kurban Bayramı 4. Gün" -> "Kurban Bayramı"
      const near = (full.get(before) ?? full.get(after))?.replace(/ \d+\. Gün$/, '');
      if (near) for (const x of run) if (x >= from && x <= to) out.push({ date: x, near });
    }
    // Uzun iş günü dizisinin geri kalanını atla
    while (d <= stop && !off(d)) d = addIsoDays(d, 1);
  }
  return out;
}

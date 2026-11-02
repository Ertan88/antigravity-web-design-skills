import { formatClock, parseClock } from './time.ts';

/** Bir ders saati. `no`, ders programı kayıtlarının bağlandığı kalıcı numaradır. */
export interface Period {
  no: number;
  start: string;
  end: string;
  label?: string | null;
}

/** İkili öğretimde vardiya; tekli öğretimde her şey sabahçı sayılır */
export type Shift = 'morning' | 'afternoon';

export interface BellScheduleLike {
  id: string;
  name: string;
  /**
   * Bu düzenin elle sabitlendiği günler (ör. Cuma düzeni). Boşsa düzen otomatiktir: günün ders sayısına göre seçilir.
   * ISO hafta günleri: 1 = Pazartesi ... 7 = Pazar
   */
  weekdays: number[];
  periods: Period[];
  sortOrder?: number;
  /** "N derslik gün": günün ders sayısı N olduğunda seçilir; boşsa ders saati sayısı */
  lessonCount?: number | null;
  /** İkili öğretimde hangi vardiyanın zili (boş: sabahçı) */
  shift?: Shift | null;
}

export const scheduleShift = (s: Pick<BellScheduleLike, 'shift'>): Shift => (s.shift === 'afternoon' ? 'afternoon' : 'morning');
export const scheduleLessonCount = (s: Pick<BellScheduleLike, 'lessonCount' | 'periods'>) => s.lessonCount ?? s.periods.length;

export type BellStatus =
  | { kind: 'off' }
  | { kind: 'before'; next: Period; remainingSec: number }
  | { kind: 'lesson'; period: Period; next: Period | null; remainingSec: number; totalSec: number }
  | { kind: 'break'; isLunch: boolean; prev: Period; next: Period; remainingSec: number; totalSec: number }
  | { kind: 'after'; last: Period };

export function periodLabel(p: Period): string {
  return p.label?.trim() || `${p.no}. Ders`;
}

export function sortPeriods(periods: readonly Period[]): Period[] {
  return [...periods].sort((a, b) => parseClock(a.start) - parseClock(b.start));
}

/**
 * Bir günün zil düzeni (okulda tek zil çalar; zil günün ders sayısına göre değişir):
 * 1. O gün için elle sabitlenmiş düzen varsa o (ör. Cuma düzeni; daha az gün kapsayan önce).
 * 2. Yoksa otomatik düzenlerden günün ders sayısına uyan: tam eşleşen, yoksa bir büyüğü, o da yoksa en büyüğü.
 * `lessonCount` 0 ise o gün ders yoktur (zil çalmaz); bilinmiyorsa (ders programı yok) hafta içi ilk otomatik düzen.
 */
export function pickSchedule<T extends BellScheduleLike>(
  schedules: readonly T[],
  weekday: number,
  opts?: { shift?: Shift | null; lessonCount?: number | null },
): T | null {
  const shift = opts?.shift === 'afternoon' ? 'afternoon' : 'morning';
  const pool = schedules.filter((s) => s.periods.length > 0 && scheduleShift(s) === shift);
  const order = (a: T, b: T) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  const fixed = pool.filter((s) => s.weekdays.includes(weekday)).sort((a, b) => a.weekdays.length - b.weekdays.length || order(a, b));
  if (fixed[0]) return fixed[0];
  const auto = pool.filter((s) => !s.weekdays.length);
  if (!auto.length) return null;
  const n = opts?.lessonCount;
  if (n === 0) return null;
  if (n == null) return weekday <= 5 ? ([...auto].sort(order)[0] ?? null) : null;
  const bySize = [...auto].sort((a, b) => scheduleLessonCount(a) - scheduleLessonCount(b) || order(a, b));
  return bySize.find((s) => scheduleLessonCount(s) >= n) ?? bySize[bySize.length - 1]!;
}

/**
 * Zil durumunu hesaplar. İki ders arasındaki boşluk `lunchThresholdMin` dakikadan
 * uzunsa öğle arası, değilse teneffüs kabul edilir.
 */
export function computeBellStatus(
  periods: readonly Period[],
  secondsOfDay: number,
  lunchThresholdMin = 30,
): BellStatus {
  const sorted = sortPeriods(periods);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return { kind: 'off' };

  const firstStart = parseClock(first.start);
  if (secondsOfDay < firstStart) {
    return { kind: 'before', next: first, remainingSec: firstStart - secondsOfDay };
  }

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    const start = parseClock(p.start);
    const end = parseClock(p.end);
    if (secondsOfDay >= start && secondsOfDay < end) {
      return {
        kind: 'lesson',
        period: p,
        next: sorted[i + 1] ?? null,
        remainingSec: end - secondsOfDay,
        totalSec: end - start,
      };
    }
    const next = sorted[i + 1];
    if (next) {
      const nextStart = parseClock(next.start);
      if (secondsOfDay >= end && secondsOfDay < nextStart) {
        const totalSec = nextStart - end;
        return {
          kind: 'break',
          isLunch: totalSec >= lunchThresholdMin * 60,
          prev: p,
          next,
          remainingSec: nextStart - secondsOfDay,
          totalSec,
        };
      }
    }
  }
  return { kind: 'after', last };
}

export interface GeneratePeriodsOptions {
  firstStart: string;
  lessonMin: number;
  breakMin: number;
  count: number;
  /** Bu dersten sonra öğle arası verilir (ör. 4). Boşsa öğle arası yok. */
  lunchAfter?: number | null;
  lunchMin?: number;
  /** Öğle arasından sonraki teneffüsler (dk); boşsa sabahki teneffüs süresi */
  afternoonBreakMin?: number | null;
}

/** "08:30'da başla, 40 dk ders, 10 dk teneffüs, 4. dersten sonra 45 dk öğle arası" gibi kuralla çizelge üretir. */
export function generatePeriods(o: GeneratePeriodsOptions): Period[] {
  const periods: Period[] = [];
  let t = parseClock(o.firstStart);
  for (let no = 1; no <= o.count; no++) {
    const end = t + o.lessonMin * 60;
    if (end >= 24 * 3600) break;
    periods.push({ no, start: formatClock(t), end: formatClock(end) });
    const afterLunch = Boolean(o.lunchAfter && no > o.lunchAfter);
    const gap =
      o.lunchAfter && no === o.lunchAfter ? (o.lunchMin ?? 45) : afterLunch && o.afternoonBreakMin != null ? o.afternoonBreakMin : o.breakMin;
    t = end + gap * 60;
  }
  return periods;
}

/** Çakışan ya da başlangıcı bitişinden sonra olan dersleri yakalar. Sorun yoksa null döner. */
export function validatePeriods(periods: readonly Period[]): string | null {
  const nos = new Set<number>();
  for (const p of periods) {
    if (nos.has(p.no)) return `${p.no} numaralı ders birden fazla kez tanımlanmış.`;
    nos.add(p.no);
    let s: number;
    let e: number;
    try {
      s = parseClock(p.start);
      e = parseClock(p.end);
    } catch {
      return `${periodLabel(p)} için saat biçimi geçersiz (SS:DD olmalı).`;
    }
    if (e <= s) return `${periodLabel(p)}: bitiş saati başlangıçtan sonra olmalı.`;
  }
  const sorted = sortPeriods(periods);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (parseClock(cur.start) < parseClock(prev.end)) {
      return `${periodLabel(prev)} ile ${periodLabel(cur)} çakışıyor.`;
    }
  }
  return null;
}

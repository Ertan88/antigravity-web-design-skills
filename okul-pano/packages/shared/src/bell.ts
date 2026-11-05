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
  /**
   * Sınıfa özel düzen: yalnızca bu sınıflar için ve sınıfın o günkü ders sayısı düzenin ders sayısına eşitse
   * (ya da düzen o güne sabitlenmişse) çalar. Boşsa okul geneli düzendir.
   */
  classIds?: string[] | null;
}

/** Sınıfa özel düzen mi (okul geneli seçime katılmaz) */
export const isClassSchedule = (s: Pick<BellScheduleLike, 'classIds'>) => Boolean(s.classIds?.length);

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
  // Sınıfa özel düzenler okul genelinin zilini belirlemez (bkz. schoolDay)
  const pool = schedules.filter((s) => s.periods.length > 0 && scheduleShift(s) === shift && !isClassSchedule(s));
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
 * Öğle arası: günün en uzun arası; eşikten (`lunchThresholdMin`) kısa değilse ve öteki aralardan uzunsa. Bütün aralar
 * aynı uzunluktaysa (eşik teneffüs süresine eşit ya da altında girilmiş olsa bile) öğle arası yoktur; günde en çok bir
 * öğle arası olur. Döner: öğle arasından sonraki dersin saate göre sıralı listedeki yeri; yoksa -1.
 */
export function lunchIndex(periods: readonly Period[], lunchThresholdMin = 30): number {
  const sorted = sortPeriods(periods);
  const gaps = sorted.slice(1).map((p, i) => parseClock(p.start) - parseClock(sorted[i]!.end));
  if (!gaps.length) return -1;
  const max = Math.max(...gaps);
  const min = Math.min(...gaps);
  if (max < lunchThresholdMin * 60 || (gaps.length > 1 && max <= min)) return -1;
  return gaps.indexOf(max) + 1;
}

/** Öğle arasından sonraki dersin numarası (yoksa null): parça parça çizilen listelerde aranın öğle olup olmadığı için */
export function lunchBeforeNo(periods: readonly Period[], lunchThresholdMin = 30): number | null {
  const i = lunchIndex(periods, lunchThresholdMin);
  return i < 0 ? null : sortPeriods(periods)[i]!.no;
}

/**
 * Zil durumunu hesaplar. İki ders arasındaki boşluk günün öğle arasıysa (bkz. `lunchIndex`) öğle arası, değilse
 * teneffüs kabul edilir.
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

  const lunchAt = lunchIndex(sorted, lunchThresholdMin);
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
          isLunch: i + 1 === lunchAt,
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

/*
 * Elle müdahale yardımcıları: bir günün saatlerini düzeni değiştirmeden dönüştürür (panelde "Bu günü düzenle").
 * Hepsi yeni dizi döndürür; saatler gün içinde kalır.
 */

const DAY_MAX = 23 * 3600 + 59 * 60;
const moveClock = (hm: string, deltaMin: number) => formatClock(Math.min(DAY_MAX, Math.max(0, parseClock(hm) + deltaMin * 60)));

/** `fromNo` numaralı dersten (dahil) sonraki bütün dersleri `deltaMin` dakika kaydırır */
export function shiftPeriods(periods: readonly Period[], fromNo: number, deltaMin: number): Period[] {
  const sorted = sortPeriods(periods);
  const at = sorted.findIndex((p) => p.no === fromNo);
  if (at < 0 || !deltaMin) return sorted;
  return sorted.map((p, i) => (i >= at ? { ...p, start: moveClock(p.start, deltaMin), end: moveClock(p.end, deltaMin) } : p));
}

/** `afterNo` numaralı dersten sonraki arayı `gapMin` dakika yapar; sonraki dersler buna göre kayar */
export function setGapAfter(periods: readonly Period[], afterNo: number, gapMin: number): Period[] {
  const sorted = sortPeriods(periods);
  const i = sorted.findIndex((p) => p.no === afterNo);
  const next = sorted[i + 1];
  if (i < 0 || !next) return sorted;
  const current = (parseClock(next.start) - parseClock(sorted[i]!.end)) / 60;
  return shiftPeriods(sorted, next.no, Math.max(0, gapMin) - current);
}

/** Bir dersin süresini değiştirir (bitişi kayar); sonraki dersler aynı miktarda kayar */
export function setLessonLength(periods: readonly Period[], no: number, lessonMin: number): Period[] {
  const sorted = sortPeriods(periods);
  const i = sorted.findIndex((p) => p.no === no);
  if (i < 0) return sorted;
  const p = sorted[i]!;
  const delta = Math.max(5, lessonMin) - (parseClock(p.end) - parseClock(p.start)) / 60;
  const moved = sorted.map((x, j) => (j === i ? { ...x, end: moveClock(x.end, delta) } : j > i ? { ...x, start: moveClock(x.start, delta), end: moveClock(x.end, delta) } : x));
  return moved;
}

/**
 * Kısaltılmış gün: ilk ders aynı saatte başlar; her ders `lessonMin`, teneffüsler `breakMin` dakika olur, öğle arası
 * (bkz. `lunchIndex`) aynı süresiyle korunur.
 */
export function compressDay(periods: readonly Period[], lessonMin: number, breakMin: number, lunchThresholdMin = 30): Period[] {
  const sorted = sortPeriods(periods);
  if (!sorted.length) return sorted;
  let t = parseClock(sorted[0]!.start);
  const lunchAt = lunchIndex(sorted, lunchThresholdMin);
  return sorted.map((p, i) => {
    if (i > 0) {
      const gap = parseClock(p.start) - parseClock(sorted[i - 1]!.end);
      t += i === lunchAt ? gap : breakMin * 60;
    }
    const out = { ...p, start: formatClock(Math.min(DAY_MAX, t)), end: formatClock(Math.min(DAY_MAX, t + lessonMin * 60)) };
    t += lessonMin * 60;
    return out;
  });
}

/** Erken bitir: `lastNo` numaralı dersten sonrası yapılmaz */
export function endAfter(periods: readonly Period[], lastNo: number): Period[] {
  const sorted = sortPeriods(periods);
  const i = sorted.findIndex((p) => p.no === lastNo);
  return i < 0 ? sorted : sorted.slice(0, i + 1);
}

/**
 * Zili şimdi çal: o anki ders `now` (SS:DD) saatinde biter, sonraki dersler aynı miktarda öne alınır (teneffüs
 * süreleri korunur). Teneffüsteyse sıradaki ders hemen başlar. Ders dışında bir şey değişmez.
 */
export function ringNow(periods: readonly Period[], now: string): Period[] {
  const sorted = sortPeriods(periods);
  const t = parseClock(now);
  const cur = sorted.findIndex((p) => parseClock(p.start) <= t && t < parseClock(p.end));
  if (cur >= 0) {
    const delta = (t - parseClock(sorted[cur]!.end)) / 60;
    return sorted.map((p, i) => (i === cur ? { ...p, end: formatClock(t) } : i > cur ? { ...p, start: moveClock(p.start, delta), end: moveClock(p.end, delta) } : p));
  }
  const next = sorted.findIndex((p, i) => i > 0 && parseClock(sorted[i - 1]!.end) <= t && t < parseClock(p.start));
  if (next < 0) return sorted;
  return shiftPeriods(sorted, sorted[next]!.no, (t - parseClock(sorted[next]!.start)) / 60);
}

import { isClassSchedule, pickSchedule, scheduleLessonCount, scheduleShift, sortPeriods, type BellScheduleLike, type Period, type Shift } from './bell.ts';
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
  /** O gün çalan ders saatleri: tatilde boş, arifede kısaltılmış, elle değiştirildiyse o günün saatleri */
  periods: Period[];
  /** Arifede derslerin bittiği saat */
  endsAt: string | null;
  /** Seçilen düzen */
  scheduleId?: string | null;
  /** Günün ders sayısı (okul geneli; sınıfa özel zile geçen sınıflar sayılmaz) */
  lessonCount?: number | null;
  /** Düzenden gelen saatler (elle değiştirilmeden önce) */
  basePeriods?: Period[];
  /** O gün için saatler elle değiştirildi */
  overridden?: boolean;
  overrideNote?: string | null;
}

/** Sınıfın zil hesabına girdisi: vardiyası, zil hesabına katılıp katılmadığı ve her hafta günü son ders numarası */
export interface BellClass {
  id: string;
  name?: string;
  bellExempt?: boolean | null;
  shift?: Shift | null;
  /** Hafta günü (1–7) → o gün son dersin numarası */
  counts: Record<number, number>;
}

/** Bir günün zil saatlerine elle müdahale: yalnızca o tarih ve o zil için geçerli */
export interface BellOverrideLike {
  date: string;
  /** Hangi zil: `school:<vardiya>` (okul geneli) ya da `schedule:<düzen id>` (sınıfa özel düzen) */
  target: string;
  periods: Period[];
  note?: string | null;
}

export const schoolTarget = (shift?: Shift | null) => `school:${shift === 'afternoon' ? 'afternoon' : 'morning'}`;
export const scheduleTarget = (id: string) => `schedule:${id}`;

export interface SchoolCalendar<T extends BellScheduleLike = BellScheduleLike> {
  schedules: readonly T[];
  holidays: readonly DayHoliday[];
  halfDays: readonly DayHoliday[];
  /** Arifede derslerin bittiği saat (SS:DD) */
  halfDayEnd?: string;
  /**
   * Günün ders sayısı (vardiya ve hafta gününe göre, `lessonCountKey`): o gün en geç biten sınıfın son dersi.
   * Verilmezse ders programı yok sayılır. `bellClasses` verilirse ondan hesaplanır.
   */
  lessonCounts?: Record<string, number> | null;
  /** Sınıfların ders sayıları: sınıfa özel düzenler ve okul geneli ders sayısı bundan hesaplanır */
  bellClasses?: readonly BellClass[] | null;
  /** Elle müdahaleler (tarih ve zile göre) */
  overrides?: readonly BellOverrideLike[] | null;
  /** İkili öğretim (sınıfların vardiyası dikkate alınır) */
  dualShift?: boolean;
}

export const lessonCountKey = (shift: Shift | null | undefined, weekday: number) => `${shift === 'afternoon' ? 'afternoon' : 'morning'}:${weekday}`;

const classShiftOf = (c: Pick<BellClass, 'shift'> | undefined, dual: boolean | undefined): Shift => (dual && c?.shift === 'afternoon' ? 'afternoon' : 'morning');

/**
 * Sınıfa özel düzenlerin o gün hangi sınıflara uyduğu: düzen bir güne sabitlenmişse o gün dersi olan seçili sınıflar,
 * değilse o gün ders sayısı düzenin ders sayısına eşit olan seçili sınıflar. Bir sınıf en fazla bir düzene geçer.
 */
export function classAssignments<T extends BellScheduleLike>(cal: SchoolCalendar<T>, weekday: number, shift?: Shift | null): Map<string, T> {
  const out = new Map<string, T>();
  if (!cal.bellClasses?.length) return out;
  const want = shift === 'afternoon' ? 'afternoon' : 'morning';
  const byId = new Map(cal.bellClasses.map((c) => [c.id, c]));
  const pool = cal.schedules
    .filter((s) => isClassSchedule(s) && s.periods.length > 0 && scheduleShift(s) === want)
    .sort((a, b) => Number(Boolean(b.weekdays.length)) - Number(Boolean(a.weekdays.length)) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const s of pool) {
    for (const id of s.classIds ?? []) {
      const c = byId.get(id);
      if (!c || out.has(id) || classShiftOf(c, cal.dualShift) !== want) continue;
      const n = c.counts[weekday] ?? 0;
      if (!n) continue;
      if (s.weekdays.length ? s.weekdays.includes(weekday) : n === scheduleLessonCount(s)) out.set(id, s);
    }
  }
  return out;
}

/** Okul geneli zilin ders sayısı: sınıfa özel zile geçenler ve zil hesabına katılmayanlar dışındaki en geç biten sınıf */
function schoolLessonCount(cal: SchoolCalendar, weekday: number, shift: Shift | null | undefined, assigned: Map<string, unknown>): number | null {
  if (cal.bellClasses) {
    const want = shift === 'afternoon' ? 'afternoon' : 'morning';
    let max = 0;
    for (const c of cal.bellClasses) {
      if (c.bellExempt || assigned.has(c.id) || classShiftOf(c, cal.dualShift) !== want) continue;
      max = Math.max(max, c.counts[weekday] ?? 0);
    }
    return max;
  }
  return cal.lessonCounts ? (cal.lessonCounts[lessonCountKey(shift, weekday)] ?? 0) : null;
}

/** Okul geneli ders sayıları ("<vardiya>:<gün>"), sınıfa özel zile geçen sınıflar hariç (eksik düzen uyarısı için) */
export function schoolLessonCounts(cal: SchoolCalendar): Record<string, number> | null {
  if (!cal.bellClasses) return cal.lessonCounts ?? null;
  const out: Record<string, number> = {};
  for (const shift of cal.dualShift ? (['morning', 'afternoon'] as const) : (['morning'] as const))
    for (let d = 1; d <= 7; d++) {
      const n = schoolLessonCount(cal, d, shift, classAssignments(cal, d, shift));
      if (n) out[lessonCountKey(shift, d)] = n;
    }
  return out;
}

const overrideFor = (cal: SchoolCalendar, date: string, target: string) => cal.overrides?.find((o) => o.date === date && o.target === target && o.periods.length) ?? null;

/** Bir günün okul planı: tatil mi, yarım gün mü, hangi ders saatleri çalar (okul geneli zil; ikili öğretimde vardiyanın zili) */
export function schoolDay(date: string, cal: SchoolCalendar, shift?: Shift | null): SchoolDay {
  const weekday = isoWeekday(date);
  const holiday = cal.holidays.find((h) => h.date === date)?.name ?? null;
  const halfDay = holiday ? null : (cal.halfDays.find((h) => h.date === date)?.name ?? null);
  const count = schoolLessonCount(cal, weekday, shift, classAssignments(cal, weekday, shift));
  const schedule = holiday ? null : pickSchedule(cal.schedules, weekday, { shift, lessonCount: count });
  const end = cal.halfDayEnd || HALF_DAY_END_DEFAULT;
  // Zil, o gün en geç biten sınıfın son dersinde biter
  const base = schedule ? sortPeriods(schedule.periods).filter((p) => !count || p.no <= count) : [];
  const basePeriods = halfDay ? halfDayPeriods(base, end) : base;
  const override = holiday ? null : overrideFor(cal, date, schoolTarget(shift));
  return {
    date,
    weekday,
    holiday,
    halfDay,
    periods: override ? sortPeriods(override.periods) : basePeriods,
    endsAt: halfDay ? end : null,
    scheduleId: schedule?.id ?? null,
    lessonCount: count,
    basePeriods,
    overridden: Boolean(override),
    overrideNote: override?.note ?? null,
  };
}

/** Bir günde çalan zillerden biri: okul geneli (vardiya başına) ya da sınıfa özel düzen */
export interface DayBell {
  target: string;
  shift: Shift;
  scheduleId: string | null;
  /** Sınıfa özel zilin sınıfları; okul geneli zilde null (diğer bütün sınıflar) */
  classIds: string[] | null;
  /** O gün çalan saatler (elle değiştirildiyse onlar) */
  periods: Period[];
  /** Düzenden gelen saatler */
  basePeriods: Period[];
  lessonCount: number | null;
  overridden: boolean;
  note: string | null;
}

/** Bir günün bütün zilleri: okul geneli ve o gün devreye giren sınıfa özel düzenler (tatilde boş) */
export function dayBells(date: string, cal: SchoolCalendar): DayBell[] {
  const weekday = isoWeekday(date);
  const out: DayBell[] = [];
  for (const shift of cal.dualShift ? (['morning', 'afternoon'] as const) : (['morning'] as const)) {
    const day = schoolDay(date, cal, shift);
    if (day.holiday) return [];
    out.push({
      target: schoolTarget(shift),
      shift,
      scheduleId: day.scheduleId ?? null,
      classIds: null,
      periods: day.periods,
      basePeriods: day.basePeriods ?? day.periods,
      lessonCount: day.lessonCount ?? null,
      overridden: Boolean(day.overridden),
      note: day.overrideNote ?? null,
    });
    const groups = new Map<string, { schedule: BellScheduleLike; ids: string[] }>();
    for (const [id, s] of classAssignments(cal, weekday, shift)) {
      const g = groups.get(s.id) ?? { schedule: s, ids: [] };
      g.ids.push(id);
      groups.set(s.id, g);
    }
    const end = cal.halfDayEnd || HALF_DAY_END_DEFAULT;
    for (const { schedule, ids } of groups.values()) {
      const n = Math.max(0, ...ids.map((id) => cal.bellClasses?.find((c) => c.id === id)?.counts[weekday] ?? 0));
      const base = sortPeriods(schedule.periods).filter((p) => !n || p.no <= n);
      const basePeriods = day.halfDay ? halfDayPeriods(base, end) : base;
      const override = overrideFor(cal, date, scheduleTarget(schedule.id));
      out.push({
        target: scheduleTarget(schedule.id),
        shift,
        scheduleId: schedule.id,
        classIds: ids,
        periods: override ? sortPeriods(override.periods) : basePeriods,
        basePeriods,
        lessonCount: n,
        overridden: Boolean(override),
        note: override?.note ?? null,
      });
    }
  }
  return out;
}

/** Bir sınıfın o günkü zili: sınıfa özel düzene geçtiyse o, değilse vardiyasının okul geneli zili */
export function classBell(bells: readonly DayBell[], classId: string | null | undefined, shift?: Shift | null): DayBell | null {
  return (classId ? bells.find((b) => b.classIds?.includes(classId)) : null) ?? bells.find((b) => b.target === schoolTarget(shift)) ?? null;
}

/** Bugünden sonraki ilk ders günü (tatil ve hafta sonu atlanır); `withinDays` içinde yoksa null */
export function nextSchoolDay(after: string, cal: SchoolCalendar, withinDays = 21, shift?: Shift | null): SchoolDay | null {
  for (let i = 1; i <= withinDays; i++) {
    const day = schoolDay(addIsoDays(after, i), cal, shift);
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


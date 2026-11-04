import { computeBellStatus, scheduleLessonCount, type BellScheduleLike, type Period, type Shift } from './bell.ts';
import { classBell, dayBells, isoWeekday, lessonCountKey, schoolDay, type BellClass, type DayBell, type SchoolCalendar } from './schoolDay.ts';
import { parseClock } from './time.ts';

/*
 * Zil düzeni: okul geneli zil o günün ders sayısına göre değişir; sınıfa özel düzenler (ör. 12. sınıfların 11 dersli
 * günü) yalnızca seçili sınıflar için, ders sayıları tutan günlerde çalar. Hiçbir saat ya da ders sayısı
 * sabit değildir: okul "N derslik gün" düzenlerini tanımlar, sistem her gün ders programına bakıp uyanı seçer.
 * İkili öğretimde her vardiyanın (sabahçı / öğlenci) ders sayısı ve zili ayrıdır.
 */

export interface ClassBell {
  id: string;
  name?: string;
  /** Zil hesabına katılmaz: günün ders sayısını belirlemez (ör. özel eğitim); zil onun için de aynı çalar */
  bellExempt?: boolean | null;
  /** İkili öğretimde vardiyası */
  shift?: Shift | null;
}

export const classShift = (cls: Pick<ClassBell, 'shift'> | undefined | null, dualShift: boolean): Shift =>
  dualShift && cls?.shift === 'afternoon' ? 'afternoon' : 'morning';

/**
 * Günün ders sayısı (vardiya ve hafta gününe göre): o gün en geç biten sınıfın son ders numarası. Zil hesabına
 * katılmayan sınıflar sayılmaz.
 */
export function lessonCounts(
  entries: readonly { weekday: number; periodNo: number; classId?: string | null; classGroupId?: string }[],
  classes: readonly ClassBell[],
  dualShift: boolean,
): Record<string, number> {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const out: Record<string, number> = {};
  for (const e of entries) {
    const cls = byId.get(e.classId ?? e.classGroupId ?? '');
    if (cls?.bellExempt) continue;
    const key = lessonCountKey(classShift(cls, dualShift), e.weekday);
    out[key] = Math.max(out[key] ?? 0, e.periodNo);
  }
  return out;
}

/** Sınıfların her hafta günü son ders numarası (sınıfa özel zil ve okul geneli ders sayısı için); program yoksa null */
export function bellClassDays(
  entries: readonly { weekday: number; periodNo: number; classId?: string | null; classGroupId?: string | null }[],
  classes: readonly ClassBell[],
): BellClass[] | null {
  if (!entries.length) return null;
  const counts = new Map<string, Record<number, number>>();
  for (const e of entries) {
    const id = e.classId ?? e.classGroupId;
    if (!id) continue;
    const c = counts.get(id) ?? {};
    c[e.weekday] = Math.max(c[e.weekday] ?? 0, e.periodNo);
    counts.set(id, c);
  }
  return classes.map((c) => ({ id: c.id, name: c.name, bellExempt: c.bellExempt ?? false, shift: c.shift ?? null, counts: counts.get(c.id) ?? {} }));
}

/** Sınıfları o gün en geç bitenler (gün kartındaki "en geç biten" bilgisi için) */
export function latestClasses(
  entries: readonly { weekday: number; periodNo: number; classGroupId: string }[],
  classes: readonly ClassBell[],
  dualShift: boolean,
  weekday: number,
  shift: Shift,
): string[] {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const last = new Map<string, number>();
  for (const e of entries) {
    const cls = byId.get(e.classGroupId);
    if (e.weekday !== weekday || !cls || cls.bellExempt || classShift(cls, dualShift) !== shift) continue;
    last.set(cls.id, Math.max(last.get(cls.id) ?? 0, e.periodNo));
  }
  const max = Math.max(0, ...last.values());
  return [...last].filter(([, n]) => n === max && max > 0).map(([id]) => id);
}

/** Şu anki (teneffüste ya da ilk dersten önce sıradaki) ders numarası */
function currentNo(periods: readonly Period[], secondsOfDay: number, lunchThresholdMin: number): number | null {
  if (!periods.length) return null;
  const bell = computeBellStatus(periods, secondsOfDay, lunchThresholdMin);
  const p = bell.kind === 'lesson' ? bell.period : bell.kind === 'break' || bell.kind === 'before' ? bell.next : null;
  return p?.no ?? null;
}

/** Şu an derste olan kayıtlar: her sınıf kendi zilinin o anki dersine göre; ikili öğretimde o saatteki vardiya */
export function lessonsNow<E extends { weekday: number; periodNo: number; classId?: string | null }>(
  entries: readonly E[],
  date: string,
  cal: SchoolCalendar,
  classes: readonly ClassBell[],
  dualShift: boolean,
  secondsOfDay: number,
  lunchThresholdMin = 30,
): E[] {
  const weekday = isoWeekday(date);
  const byId = new Map(classes.map((c) => [c.id, c]));
  const c = { ...cal, dualShift };
  // İkili öğretimde yalnızca o saatteki vardiya (sabah öğlenci sınıflar "sıradaki ders" olarak görünmez)
  const active = boardBell(date, c, dualShift, secondsOfDay);
  const bells = dayBells(date, c);
  const nos = new Map<string, number | null>();
  const noOf = (b: DayBell | null) => {
    if (!b) return null;
    if (!nos.has(b.target)) nos.set(b.target, currentNo(b.periods, secondsOfDay, lunchThresholdMin));
    return nos.get(b.target)!;
  };
  return entries.filter((e) => {
    if (e.weekday !== weekday) return false;
    const shift = classShift(byId.get(e.classId ?? ''), dualShift);
    if (shift !== active.shift) return false;
    return noOf(classBell(bells, e.classId, shift)) === e.periodNo;
  });
}

/** Panoda ana zilin yanında gösterilecek diğer ziller (aynı vardiyada o gün çalan sınıfa özel düzenler) */
export function otherBells(date: string, cal: SchoolCalendar, shift: Shift): DayBell[] {
  return dayBells(date, cal).filter((b) => b.classIds && b.shift === shift && b.periods.length);
}

/**
 * Panonun zil sayacı. Tekli öğretimde günün zili; ikili öğretimde sabahçı dersleri bitene kadar sabahçı, sonra
 * öğlenci zili.
 */
export function boardBell(date: string, cal: SchoolCalendar, dualShift: boolean, secondsOfDay: number): { shift: Shift; periods: Period[] } {
  cal = { ...cal, dualShift };
  const morning = schoolDay(date, cal, 'morning').periods;
  if (!dualShift) return { shift: 'morning', periods: morning };
  const afternoon = schoolDay(date, cal, 'afternoon').periods;
  if (!afternoon.length) return { shift: 'morning', periods: morning };
  if (!morning.length) return { shift: 'afternoon', periods: afternoon };
  const morningEnd = parseClock(morning[morning.length - 1]!.end);
  return secondsOfDay < morningEnd ? { shift: 'morning', periods: morning } : { shift: 'afternoon', periods: afternoon };
}

/**
 * Programda olup zil düzeni tanımlı olmayan ders sayıları (vardiyaya göre). Bu sayılarda bir büyük düzen kullanılır;
 * panel "Oluştur" önerir.
 */
export function missingLessonCounts(schedules: readonly BellScheduleLike[], counts: Record<string, number>, shift: Shift): number[] {
  const have = new Set(schedules.filter((s) => !s.weekdays.length && (s.shift === 'afternoon') === (shift === 'afternoon')).map(scheduleLessonCount));
  // Elle sabitlenmiş düzeni olan günler (ör. Cuma) otomatik düzen gerektirmez
  const fixedDays = new Set(schedules.filter((s) => (s.shift === 'afternoon') === (shift === 'afternoon')).flatMap((s) => s.weekdays));
  const need = new Set(
    Object.entries(counts)
      .filter(([k, n]) => k.startsWith(`${shift}:`) && n > 0 && !fixedDays.has(Number(k.split(':')[1])))
      .map(([, n]) => n),
  );
  return [...need].filter((n) => !have.has(n)).sort((a, b) => a - b);
}

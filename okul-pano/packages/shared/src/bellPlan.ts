import { BELL_OFF, computeBellStatus, pickSchedule, type BellClassRef, type BellScheduleLike, type Period } from './bell.ts';
import { isoWeekday, schoolDay, type SchoolCalendar } from './schoolDay.ts';
import { parseClock } from './time.ts';

/*
 * Zil düzeni: okulun zil çizelgeleri + her sınıfın ders programı. Hiçbir saat ya da ders sayısı sabit değildir:
 * - Sınıf yalnızca o günkü kendi dersleri boyunca "derste"dir (9 dersi olan 9. derste, 11 dersi olan 11. derste biter).
 * - Bir günün bütün dersleri okulun "okul dışı dersler" listesindeyse (ör. işletmede mesleki eğitim) sınıf o gün okulda değildir.
 * - Zil hesabına katılmayan sınıflar (okulun işaretlediği, ör. özel eğitim) panodaki zil seçimine ve çakışma denetimine girmez.
 */

export interface ClassBell extends BellClassRef {
  id: string;
  name: string;
  bellExempt?: boolean | null;
}

export interface PlanEntry {
  weekday: number;
  periodNo: number;
  subject: string;
  classId?: string | null;
  className?: string;
}

const parseClockSafe = (v: string): number | null => {
  try {
    return parseClock(v);
  } catch {
    return null;
  }
};

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');

/** Ders okul dışında mı yapılıyor (okulun listesine göre) */
export function isOffsiteSubject(subject: string, offsite: readonly string[]): boolean {
  const k = norm(subject);
  return offsite.some((o) => norm(o) === k);
}

export interface ClassDay {
  classId: string;
  schedule: BellScheduleLike | null;
  /** O gün okulda değil: zil planında kapalı ya da bütün dersleri okul dışında */
  off: boolean;
  /** Günün ilk ve son ders numarası (okul dışı dersler hariç) */
  first: number | null;
  last: number | null;
  /** Sınıfın o gün gerçekten derste olduğu ders saatleri (tatil / arife uygulanmış) */
  periods: Period[];
}

/** Bir sınıfın bir günü */
export function classDay(date: string, cal: SchoolCalendar, cls: ClassBell, entries: readonly PlanEntry[], offsite: readonly string[]): ClassDay {
  const weekday = isoWeekday(date);
  const mine = entries.filter((e) => e.weekday === weekday && (e.classId ? e.classId === cls.id : e.className === cls.name));
  const inSchool = mine.filter((e) => !isOffsiteSubject(e.subject, offsite));
  const planOff = cls.bellPlan?.[String(weekday)] === BELL_OFF;
  const off = planOff || (mine.length > 0 && inSchool.length === 0);
  const schedule = off ? null : pickSchedule(cal.schedules, weekday, cls);
  if (off || !inSchool.length) return { classId: cls.id, schedule, off, first: null, last: null, periods: [] };
  const nos = inSchool.map((e) => e.periodNo);
  const first = Math.min(...nos);
  const last = Math.max(...nos);
  const day = schoolDay(date, cal, cls);
  return { classId: cls.id, schedule, off, first, last, periods: day.periods.filter((p) => p.no >= first && p.no <= last) };
}

/** Sınıfın şu anki (teneffüste ya da ilk dersten önce sıradaki) ders numarası */
function currentNo(periods: readonly Period[], secondsOfDay: number, lunchThresholdMin: number): number | null {
  if (!periods.length) return null;
  const bell = computeBellStatus(periods, secondsOfDay, lunchThresholdMin);
  const p = bell.kind === 'lesson' ? bell.period : bell.kind === 'break' || bell.kind === 'before' ? bell.next : null;
  return p?.no ?? null;
}

export interface BellContext {
  cal: SchoolCalendar;
  classes: readonly ClassBell[];
  offsiteSubjects: readonly string[];
}

/**
 * Şu an derste olan kayıtlar: her sınıf kendi zilini ve kendi ilk–son dersini izler. Okul dışındaki sınıflar,
 * zil hesabına katılmayan sınıflar ve okul dışı dersler listelenmez. Sınıf bilgisi yoksa okulun genel zili kullanılır.
 */
export function lessonsNow<E extends PlanEntry>(entries: readonly E[], date: string, ctx: BellContext, secondsOfDay: number, lunchThresholdMin = 30): E[] {
  const weekday = isoWeekday(date);
  const byId = new Map(ctx.classes.map((c) => [c.id, c]));
  const nowNo = new Map<string, number | null>();
  const out: E[] = [];
  for (const e of entries) {
    if (e.weekday !== weekday || isOffsiteSubject(e.subject, ctx.offsiteSubjects)) continue;
    const cls: ClassBell = (e.classId && byId.get(e.classId)) || { id: e.classId ?? e.className ?? '', name: e.className ?? '' };
    if (cls.bellExempt) continue;
    if (!nowNo.has(cls.id)) {
      const d = classDay(date, ctx.cal, cls, entries, ctx.offsiteSubjects);
      nowNo.set(cls.id, currentNo(d.periods, secondsOfDay, lunchThresholdMin));
    }
    if (nowNo.get(cls.id) === e.periodNo) out.push(e);
  }
  return out;
}

export interface BoardBell {
  /** Panonun büyük zil sayacının izlediği çizelge */
  schedule: BellScheduleLike | null;
  /** O çizelgeyi izleyen sınıfların o günkü ilk dersinden son dersine kadar çalan saatler */
  periods: Period[];
}

/**
 * Panonun büyük zil sayacı. `preferredId` verilirse o çizelge; verilmezse (Otomatik) o saatte en çok sınıfın derste
 * olduğu çizelge — ikili öğretimde sabah sabahçı, öğleden sonra öğlenci zili. Hiç sınıf o saatte derste değilse
 * sıradaki başlayacak olan, gün bittiyse en geç biten çizelge. Ders programı yoksa okulun genel zili.
 */
export function boardBell(date: string, entries: readonly PlanEntry[], ctx: BellContext, secondsOfDay: number, preferredId?: string | null): BoardBell {
  const groups = new Map<string, { schedule: BellScheduleLike; count: number; first: number; last: number; periods: Period[] }>();
  for (const cls of ctx.classes) {
    if (cls.bellExempt) continue;
    const d = classDay(date, ctx.cal, cls, entries, ctx.offsiteSubjects);
    if (!d.schedule || !d.periods.length || d.first === null || d.last === null) continue;
    const g = groups.get(d.schedule.id);
    if (!g) {
      groups.set(d.schedule.id, { schedule: d.schedule, count: 1, first: d.first, last: d.last, periods: schoolDay(date, ctx.cal, cls).periods });
    } else {
      g.count++;
      g.first = Math.min(g.first, d.first);
      g.last = Math.max(g.last, d.last);
    }
  }
  if (!groups.size) {
    const day = schoolDay(date, ctx.cal);
    const general = pickSchedule(ctx.cal.schedules, isoWeekday(date));
    // Ders programı olan okulda bugün okulda kimse yoksa zil çalmaz; program hiç yoksa genel zil
    const hasToday = entries.some((e) => e.weekday === isoWeekday(date));
    return { schedule: hasToday ? null : general, periods: hasToday ? [] : day.periods };
  }
  const list = [...groups.values()].map((g) => {
    const periods = g.periods.filter((p) => p.no >= g.first && p.no <= g.last);
    const start = periods.length ? parseClock(periods[0]!.start) : 0;
    const end = periods.length ? parseClock(periods[periods.length - 1]!.end) : 0;
    return { ...g, periods, start, end };
  });
  const preferred = preferredId ? list.find((g) => g.schedule.id === preferredId) : undefined;
  const pick =
    preferred ??
    list
      .filter((g) => g.start <= secondsOfDay && secondsOfDay < g.end)
      .sort((a, b) => b.count - a.count)[0] ??
    list.filter((g) => g.start > secondsOfDay).sort((a, b) => a.start - b.start || b.count - a.count)[0] ??
    [...list].sort((a, b) => b.end - a.end || b.count - a.count)[0]!;
  return { schedule: pick.schedule, periods: pick.periods };
}

export interface TeacherClash {
  teacherId: string;
  weekday: number;
  a: { className: string; periodNo: number; start: string; end: string };
  b: { className: string; periodNo: number; start: string; end: string };
}

/**
 * Sınıflar farklı zil izlediğinde bir öğretmenin dersleri saat olarak örtüşebilir. Aynı saatteki birleştirilmiş /
 * bölünmüş dersler (başlangıç ve bitiş aynı), zil hesabına katılmayan sınıflar ve okul dışı dersler sayılmaz.
 */
export function teacherClashes(
  entries: readonly { teacherId: string | null; weekday: number; periodNo: number; classGroupId: string; subject: string }[],
  schedules: readonly BellScheduleLike[],
  classes: readonly ClassBell[],
  offsite: readonly string[] = [],
): TeacherClash[] {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const slots = new Map<string, { className: string; periodNo: number; start: string; end: string; s: number; e: number }[]>();
  for (const x of entries) {
    const cls = byId.get(x.classGroupId);
    if (!x.teacherId || !cls || cls.bellExempt || isOffsiteSubject(x.subject, offsite)) continue;
    const period = pickSchedule(schedules, x.weekday, cls)?.periods.find((p) => p.no === x.periodNo);
    const s = period && parseClockSafe(period.start);
    const e = period && parseClockSafe(period.end);
    if (!period || s == null || e == null) continue;
    const key = `${x.teacherId}|${x.weekday}`;
    const list = slots.get(key) ?? [];
    list.push({ className: cls.name, periodNo: x.periodNo, start: period.start, end: period.end, s, e });
    slots.set(key, list);
  }
  const out: TeacherClash[] = [];
  for (const [key, list] of slots) {
    const [teacherId, weekday] = key.split('|');
    list.sort((p, q) => p.s - q.s);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length && list[j]!.s < list[i]!.e; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.s === b.s && a.e === b.e) continue;
        const pick = ({ className, periodNo, start, end }: typeof a) => ({ className, periodNo, start, end });
        out.push({ teacherId: teacherId!, weekday: Number(weekday), a: pick(a), b: pick(b) });
      }
  }
  return out.sort((p, q) => p.weekday - q.weekday || p.a.start.localeCompare(q.a.start));
}

export interface BellGroupDay {
  weekday: number;
  /** Zil planında o gün için seçilen çizelge ("off" = okulda değil); boşsa okulun genel çizelgesi */
  planned: string | null;
  schedule: BellScheduleLike | null;
  /** Bütün dersleri okul dışı dersler listesinde */
  offsite: boolean;
  first: number | null;
  last: number | null;
  /** İlk dersin başlangıcı ve son dersin bitişi */
  start: string | null;
  end: string | null;
  /** Programdaki ders, zilde olmayan bir ders saatine düşüyor */
  missing: number[];
}

export interface BellGroup {
  classIds: string[];
  days: BellGroupDay[];
}

/**
 * Zil ataması tablosu: aynı zil planına ve aynı günlük ders düzenine (ilk–son ders, okul dışı gün) sahip sınıflar
 * tek grupta toplanır. Zil hesabına katılmayan sınıflar gruplara girmez.
 */
export function bellGroups(
  classes: readonly ClassBell[],
  entries: readonly { weekday: number; periodNo: number; classGroupId: string; subject: string }[],
  schedules: readonly BellScheduleLike[],
  offsite: readonly string[],
  weekdays: readonly number[],
): BellGroup[] {
  const groups = new Map<string, BellGroup>();
  for (const cls of classes) {
    if (cls.bellExempt) continue;
    const mine = entries.filter((e) => e.classGroupId === cls.id);
    if (!mine.length) continue;
    const days = weekdays.map((weekday): BellGroupDay => {
      const today = mine.filter((e) => e.weekday === weekday);
      const inSchool = today.filter((e) => !isOffsiteSubject(e.subject, offsite));
      const planned = cls.bellPlan?.[String(weekday)] ?? null;
      const offsiteDay = today.length > 0 && inSchool.length === 0;
      const schedule = planned === BELL_OFF ? null : pickSchedule(schedules, weekday, cls);
      const nos = inSchool.map((e) => e.periodNo);
      const first = nos.length ? Math.min(...nos) : null;
      const last = nos.length ? Math.max(...nos) : null;
      const byNo = new Map((schedule?.periods ?? []).map((p) => [p.no, p]));
      const missing = planned === BELL_OFF || offsiteDay ? [] : [...new Set(nos.filter((n) => !byNo.has(n)))].sort((a, b) => a - b);
      return {
        weekday,
        planned,
        schedule,
        offsite: offsiteDay,
        first,
        last,
        start: first !== null ? (byNo.get(first)?.start ?? null) : null,
        end: last !== null ? (byNo.get(last)?.end ?? null) : null,
        missing,
      };
    });
    const key = days.map((d) => `${d.planned ?? ''}:${d.schedule?.id ?? ''}:${d.offsite}:${d.first}-${d.last}`).join('|');
    const g = groups.get(key);
    if (g) g.classIds.push(cls.id);
    else groups.set(key, { classIds: [cls.id], days });
  }
  return [...groups.values()].sort((a, b) => b.classIds.length - a.classIds.length);
}

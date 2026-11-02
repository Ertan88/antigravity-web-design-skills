import { gradeOf } from './grade.ts';
import { formatClock, parseClock } from './time.ts';

/** Bir ders saati. `no`, ders programı kayıtlarının bağlandığı kalıcı numaradır. */
export interface Period {
  no: number;
  start: string;
  end: string;
  label?: string | null;
}

export interface BellScheduleLike {
  id: string;
  name: string;
  /** ISO hafta günleri: 1 = Pazartesi ... 7 = Pazar */
  weekdays: number[];
  periods: Period[];
  sortOrder?: number;
  /** Yalnızca bu düzeylere (ör. [11]) uygulanır; boşsa düzey kısıtı yok */
  grades?: number[] | null;
  /** Yalnızca bu sınıflara uygulanır; boşsa sınıf kısıtı yok */
  classIds?: string[] | null;
}

/** Zilin hangi sınıf için seçildiği (sınıfa / düzeye özel çizelgeler için) */
export interface BellClassRef {
  id?: string | null;
  name: string;
}

/** Çizelge bütün okula mı (0), bir düzeye mi (1), belirli sınıflara mı (2) özel; uymuyorsa -1 */
export function scheduleSpecificity(s: BellScheduleLike, cls?: BellClassRef | null): number {
  const classIds = s.classIds ?? [];
  const grades = s.grades ?? [];
  if (!classIds.length && !grades.length) return 0;
  if (!cls) return -1;
  if (classIds.length && cls.id && classIds.includes(cls.id)) return 2;
  const g = gradeOf(cls.name);
  if (grades.length && g !== null && grades.includes(g)) return 1;
  return -1;
}

/** Çizelge bütün okula mı uygulanır */
export const isSchoolWide = (s: BellScheduleLike) => !(s.classIds ?? []).length && !(s.grades ?? []).length;

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
 * Bugünün hafta gününe uyan zil çizelgesini seçer. Sınıf verilirse önce o sınıfa özel, sonra o düzeye özel
 * (ör. "Salı · 11. sınıflar"), en son bütün okulun çizelgesi geçerlidir; sınıf verilmezse yalnızca bütün okulun
 * çizelgeleri. Aynı düzeyde birden fazla çizelge aynı günü kapsıyorsa daha az gün kapsayan (daha özel) olan
 * geçerlidir: "Hafta içi" (Pzt–Cum) yanında "Cuma" (yalnız Cum) çizelgesi varsa cuma günü "Cuma" kullanılır.
 * Eşitlikte listedeki sıra belirler.
 */
export function pickSchedule<T extends BellScheduleLike>(schedules: readonly T[], weekday: number, cls?: BellClassRef | null): T | null {
  const matches = schedules
    .map((s) => ({ s, rank: scheduleSpecificity(s, cls) }))
    .filter(({ s, rank }) => rank >= 0 && s.weekdays.includes(weekday) && s.periods.length > 0)
    .sort((a, b) => b.rank - a.rank || a.s.weekdays.length - b.s.weekdays.length || (a.s.sortOrder ?? 0) - (b.s.sortOrder ?? 0));
  return matches[0]?.s ?? null;
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

export interface TeacherClash {
  teacherId: string;
  weekday: number;
  a: { className: string; periodNo: number; start: string; end: string };
  b: { className: string; periodNo: number; start: string; end: string };
}

/**
 * Sınıflar farklı zil izlediğinde bir öğretmenin dersleri saat olarak örtüşebilir (ör. salı 11-A'da 6. ders
 * 12:40–13:20, 9-C'de 6. ders 13:15–13:55). Aynı saatteki birleştirilmiş / bölünmüş dersler (başlangıç ve bitiş
 * aynı) çakışma sayılmaz.
 */
export function teacherClashes(
  entries: readonly { teacherId: string | null; weekday: number; periodNo: number; classGroupId: string }[],
  schedules: readonly BellScheduleLike[],
  classes: readonly { id: string; name: string }[],
): TeacherClash[] {
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const slots = new Map<string, { className: string; periodNo: number; start: string; end: string; s: number; e: number }[]>();
  for (const x of entries) {
    if (!x.teacherId) continue;
    const name = className.get(x.classGroupId) ?? '';
    const period = pickSchedule(schedules, x.weekday, { id: x.classGroupId, name })?.periods.find((p) => p.no === x.periodNo);
    if (!period) continue;
    const key = `${x.teacherId}|${x.weekday}`;
    const list = slots.get(key) ?? [];
    list.push({ className: name, periodNo: x.periodNo, start: period.start, end: period.end, s: parseClock(period.start), e: parseClock(period.end) });
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

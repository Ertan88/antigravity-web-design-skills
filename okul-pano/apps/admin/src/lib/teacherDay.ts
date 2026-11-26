import { classBell, dayBells, isoWeekday, schoolDay, zonedParts, type BellClass, type BellOverrideLike, type BellScheduleLike, type Period, type SchoolCalendar } from '@okulpano/shared';

/** Öğretmenin haftası (`me/today`): mobildeki "Bugün" ile aynı veri */
export interface MeToday {
  teacher: { id: string; fullName: string } | null;
  today: string;
  timezone: string;
  bellSchedules: BellScheduleLike[];
  holidays: { date: string; name: string }[];
  halfDays?: { date: string; name: string }[];
  halfDayEnd?: string;
  dualShift?: boolean;
  lessonCounts?: Record<string, number> | null;
  bellClasses?: BellClass[] | null;
  bellOverrides?: BellOverrideLike[];
  lessons: { weekday: number; periodNo: number; className: string; classId?: string; shift?: 'morning' | 'afternoon' | null; subject: string }[];
  covers?: { date: string; periodNo: number; classId: string; className: string; shift: 'morning' | 'afternoon' | null; subject: string; absentName: string }[];
  leaves: { id: string; startDate: string; endDate: string; note: string | null; status: 'approved' | 'pending' | 'rejected' }[];
  week: {
    date: string;
    weekday: number;
    holiday: string | null;
    supervisor: string | null;
    duties: { dutyId: string; area: string; partners: string[]; substituteFor: string | null; coveredBy: string | null }[];
  }[];
}

export interface DayLesson {
  period: Period;
  className: string;
  subject: string;
  coverFor?: string;
  state: 'past' | 'now' | 'next' | 'later';
}

const toSec = (hm: string) => Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(3, 5)) * 60;

/** Panoyla aynı zil takvimi: düzenler, tatiller, arifeler, sınıfa özel ziller ve elle müdahaleler */
function calendar(d: MeToday): SchoolCalendar {
  return {
    schedules: d.bellSchedules,
    holidays: d.holidays,
    halfDays: d.halfDays ?? [],
    halfDayEnd: d.halfDayEnd,
    lessonCounts: d.lessonCounts ?? null,
    bellClasses: d.bellClasses ?? null,
    overrides: d.bellOverrides ?? [],
    dualShift: Boolean(d.dualShift),
  };
}

/**
 * Öğretmenin bir tarihteki dersleri saatleriyle (mobildeki `teacherDay` ile aynı hesap): programdaki dersler ve o tarihe
 * verilen görev dersleri; her ders kendi sınıfının (ve vardiyasının) ziline göre, başlama saatine göre sıralı.
 */
export function dayLessons(d: MeToday, date: string): { holiday: string | null; lessons: Omit<DayLesson, 'state'>[] } {
  const cal = calendar(d);
  const dual = Boolean(d.dualShift);
  const shiftOf = (l: { shift?: 'morning' | 'afternoon' | null }) => (dual && l.shift === 'afternoon' ? 'afternoon' : 'morning');
  const { holiday } = schoolDay(date, cal, 'morning');
  if (holiday) return { holiday, lessons: [] };
  const weekday = isoWeekday(date);
  const covers = (d.covers ?? [])
    .filter((c) => c.date === date)
    .map((c) => ({ weekday, periodNo: c.periodNo, className: c.className, classId: c.classId, shift: c.shift, subject: c.subject, coverFor: c.absentName || 'İzinli öğretmen' }));
  const all: (MeToday['lessons'][number] & { coverFor?: string })[] = [...d.lessons.filter((l) => l.weekday === weekday), ...covers];
  const bells = dayBells(date, cal);
  const lessons = all
    .flatMap((l) => {
      const period = classBell(bells, l.classId, shiftOf(l))?.periods.find((p) => p.no === l.periodNo);
      return period ? [{ period, className: l.className, subject: l.subject, coverFor: l.coverFor }] : [];
    })
    .sort((a, b) => toSec(a.period.start) - toSec(b.period.start));
  return { holiday: null, lessons };
}

/** Bugünün dersleri ve her birinin durumu (geçti, şu an, sıradaki, sonra) */
export function todayLessons(d: MeToday, at: Date = new Date()): { now: number; holiday: string | null; lessons: DayLesson[] } {
  const now = zonedParts(at, d.timezone);
  const { holiday, lessons } = dayLessons(d, now.isoDate);
  let seenNext = false;
  return {
    now: now.secondsOfDay,
    holiday,
    lessons: lessons.map((l) => {
      const start = toSec(l.period.start);
      const end = toSec(l.period.end);
      let state: DayLesson['state'] = end <= now.secondsOfDay ? 'past' : start <= now.secondsOfDay ? 'now' : 'later';
      if (state === 'later' && !seenNext) {
        state = 'next';
        seenNext = true;
      }
      return { ...l, state };
    }),
  };
}

/** "25 dk" / "1 sa 10 dk" */
export function minutesText(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa${m % 60 ? ` ${m % 60} dk` : ''}`;
}

export { toSec };

import { computeBellStatus, periodLabel, pickSchedule, sortPeriods, type BellStatus, type Period, type Shift } from '@okulpano/shared/bell';
import { schoolDay } from '@okulpano/shared/schoolDay';
import { zonedParts, type ZonedParts } from '@okulpano/shared/time';
import type { MeToday } from './data.ts';

export const WEEKDAY_SHORT = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
export const WEEKDAY_LONG = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;

export interface TeacherDay {
  now: ZonedParts;
  periods: Period[];
  bell: BellStatus;
  holiday: string | null;
  /** Arife (yarım gün): dersler `endsAt` saatinde biter */
  halfDay: string | null;
  endsAt: string | null;
  /** Bugünkü dersleri: saat, sınıf, ders; şu anki işaretli */
  lessons: { period: Period; className: string; subject: string; state: 'past' | 'now' | 'next' | 'later' }[];
}

/**
 * Bir hafta gününün zil saatleri (panoyla aynı seçim): günün ders sayısına uyan düzen ya da o güne sabitlenen düzen;
 * zil o gün en geç biten sınıfın son dersinde biter. İkili öğretimde vardiyanın zili.
 */
export function dayBellPeriods(data: Pick<MeToday, 'bellSchedules' | 'lessonCounts'>, weekday: number, shift: Shift = 'morning'): Period[] {
  const count = data.lessonCounts ? (data.lessonCounts[`${shift}:${weekday}`] ?? 0) : null;
  const schedule = pickSchedule(data.bellSchedules, weekday, { shift, lessonCount: count });
  return schedule ? sortPeriods(schedule.periods).filter((p) => !count || p.no <= count) : [];
}

/** Öğretmenin bugünü: zil durumu ve dersleri (panoyla aynı hesap) */
export function teacherDay(data: MeToday, date: Date): TeacherDay {
  const now = zonedParts(date, data.timezone);
  // Panoyla aynı hesap: tek zil, günün ders sayısına göre; tatilde ders yok, arifede dersler yarım gün saatinde biter.
  // İkili öğretimde her ders kendi vardiyasının zilini izler; zil kartı öğretmenin o günkü vardiyasını gösterir
  const cal = { schedules: data.bellSchedules, holidays: data.holidays, halfDays: data.halfDays ?? [], halfDayEnd: data.halfDayEnd, lessonCounts: data.lessonCounts ?? null };
  const dual = Boolean(data.dualShift);
  const shiftOf = (l: { shift?: Shift | null }): Shift => (dual && l.shift === 'afternoon' ? 'afternoon' : 'morning');
  const todays = data.lessons.filter((l) => l.weekday === now.weekday);
  const myShift = todays.length ? shiftOf(todays[0]!) : 'morning';
  const days = { morning: schoolDay(now.isoDate, cal, 'morning'), afternoon: dual ? schoolDay(now.isoDate, cal, 'afternoon') : null };
  const day = (myShift === 'afternoon' && days.afternoon) || days.morning;
  const { holiday, halfDay, endsAt, periods } = day;
  const bell: BellStatus = periods.length ? computeBellStatus(periods, now.secondsOfDay, data.lunchThresholdMin) : { kind: 'off' };
  let seenNext = false;
  const lessons = todays
    .flatMap((l) => {
      const period = ((shiftOf(l) === 'afternoon' && days.afternoon) || days.morning).periods.find((p) => p.no === l.periodNo);
      return period ? [{ l, period }] : [];
    })
    .sort((a, b) => toSec(a.period.start) - toSec(b.period.start))
    .map(({ l, period }) => {
      const start = toSec(period.start);
      const end = toSec(period.end);
      let state: 'past' | 'now' | 'next' | 'later' = end <= now.secondsOfDay ? 'past' : start <= now.secondsOfDay ? 'now' : 'later';
      if (state === 'later' && !seenNext) {
        state = 'next';
        seenNext = true;
      }
      return { period, className: l.className, subject: l.subject, state };
    });
  return { now, periods, bell, holiday, halfDay, endsAt, lessons };
}

const toSec = (hm: string) => Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(3, 5)) * 60;

/** Zil kartındaki başlık ve geri sayım */
export function bellHeadline(b: BellStatus): { title: string; caption: string; remaining: number | null; progress: number | null; next: string | null } {
  switch (b.kind) {
    case 'lesson':
      return {
        title: `Şu an · ${periodLabel(b.period)}`,
        caption: b.next ? 'teneffüse kalan' : 'günün bitmesine',
        remaining: b.remainingSec,
        progress: 1 - b.remainingSec / b.totalSec,
        next: b.next ? `Sıradaki: ${periodLabel(b.next)} ${b.next.start}` : 'Son ders',
      };
    case 'break':
      return {
        title: b.isLunch ? 'Öğle arası' : 'Teneffüs',
        caption: `${periodLabel(b.next)} başlamasına`,
        remaining: b.remainingSec,
        progress: 1 - b.remainingSec / b.totalSec,
        next: `${periodLabel(b.next)} ${b.next.start} – ${b.next.end}`,
      };
    case 'before':
      return { title: 'Günaydın', caption: 'derslerin başlamasına', remaining: b.remainingSec, progress: null, next: `İlk ders ${b.next.start}` };
    case 'after':
      return { title: 'Dersler bitti', caption: `Son ders ${b.last.end}'de bitti`, remaining: null, progress: null, next: null };
    default:
      return { title: 'Bugün ders yok', caption: 'İyi dinlenmeler', remaining: null, progress: null, next: null };
  }
}

/** 1125 → "18:45"; bir saatten uzunsa "1 sa 05 dk" */
export function countdownText(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h) return `${h} sa ${String(m).padStart(2, '0')} dk`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Vakte göre karşılama: 05–11 Günaydın, 11–17 İyi günler, 17–22 İyi akşamlar, 22–05 İyi geceler */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Günaydın';
  if (hour >= 11 && hour < 17) return 'İyi günler';
  if (hour >= 17 && hour < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}

/** Sınıf adı: e-Okul'daki "AMP" (Anadolu Meslek Programı) ön eki yazılmaz ("AMP 11-B" → "11-B"); ATP gibi diğerleri kalır */
export const classLabel = (name: string) => name.replace(/^AMP\s+/i, '');

/** "2026-10-29" → "29 Ekim Perşembe" */
export function dayTitle(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', weekday: 'long' }): string {
  return new Intl.DateTimeFormat('tr-TR', { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'hiç';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.round(h / 24)} gün önce`;
}

export const clock = (iso: string) => new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Kısaltmasız, yıl ve gün adıyla: "16 Kasım 2026 Pazartesi" (tarih ya da tarih-saat) */
export const fullDate = (iso: string) => dayTitle(iso.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
/** "16 Kasım 2026 Pazartesi – 20 Kasım 2026 Cuma" (aynı günse tek tarih) */
export const dateSpan = (a: string, b: string) => (a === b ? fullDate(a) : `${fullDate(a)} – ${fullDate(b)}`);
/** Telefonun saatine göre tarih: YYYY-AA-GG */
export function localIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ana sayfa başlığı: "2026-10-29" → ["Perşembe,", "29 Ekim"] */
export function homeTitle(iso: string): [string, string] {
  return [`${dayTitle(iso, { weekday: 'long' })},`, dayTitle(iso, { day: 'numeric', month: 'long' })];
}

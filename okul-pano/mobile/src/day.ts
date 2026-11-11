import { computeBellStatus, periodLabel, type BellStatus, type Period, type Shift } from '@okulpano/shared/bell';
import { addIsoDays, classBell, dayBells, isoWeekday, schoolDay, type SchoolCalendar } from '@okulpano/shared/schoolDay';
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
  /** Bugünkü dersleri: saat, sınıf, ders; şu anki işaretli; görev dersinde `coverFor` izinli öğretmenin adı */
  lessons: { period: Period; className: string; subject: string; coverFor?: string; state: 'past' | 'now' | 'next' | 'later' }[];
}

/** Panoyla aynı zil takvimi: düzenler, tatiller, sınıfa özel ziller ve elle müdahaleler */
export function bellCalendar(data: MeToday, opts: { holidays?: boolean } = {}): SchoolCalendar {
  const withHolidays = opts.holidays !== false;
  return {
    schedules: data.bellSchedules,
    holidays: withHolidays ? data.holidays : [],
    halfDays: withHolidays ? (data.halfDays ?? []) : [],
    halfDayEnd: data.halfDayEnd,
    lessonCounts: data.lessonCounts ?? null,
    bellClasses: data.bellClasses ?? null,
    overrides: data.bellOverrides ?? [],
    dualShift: Boolean(data.dualShift),
  };
}

/**
 * Bir tarihin dersleri: haftalık programdaki o günün dersleri ve o tarihe verilen görev dersleri ("GÖREV"; izinli
 * öğretmenin adı `coverFor`). Görev dersi programdaki boş saate gelir.
 */
export function lessonsOn(data: MeToday, date: string, weekday = isoWeekday(date)): MeToday['lessons'] {
  const covers = (data.covers ?? [])
    .filter((c) => c.date === date)
    .map((c) => ({ weekday, periodNo: c.periodNo, className: c.className, classId: c.classId, shift: c.shift, subject: c.subject, coverFor: c.absentName || 'İzinli öğretmen' }));
  return [...data.lessons.filter((l) => l.weekday === weekday), ...covers];
}

/** Okul günü bitti mi: tatil, hafta sonu ya da okulun o günkü son zilinden sonra */
export function schoolDayEnded(data: MeToday, date: Date): boolean {
  const now = zonedParts(date, data.timezone);
  const ends = dayBells(now.isoDate, bellCalendar(data)).flatMap((b) => b.periods.map((p) => p.end));
  if (!ends.length) return true;
  const end = ends.reduce((a, b) => (b > a ? b : a));
  return now.secondsOfDay >= toSec(end);
}

/** Bu haftanın (bugünün haftası) o gününün tarihi */
export function dateOfWeekday(today: string, weekday: number): string {
  return addIsoDays(today, weekday - isoWeekday(today));
}

/**
 * Bir günün okul geneli zil saatleri (panoyla aynı seçim): günün ders sayısına uyan düzen ya da o güne sabitlenen düzen;
 * o gün elle değiştirildiyse o saatler. Tarih verilmezse bu haftanın o günü. Tatiller burada düşülmez.
 */
export function dayBellPeriods(data: MeToday, weekday: number, shift: Shift = 'morning', date?: string): Period[] {
  return schoolDay(date ?? dateOfWeekday(data.today, weekday), bellCalendar(data, { holidays: false }), shift).periods;
}

/** Bir sınıfın o günkü ders saatleri: sınıfa özel zile geçtiyse onun, değilse okul geneli zilin saatleri */
export function classDayPeriods(data: MeToday, date: string, classId: string | null | undefined, shift: Shift = 'morning'): Period[] {
  return classBell(dayBells(date, bellCalendar(data, { holidays: false })), classId, shift)?.periods ?? [];
}

/** Öğretmenin bugünü: zil durumu ve dersleri (panoyla aynı hesap) */
export function teacherDay(data: MeToday, date: Date): TeacherDay {
  const now = zonedParts(date, data.timezone);
  // Panoyla aynı hesap: günün ders sayısına göre okul geneli zil; sınıfa özel zile geçen sınıfların dersleri kendi
  // zillerinden; tatilde ders yok, arifede dersler yarım gün saatinde biter. İkili öğretimde her ders kendi vardiyasının
  // zilini izler; zil kartı öğretmenin o anki (yoksa sıradaki) dersinin zilini gösterir
  const cal = bellCalendar(data);
  const dual = Boolean(data.dualShift);
  const shiftOf = (l: { shift?: Shift | null }): Shift => (dual && l.shift === 'afternoon' ? 'afternoon' : 'morning');
  const todays = lessonsOn(data, now.isoDate, now.weekday);
  const bells = dayBells(now.isoDate, cal);
  const school = schoolDay(now.isoDate, cal, 'morning');
  const { holiday, halfDay, endsAt } = school;
  let seenNext = false;
  const lessons = todays
    .flatMap((l) => {
      const period = classBell(bells, l.classId, shiftOf(l))?.periods.find((p) => p.no === l.periodNo);
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
      return { period, className: l.className, classId: l.classId, shift: shiftOf(l), subject: l.subject, coverFor: l.coverFor, state };
    });
  // Zil kartı: şu anki ya da sıradaki dersin zili (ör. 12. sınıfa giren öğretmen 12'lerin zilini görür); dersi yoksa
  // vardiyasının okul geneli zili
  const focus = lessons.find((x) => x.state === 'now') ?? lessons.find((x) => x.state === 'next');
  const myShift = todays.length ? shiftOf(todays[0]!) : 'morning';
  const periods = holiday ? [] : (classBell(bells, focus?.classId, focus?.shift ?? myShift)?.periods ?? []);
  const bell: BellStatus = periods.length ? computeBellStatus(periods, now.secondsOfDay, data.lunchThresholdMin) : { kind: 'off' };
  return { now, periods, bell, holiday, halfDay, endsAt, lessons: lessons.map(({ classId: _c, shift: _s, ...x }) => x) };
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

/** Yönelme eki: "11-B" → "11-B'ye", "12-A" → "12-A'ya", "10" → "10'a" (harf ve sayılar okunuşuna göre) */
export function dative(name: string): string {
  const t = name.trim();
  const ch = t.slice(-1);
  const back = (v: string) => 'aıou'.includes(v);
  let vowel: string | null = null;
  let consonant = false;
  if (/\d/.test(ch)) {
    const num = t.match(/(\d+)$/)![1]!.replace(/^0+(?=\d)/, '');
    // Sondaki basamağın okunuşu; sıfırla bitenlerde onlar/yüzler basamağı
    const ones: Record<string, [string, boolean]> = { '1': ['i', true], '2': ['i', false], '3': ['ü', true], '4': ['ö', true], '5': ['e', true], '6': ['ı', false], '7': ['i', false], '8': ['i', true], '9': ['u', true] };
    const tens: Record<string, [string, boolean]> = { '1': ['o', true], '2': ['i', false], '3': ['u', true], '4': ['ı', true], '5': ['i', false], '6': ['ı', true], '7': ['i', true], '8': ['e', true], '9': ['a', true] };
    const last = num.slice(-1);
    const hit = last !== '0' ? ones[last] : num.length === 1 ? (['ı', true] as [string, boolean]) : num.slice(-2, -1) !== '0' ? tens[num.slice(-2, -1)!] : num.length >= 4 && num.slice(-3) === '000' ? (['i', true] as [string, boolean]) : (['ü', true] as [string, boolean]);
    [vowel, consonant] = hit ?? ['e', true];
  } else if (/[A-ZÇĞİÖŞÜ]/.test(ch) && !/[a-zçğıöşü]/.test(t.slice(-2, -1))) {
    // Tek büyük harf: harfin adı ("be", "ka", "a")
    const named: Record<string, string> = { A: 'a', I: 'ı', O: 'o', U: 'u', K: 'a', Ö: 'ö', Ü: 'ü', İ: 'i', E: 'e' };
    vowel = named[ch] ?? 'e';
  } else {
    const lower = t.toLocaleLowerCase('tr-TR');
    const vs = lower.match(/[aeıioöuü]/g);
    vowel = vs ? vs[vs.length - 1]! : 'e';
    consonant = !/[aeıioöuü]$/.test(lower);
  }
  const a = back(vowel) ? 'a' : 'e';
  return `${t}'${consonant ? '' : 'y'}${a}`;
}

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

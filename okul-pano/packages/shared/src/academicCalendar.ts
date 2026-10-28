/**
 * MEB eğitim ve öğretim yılı çalışma takvimi: derslerin başlaması, ara tatiller, yarıyıl tatili ve ders yılı sonu.
 * Takvim her yıl haziran ortasından itibaren MEB'in sitesinde duyurulur (kesin tarih yok); sunucu her gün tarar,
 * bulunca bu biçimde saklar. Eğitim yılı 1 Eylül'de başlar: `startYear` 2026 ise 2026-2027 eğitim yılıdır.
 */

export interface AcademicBreak {
  /** "Birinci Dönem Ara Tatili", "İkinci Dönem Ara Tatili" */
  name: string;
  start: string;
  end: string;
}

export interface AcademicCalendarData {
  /** Derslerin başladığı gün */
  lessonsStart: string;
  /** Birinci dönemin son günü */
  term1End: string;
  /** İkinci dönemin ilk günü */
  term2Start: string;
  /** Ders yılının son günü (karne) */
  lessonsEnd: string;
  /** Ara tatiller (yarıyıl tatili hariç) */
  breaks: AcademicBreak[];
}

export const SEMESTER_BREAK = 'Yarıyıl Tatili';
export const SUMMER_BREAK = 'Yaz Tatili';

/** "2026-2027" */
export const academicYearLabel = (startYear: number) => `${startYear}-${startYear + 1}`;

/** Bir tarihin ait olduğu eğitim yılı (1 Eylül başlangıç): 2027-03-10 -> 2026 */
export const academicYearOf = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 9 ? y : y - 1;
};

const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());
/** Aralığın başındaki ve sonundaki hafta sonu günlerini atar (MEB tatilleri iş günleriyle duyurur: 25 Ocak – 5 Şubat) */
function trimWeekends(start: string, end: string): { start: string; end: string } {
  while (start < end && isWeekend(start)) start = addDays(start, 1);
  while (end > start && isWeekend(end)) end = addDays(end, -1);
  return { start, end };
}

/** Yarıyıl tatili: birinci dönemin bitişi ile ikinci dönemin başlangıcı arasındaki iş günleri */
export const semesterBreak = (cal: AcademicCalendarData) => trimWeekends(addDays(cal.term1End, 1), addDays(cal.term2Start, -1));

/**
 * Takvimdeki tatil günleri: ara tatiller, yarıyıl tatili ve yaz tatili (ders yılı sonundan sonraki eğitim yılının
 * derslerine kadar; o takvim henüz yoksa 31 Ağustos'a kadar). Ders başlamadan önceki eylül günleri önceki yılın
 * yaz tatiline girer. Resmî tatiller (bayramlar) ayrıca hesaplanır ve aynı güne düşerse onların adı görünür.
 */
export function academicHolidays(cal: AcademicCalendarData, startYear: number, nextLessonsStart?: string | null): { date: string; name: string }[] {
  const out: { date: string; name: string }[] = [];
  const range = (from: string, to: string, name: string) => {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, name });
  };
  for (const b of cal.breaks) range(b.start, b.end, b.name);
  const sem = semesterBreak(cal);
  range(sem.start, sem.end, SEMESTER_BREAK);
  const summer = trimWeekends(addDays(cal.lessonsEnd, 1), nextLessonsStart ? addDays(nextLessonsStart, -1) : `${startYear + 1}-08-31`);
  range(summer.start, summer.end, SUMMER_BREAK);
  return out;
}

/** Takvimin tutarlılığı: tarihler eğitim yılının içinde ve sıralı mı. Sorun yoksa null. */
export function validateAcademicCalendar(cal: AcademicCalendarData, startYear: number): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const all = [cal.lessonsStart, cal.term1End, cal.term2Start, cal.lessonsEnd, ...cal.breaks.flatMap((b) => [b.start, b.end])];
  if (all.some((d) => !iso.test(d))) return 'Tarih biçimi geçersiz.';
  const from = `${startYear}-08-15`;
  const to = `${startYear + 1}-07-15`;
  if (all.some((d) => d < from || d > to)) return `Tarihler ${academicYearLabel(startYear)} eğitim yılının dışında.`;
  if (!(cal.lessonsStart < cal.term1End && cal.term1End < cal.term2Start && cal.term2Start < cal.lessonsEnd)) {
    return 'Sıra hatalı: dersler başlar < birinci dönem biter < ikinci dönem başlar < ders yılı biter olmalı.';
  }
  for (const b of cal.breaks) {
    if (b.start > b.end) return `${b.name}: başlangıç bitişten sonra.`;
    if (b.start < cal.lessonsStart || b.end > cal.lessonsEnd) return `${b.name} ders yılının dışında.`;
  }
  return null;
}

/* ---------- MEB duyurusunu okuma ---------- */

const MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const MONTH_RE = `(${MONTHS.join('|')})`;
const lower = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/i̇/g, 'i');

/** Ay ve gün (yıl yazılmamışsa eğitim yılından: eylül–aralık başlangıç yılı, ocak–ağustos sonraki yıl) */
function toIso(day: number, monthName: string, year: number | null, startYear: number): string | null {
  const m = MONTHS.indexOf(monthName) + 1;
  if (!m || day < 1 || day > 31) return null;
  const y = year ?? (m >= 9 ? startYear : startYear + 1);
  return `${y}-${pad(m)}-${pad(day)}`;
}

type Mention = { start: string; end: string; at: number; to: number };

/** Metindeki tarih ve tarih aralıkları: "16-20 Kasım 2026", "25 Ocak - 5 Şubat 2027", "14 Eylül 2026", "14 Eylül" */
function dateMentions(text: string, startYear: number): Mention[] {
  const out: Mention[] = [];
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => !taken.some(([x, y]) => a < y && b > x);
  const push = (m: RegExpExecArray, start: string | null, end: string | null) => {
    if (!start || !end || !free(m.index, m.index + m[0].length)) return;
    taken.push([m.index, m.index + m[0].length]);
    out.push({ start, end, at: m.index, to: m.index + m[0].length });
  };
  const Y = '(?:\\s+(\\d{4}))?';
  // Ayları farklı aralık: 25 Ocak - 5 Şubat 2027
  for (const m of text.matchAll(new RegExp(`(\\d{1,2})\\s+${MONTH_RE}${Y}\\s*[-–]\\s*(\\d{1,2})\\s+${MONTH_RE}${Y}`, 'g'))) {
    const y2 = m[6] ? Number(m[6]) : null;
    const y1 = m[3] ? Number(m[3]) : y2 && MONTHS.indexOf(m[2]!) > MONTHS.indexOf(m[5]!) ? y2 - 1 : y2;
    push(m as RegExpExecArray, toIso(Number(m[1]), m[2]!, y1, startYear), toIso(Number(m[4]), m[5]!, y2, startYear));
  }
  // Aynı ay: 16-20 Kasım 2026, 16 - 20 Kasım
  for (const m of text.matchAll(new RegExp(`(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+${MONTH_RE}${Y}`, 'g'))) {
    const y = m[4] ? Number(m[4]) : null;
    push(m as RegExpExecArray, toIso(Number(m[1]), m[3]!, y, startYear), toIso(Number(m[2]), m[3]!, y, startYear));
  }
  // Tek gün: 14 Eylül 2026
  for (const m of text.matchAll(new RegExp(`(\\d{1,2})\\s+${MONTH_RE}${Y}`, 'g'))) {
    const d = toIso(Number(m[1]), m[2]!, m[3] ? Number(m[3]) : null, startYear);
    push(m as RegExpExecArray, d, d);
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Tarihin anlamını önündeki son anahtar sözden çıkarır */
const KEYS: { re: RegExp; key: 'break' | 'semester' | 'term1' | 'term2' | 'year' | 'ignore' }[] = [
  { re: /yarıyıl tatil|yarı yıl tatil|sömestr/g, key: 'semester' },
  { re: /ara tatil/g, key: 'break' },
  { re: /(birinci|1\.)\s*dönem/g, key: 'term1' },
  { re: /(ikinci|2\.)\s*dönem/g, key: 'term2' },
  { re: /ders yılı|dersler|eğitim ve öğretim yılı|eğitim öğretim yılı/g, key: 'year' },
  // Öğretmenlerin mesleki çalışması, uyum haftası, sınavlar: tatil değil
  { re: /mesleki çalışma|öğretmenler|uyum (?:haftası|eğitimi|programı)|sınav/g, key: 'ignore' },
];

const STARTS = /başla|açıl/;
const ENDS = /sona er|bitecek|biter|tamamlan|kapan|karne/;

/**
 * MEB'in "… Eğitim ve Öğretim Yılı Çalışma Takvimi" duyurusunun metninden takvimi çıkarır. Kalıplar: "dersler
 * 14 Eylül 2026 Pazartesi günü başlayacak", "birinci dönem 22 Ocak 2027 Cuma günü sona erecek", "yarıyıl tatili
 * 25 Ocak-5 Şubat 2027", "birinci dönem ara tatili 16-20 Kasım 2026", "ders yılı 25 Haziran 2027'de sona erecek".
 * Bulunamayan ya da tutarsız takvimde null döner (sunucu sonra yeniden dener, platform yöneticisine bildirir).
 */
export function parseMebCalendar(rawText: string, startYear: number): AcademicCalendarData | null {
  const text = lower(rawText.replace(/\s+/g, ' '));
  // Cümlelere böl (tarihteki noktalar "1. dönem" gibi kalır: noktadan sonra boşluk ve harf gelmeli)
  const sentences = text.split(/(?<=[.!?;])\s+(?=[a-zçğıöşü"“])/u);
  let lessonsStart: string | null = null;
  let lessonsEnd: string | null = null;
  let term1End: string | null = null;
  let term2Start: string | null = null;
  let semStart: string | null = null;
  let semEnd: string | null = null;
  const breaks: { start: string; end: string }[] = [];

  for (const s of sentences) {
    const keys = KEYS.flatMap((k) => [...s.matchAll(k.re)].map((m) => ({ at: m.index!, end: m.index! + m[0].length, key: k.key })));
    for (const d of dateMentions(s, startYear)) {
      // Önündeki en yakın anahtar söz; "birinci dönem ara tatili" gibi iç içe ifadelerde daha özel olan (ara tatil) kazanır
      const before = keys.filter((k) => k.end <= d.at).sort((a, b) => b.at - a.at);
      const key = before[0]?.key;
      if (!key || key === 'ignore') continue;
      const tail = s.slice(d.to, d.to + 60);
      const verb = STARTS.test(tail) ? 'start' : ENDS.test(tail) ? 'end' : null;
      const isRange = d.start !== d.end;
      if (key === 'break' && isRange) breaks.push({ start: d.start, end: d.end });
      else if (key === 'semester') {
        if (isRange) [semStart, semEnd] = [d.start, d.end];
        else if (verb === 'start') semStart = d.start;
        else if (verb === 'end') semEnd = d.start;
      } else if (key === 'term1' && !isRange) {
        if (verb === 'end') term1End = d.start;
        else if (verb === 'start') lessonsStart ??= d.start;
      } else if (key === 'term2' && !isRange) {
        if (verb === 'start') term2Start = d.start;
        else if (verb === 'end') lessonsEnd = d.start;
      } else if (key === 'year' && !isRange) {
        if (verb === 'start' && d.start.slice(5, 7) >= '08') lessonsStart ??= d.start;
        else if (verb === 'end' && d.start.slice(5, 7) <= '07') lessonsEnd = d.start;
      }
    }
  }

  // Eksikleri birbirinden çıkar: yarıyıl tatili birinci dönemin ertesi günü başlar, ikinci dönemden önceki gün biter
  term1End ??= semStart ? addDays(semStart, -3) : null;
  if (semStart && term1End && term1End >= semStart) term1End = addDays(semStart, -1);
  term2Start ??= semEnd ? nextMonday(semEnd) : null;
  if (!lessonsStart || !lessonsEnd || !term1End || !term2Start) return null;
  // Yarıyıl tatili yazıyorsa onun sınırları esas: birinci dönem tatilden önce, ikinci dönem sonra
  if (semStart) term1End = lastWeekdayBefore(semStart);
  if (semEnd) term2Start = nextMonday(semEnd);

  const uniq = [...new Map(breaks.map((b) => [`${b.start}|${b.end}`, b])).values()].sort((a, b) => a.start.localeCompare(b.start));
  const cal: AcademicCalendarData = {
    lessonsStart,
    term1End,
    term2Start,
    lessonsEnd,
    breaks: uniq
      .filter((b) => b.start > lessonsStart! && b.end < lessonsEnd! && !(b.start <= term2Start! && b.end >= term1End!))
      .map((b) => ({ ...b, name: b.start < term1End! ? 'Birinci Dönem Ara Tatili' : 'İkinci Dönem Ara Tatili' })),
  };
  return validateAcademicCalendar(cal, startYear) ? null : cal;
}

const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
/** Cuma biten tatilden sonraki pazartesi */
function nextMonday(iso: string): string {
  let d = addDays(iso, 1);
  while (weekday(d) !== 1) d = addDays(d, 1);
  return d;
}
/** Pazartesi başlayan tatilden önceki son iş günü (cuma) */
function lastWeekdayBefore(iso: string): string {
  let d = addDays(iso, -1);
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, -1);
  return d;
}

/** Duyuru başlığı bu eğitim yılının çalışma takvimi mi? ("2026-2027 Eğitim Öğretim Yılı Takvimi Açıklandı") */
export function isCalendarTitle(title: string, startYear: number): boolean {
  const t = lower(title);
  return new RegExp(`${startYear}\\s*[-–/]\\s*${startYear + 1}`).test(t) && /takvim/.test(t);
}

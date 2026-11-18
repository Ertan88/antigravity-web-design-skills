import { semesterBreak, type AcademicCalendarData } from './academicCalendar.ts';
import { fixedHolidays, officialHolidays } from './holidays.ts';

/*
 * MEB takvimi "takvim yaprakları" görünümü (C): eğitim yılının olayları sırayla, iki grupta (1. dönem, 2. dönem).
 * Liste "Ders yılı biter" ile biter: yaz tatili ve içindeki resmî günler gösterilmez.
 * MEB tarihlerinin yanına resmî ve dini tatiller eklenir. Çok günlü bayramlar tek satırdır; arife (yarım gün) notta
 * yazar. Hafta sonuna ya da okul tatiline denk gelen bayram ayrıca belirtilir (ders günü kaybı olmaz).
 */

export type LeafKind = 'term' | 'break' | 'summer' | 'official' | 'religious';

export interface CalendarLeaf {
  key: string;
  kind: LeafKind;
  name: string;
  start: string;
  /** Çok günlüyse son gün */
  end?: string;
  /** "5 gün", "Arife 8 Mart öğleden sonra · ara tatile denk geliyor" gibi ek bilgi */
  note?: string;
  group: 1 | 2;
}

const DAY = 86400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const MONTHS = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const dayMonth = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7))]}`;
const span = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;

function lengthText(start: string, end: string) {
  const n = span(start, end);
  // Pazartesiden cumaya süren tatil haftayla söylenir (25 Ocak – 5 Şubat: 2 hafta)
  if (n >= 12 && weekday(start) === 1 && weekday(end) === 5 && (n + 2) % 7 === 0) return `${(n + 2) / 7} hafta`;
  return `${n} gün`;
}

/** Resmî ve dini tatiller: aynı bayramın günleri birleştirilir, arife ayrı tutulur */
function holidayRuns(startYear: number) {
  const from = `${startYear}-09-01`;
  const to = `${startYear + 1}-08-31`;
  // Dini bayramlar ve sabit tatiller ayrı alınır: aynı güne düşen ikisi de görünsün (19 Mayıs 2027 = Kurban 4. gün)
  const religious = [...officialHolidays(startYear), ...officialHolidays(startYear + 1)].filter(([, name]) => /Ramazan|Kurban/.test(name));
  const fixed = [...fixedHolidays(startYear), ...fixedHolidays(startYear + 1)];
  const all = [...religious, ...fixed]
    .filter(([d]) => d >= from && d <= to)
    .sort(([a, an], [b, bn]) => a.localeCompare(b) || an.localeCompare(bn));
  const runs: { name: string; start: string; end: string; eve?: string; religious: boolean }[] = [];
  const eves = new Map<string, string>();
  for (const [d, name] of all) {
    if (name.endsWith('Arifesi')) {
      eves.set(name.replace(/ Arifesi$/, ''), d);
      continue;
    }
    const base = name.replace(/ \d+\. Gün$/, '');
    const last = [...runs].reverse().find((r) => r.name === base);
    if (last && addDays(last.end, 1) === d) last.end = d;
    else runs.push({ name: base, start: d, end: d, religious: /Ramazan|Kurban/.test(base) });
  }
  for (const r of runs) r.eve = eves.get(r.name);
  return runs;
}

/** "Birinci Dönem Ara Tatili" → "1. dönem ara tatili" (kısa ve listedeki öteki adlarla aynı yazım) */
export const breakName = (name: string) =>
  name.replace(/^Birinci Dönem /, '1. dönem ').replace(/^İkinci Dönem /, '2. dönem ').replace(/Ara Tatili$/, 'ara tatili');

export function calendarLeaves(data: AcademicCalendarData, startYear: number): CalendarLeaf[] {
  const sem = semesterBreak(data);
  const breaks = [...data.breaks.map((b) => ({ name: b.name, start: b.start, end: b.end })), { name: 'Yarıyıl tatili', ...sem }];
  const groupOf = (iso: string): 1 | 2 => (iso < data.term2Start ? 1 : 2);
  const leaves: CalendarLeaf[] = [
    { key: 'start', kind: 'term', name: 'Dersler başlar', start: data.lessonsStart, group: 1 },
    { key: 't1', kind: 'term', name: '1. dönem biter', start: data.term1End, group: 1 },
    { key: 'sem', kind: 'break', name: 'Yarıyıl tatili', start: sem.start, end: sem.end, note: lengthText(sem.start, sem.end), group: 1 },
    { key: 't2', kind: 'term', name: '2. dönem başlar', start: data.term2Start, group: 2 },
    { key: 'end', kind: 'term', name: 'Ders yılı biter', start: data.lessonsEnd, group: 2 },
    ...data.breaks.map(
      (b): CalendarLeaf => ({ key: `b-${b.start}`, kind: 'break', name: breakName(b.name), start: b.start, end: b.end, note: lengthText(b.start, b.end), group: groupOf(b.start) }),
    ),
  ];
  // Yaz tatili ve içindeki günler listede yer almaz (ders yılı biter son olaydır); tatil hesabı (zil, pano) bundan etkilenmez
  const runs = holidayRuns(startYear).filter((h) => h.start <= data.lessonsEnd);
  for (const h of runs) {
    const notes: string[] = [];
    if (h.end !== h.start) notes.push(lengthText(h.start, h.end));
    if (h.eve) notes.push(`arife ${dayMonth(h.eve)} öğleden sonra`);
    const inBreak = breaks.find((b) => h.start >= b.start && h.start <= b.end);
    const inBayram = !h.religious && runs.find((r) => r.religious && h.start >= r.start && h.start <= r.end);
    const allWeekend = Array.from({ length: span(h.start, h.end) }, (_, i) => weekday(addDays(h.start, i))).every((w) => w === 0 || w === 6);
    if (inBayram) notes.push(`${inBayram.name} içinde`);
    else if (inBreak) notes.push(`${inBreak.name.toLocaleLowerCase('tr-TR').replace(/^birinci dönem /, '').replace(/^ikinci dönem /, '')} içinde`);
    else if (allWeekend) notes.push('hafta sonuna denk geliyor');
    leaves.push({ key: `h-${h.start}`, kind: h.religious ? 'religious' : 'official', name: h.name, start: h.start, ...(h.end !== h.start ? { end: h.end } : {}), note: notes.join(' · ') || undefined, group: groupOf(h.start) });
  }
  return leaves.sort((a, b) => a.start.localeCompare(b.start) || (a.kind === 'term' ? -1 : 1));
}

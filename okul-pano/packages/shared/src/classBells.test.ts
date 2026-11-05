import { describe, expect, it } from 'vitest';
import { compressDay, endAfter, generatePeriods, pickSchedule, ringNow, setGapAfter, shiftPeriods, type BellScheduleLike, type Period } from './bell.ts';
import { bellClassDays, lessonsNow } from './bellPlan.ts';
import { classBell, dayBells, schoolDay, schoolLessonCounts, scheduleTarget, schoolTarget, type SchoolCalendar } from './schoolDay.ts';

/*
 * Sentetik okul: Standart zil (10 ders, öğle 60 dk, teneffüs 10 dk); 12. sınıflar için "11 dersli gün" (öğle 40 dk,
 * öğleden sonra teneffüs 5 dk). Pazartesi 12'lerin 10 dersi var (standart), Salı 11 dersi var (özel düzen).
 */
const std = generatePeriods({ firstStart: '08:30', lessonMin: 40, breakMin: 10, count: 10, lunchAfter: 5, lunchMin: 60 });
const eleven: Period[] = [
  ...std.slice(0, 5),
  ...generatePeriods({ firstStart: '13:10', lessonMin: 40, breakMin: 5, count: 6 }).map((p, i) => ({ ...p, no: i + 6 })),
];
const schedules: BellScheduleLike[] = [
  { id: 'std', name: 'Standart', weekdays: [], periods: std, lessonCount: 10 },
  { id: '11111111-1111-4111-8111-111111111111', name: '11 dersli gün', weekdays: [], periods: eleven, lessonCount: 11, classIds: ['c12a', 'c12b'] },
];
const classes = [
  { id: 'c9', name: '9-A' },
  { id: 'c10', name: '10-A' },
  { id: 'c12a', name: '12-A' },
  { id: 'c12b', name: '12-B' },
];
const entries = [
  // Pazartesi (1): 9-A 8 ders, 12'ler 10 ders
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ weekday: 1, periodNo: n, classId: 'c9' })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((n) => [{ weekday: 1, periodNo: n, classId: 'c12a' }, { weekday: 1, periodNo: n, classId: 'c12b' }]),
  // Salı (2): 9-A ve 10-A 8 ders, 12'ler 11 ders
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [{ weekday: 2, periodNo: n, classId: 'c9' }, { weekday: 2, periodNo: n, classId: 'c10' }]),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].flatMap((n) => [{ weekday: 2, periodNo: n, classId: 'c12a' }, { weekday: 2, periodNo: n, classId: 'c12b' }]),
];
const MON = '2026-11-09';
const TUE = '2026-11-10';
const cal = (extra: Partial<SchoolCalendar> = {}): SchoolCalendar => ({ schedules, holidays: [], halfDays: [], bellClasses: bellClassDays(entries, classes), ...extra });
const sec = (hm: string) => Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(3)) * 60;

describe('sınıfa özel zil', () => {
  it('okul geneli seçim sınıfa özel düzeni kullanmaz', () => {
    expect(pickSchedule(schedules, 2, { lessonCount: 11 })?.id).toBe('std');
  });

  it('Pazartesi: 12. sınıfların 10 dersi var, herkes standart zilde (tek zil, 10. derste biter)', () => {
    const bells = dayBells(MON, cal());
    expect(bells).toHaveLength(1);
    expect(bells[0]!.periods).toHaveLength(10);
    expect(classBell(bells, 'c12a')?.target).toBe(schoolTarget('morning'));
  });

  it('Salı: 12. sınıflar 11 dersli zile geçer, diğerleri standart zilde 8. derste biter', () => {
    const bells = dayBells(TUE, cal());
    expect(bells.map((b) => b.target)).toEqual([schoolTarget('morning'), scheduleTarget(schedules[1]!.id)]);
    expect(bells[0]!.lessonCount).toBe(8);
    expect(bells[0]!.periods.at(-1)).toMatchObject({ no: 8, start: '15:10', end: '15:50' });
    expect(classBell(bells, 'c12b')?.periods.at(-1)).toMatchObject({ no: 11, end: '17:35' });
    expect(classBell(bells, 'c9')?.periods.find((p) => p.no === 6)?.start).toBe('13:30');
    expect(classBell(bells, 'c12a')?.periods.find((p) => p.no === 6)?.start).toBe('13:10');
    // Eksik düzen uyarısı için okul geneli ders sayısı 12'leri saymaz
    expect(schoolLessonCounts(cal())?.['morning:2']).toBe(8);
  });

  it('şu an derste olanlar her sınıfın kendi zilinden', () => {
    const tt = [
      { weekday: 2, periodNo: 7, classId: 'c9', subject: 'Mat' },
      { weekday: 2, periodNo: 7, classId: 'c12a', subject: 'Fizik' },
      { weekday: 2, periodNo: 8, classId: 'c12a', subject: 'Kimya' },
    ];
    // 14:40: 9-A 7. derste (14:20–15:00); 12-A 8. derste (14:40–15:20)
    const now = lessonsNow(tt, TUE, cal(), classes, false, sec('14:40'));
    expect(now.map((e) => `${e.classId}:${e.periodNo}`)).toEqual(['c9:7', 'c12a:8']);
  });

  it('elle müdahale yalnızca o gün ve o zil için geçerli', () => {
    const changed = setGapAfter(schoolDay(TUE, cal()).periods, 5, 75);
    const c = cal({ overrides: [{ date: TUE, target: schoolTarget('morning'), periods: changed, note: 'Tören' }] });
    const day = schoolDay(TUE, c);
    expect(day.overridden).toBe(true);
    expect(day.periods.find((p) => p.no === 6)?.start).toBe('13:45');
    expect(day.basePeriods?.find((p) => p.no === 6)?.start).toBe('13:30');
    // 12'lerin zili ve başka gün değişmez
    expect(classBell(dayBells(TUE, c), 'c12a')?.periods.find((p) => p.no === 6)?.start).toBe('13:10');
    expect(schoolDay(MON, c).overridden).toBe(false);
  });
});

describe('elle müdahale yardımcıları', () => {
  const day = std.slice(0, 8);
  it('kaydırır, öğle arasını değiştirir, erken bitirir', () => {
    expect(shiftPeriods(day, 7, 10).find((p) => p.no === 7)).toMatchObject({ start: '14:30', end: '15:10' });
    expect(shiftPeriods(day, 7, 10).find((p) => p.no === 6)).toMatchObject({ start: '13:30' });
    expect(setGapAfter(day, 5, 45).find((p) => p.no === 6)?.start).toBe('13:15');
    expect(endAfter(day, 6)).toHaveLength(6);
  });
  it('kısaltılmış gün öğle arasını korur', () => {
    const short = compressDay(day, 30, 5);
    expect(short[0]).toMatchObject({ start: '08:30', end: '09:00' });
    expect(short[1]).toMatchObject({ start: '09:05' });
    expect(short[5]!.start).toBe('12:20'); // 5. ders 10:50–11:20, öğle arası 60 dk korunur
  });
  it('zili şimdi çal: ders hemen biter, sonrakiler öne alınır', () => {
    const rung = ringNow(day, '10:30');
    expect(rung.find((p) => p.no === 3)).toMatchObject({ start: '10:10', end: '10:30' });
    expect(rung.find((p) => p.no === 4)).toMatchObject({ start: '10:40', end: '11:20' });
  });
});

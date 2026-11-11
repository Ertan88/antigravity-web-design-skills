import { describe, expect, it } from 'vitest';
import { generatePeriods } from './bell.ts';
import { boardBell, latestClasses, lessonCounts, lessonsNow, missingLessonCounts, type ClassBell } from './bellPlan.ts';
import { schoolDay } from './schoolDay.ts';
import { parseClock } from './time.ts';

const rule = (count: number, lunchMin: number, afternoonBreakMin: number, firstStart = '08:00') =>
  generatePeriods({ firstStart, lessonMin: 40, breakMin: 10, count, lunchAfter: 5, lunchMin, afternoonBreakMin });
// Okulun düzenleri: 9 derslik gün e-Okul saatleri; uzun günlerde öğle arası 40 dk, öğleden sonra teneffüs 5 dk
const d9 = { id: 'd9', name: '9 derslik gün', weekdays: [], lessonCount: 9, periods: rule(9, 60, 10) };
const d10 = { id: 'd10', name: '10 derslik gün', weekdays: [], lessonCount: 10, periods: rule(10, 40, 5) };
const d11 = { id: 'd11', name: '11 derslik gün', weekdays: [], lessonCount: 11, periods: rule(11, 40, 5) };
const MON = '2026-11-02';
const TUE = '2026-11-03';
const WED = '2026-11-04';
const at = (hm: string) => parseClock(hm);
const lessons = (classId: string, weekday: number, n: number, from = 1) =>
  Array.from({ length: n - from + 1 }, (_, i) => ({ weekday, periodNo: from + i, classId, classGroupId: classId }));

describe('ders sayısına göre tek zil', () => {
  const classes: ClassBell[] = [{ id: 'c9' }, { id: 'c12' }, { id: 'f', bellExempt: true }];
  const entries = [
    ...lessons('c9', 1, 9),
    ...lessons('c9', 2, 9),
    ...lessons('c9', 3, 9),
    ...lessons('c12', 1, 10),
    ...lessons('c12', 2, 11),
    ...lessons('c12', 3, 8),
    // Özel eğitim günün ders sayısını belirlemez
    ...lessons('f', 3, 12, 2),
  ];
  const counts = lessonCounts(entries, classes, false);
  const cal = { schedules: [d9, d10, d11], holidays: [], halfDays: [], lessonCounts: counts };

  it('günün ders sayısı en geç biten sınıfın son dersi', () => {
    expect(counts).toEqual({ 'morning:1': 10, 'morning:2': 11, 'morning:3': 9 });
    expect(latestClasses(entries, classes, false, 2, 'morning')).toEqual(['c12']);
  });

  it('her gün kendi düzeni; zil son derste biter', () => {
    expect(schoolDay(MON, cal).periods.at(-1)).toMatchObject({ no: 10, end: '16:20' });
    expect(schoolDay(TUE, cal).periods.at(-1)).toMatchObject({ no: 11, end: '17:05' });
    expect(schoolDay(WED, cal).periods.at(-1)).toMatchObject({ no: 9, end: '16:10' });
    // Salı 6. ders 40 dk öğle arasından sonra
    expect(schoolDay(TUE, cal).periods[5]).toMatchObject({ start: '12:40' });
  });

  it('şu an derste: dersi bitmiş sınıf listede yok', () => {
    expect(lessonsNow(entries, TUE, cal, classes, false, at('16:30')).map((e) => e.classId)).toEqual(['c12']);
    expect(lessonsNow(entries, TUE, cal, classes, false, at('09:00')).map((e) => e.classId).sort()).toEqual(['c12', 'c9']);
  });

  it('düzeni olmayan ders sayısı', () => {
    expect(missingLessonCounts([d9, d11], counts, 'morning')).toEqual([10]);
    // Pazartesi için bir büyüğü (11) kullanılır
    expect(schoolDay(MON, { ...cal, schedules: [d9, d11] }).periods.at(-1)).toMatchObject({ no: 10, end: '16:20' });
  });
});

describe('ikili öğretim', () => {
  const sabah = { id: 's', name: 'Sabahçı 7', weekdays: [], lessonCount: 7, periods: generatePeriods({ firstStart: '07:30', lessonMin: 40, breakMin: 5, count: 7 }) };
  const ogle = { id: 'o', name: 'Öğlenci 7', weekdays: [], lessonCount: 7, shift: 'afternoon' as const, periods: generatePeriods({ firstStart: '12:50', lessonMin: 40, breakMin: 5, count: 7 }) };
  const classes: ClassBell[] = [{ id: 'a', shift: 'morning' }, { id: 'b', shift: 'afternoon' }];
  const entries = [...lessons('a', 2, 7), ...lessons('b', 2, 6)];
  const cal = { schedules: [sabah, ogle], holidays: [], halfDays: [], lessonCounts: lessonCounts(entries, classes, true) };

  it('vardiyaların ders sayısı ve zili ayrı', () => {
    expect(cal.lessonCounts).toEqual({ 'morning:2': 7, 'afternoon:2': 6 });
    expect(schoolDay(TUE, cal, 'afternoon').periods.at(-1)?.no).toBe(6);
  });

  it('pano: sabah sabahçı, sabahçı dersleri bitince öğlenci zili', () => {
    expect(boardBell(TUE, cal, true, at('09:00')).shift).toBe('morning');
    expect(boardBell(TUE, cal, true, at('12:45')).shift).toBe('afternoon');
    expect(boardBell(TUE, cal, false, at('14:00')).shift).toBe('morning');
  });

  it('şu an derste: her sınıf kendi vardiyasının zilini izler', () => {
    expect(lessonsNow(entries, TUE, cal, classes, true, at('13:00')).map((e) => e.classId)).toEqual(['b']);
    expect(lessonsNow(entries, TUE, cal, classes, true, at('08:00')).map((e) => e.classId)).toEqual(['a']);
  });
});

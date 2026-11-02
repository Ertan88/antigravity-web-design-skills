import { describe, expect, it } from 'vitest';
import { generatePeriods } from './bell.ts';
import { bellGroups, boardBell, classDay, lessonsNow, teacherClashes, type ClassBell } from './bellPlan.ts';
import { parseClock } from './time.ts';

// e-Okul'daki gibi tek zil: 08:00, 40 dk ders, 10 dk teneffüs, 5. dersten sonra 60 dk öğle, 11 ders
const eokul = { id: 'z', name: 'Ders saatleri', weekdays: [1, 2, 3, 4, 5], periods: generatePeriods({ firstStart: '08:00', lessonMin: 40, breakMin: 10, count: 11, lunchAfter: 5, lunchMin: 60 }) };
// Sabahçı / öğlenci (ikili öğretim)
const morning = { id: 'm', name: 'Sabahçı', weekdays: [1, 2, 3, 4, 5], periods: generatePeriods({ firstStart: '07:30', lessonMin: 40, breakMin: 5, count: 7 }) };
const noon = { id: 'n', name: 'Öğlenci', weekdays: [], periods: generatePeriods({ firstStart: '12:50', lessonMin: 40, breakMin: 5, count: 7 }) };
const cal = (schedules: typeof eokul[]) => ({ schedules, holidays: [], halfDays: [] });
const TUE = '2026-11-03';
const WED = '2026-11-04';
const at = (hm: string) => parseClock(hm);
const OFFSITE = ['İşletmelerde Mesleki Eğitim'];

const lessons = (classId: string, weekday: number, n: number, subject = 'Matematik', from = 1) =>
  Array.from({ length: n }, (_, i) => ({ weekday, periodNo: from + i, subject, classId, classGroupId: classId, teacherId: null as string | null }));

describe('zil düzeni', () => {
  const classes: ClassBell[] = [
    { id: 'c9', name: '9-A' },
    { id: 'c12', name: '12-A' },
    { id: 'f', name: '9-F', bellExempt: true },
  ];
  const entries = [
    ...lessons('c9', 2, 9),
    ...lessons('c12', 2, 11),
    ...lessons('c12', 3, 8, 'İşletmelerde Mesleki Eğitim'),
    ...lessons('c9', 3, 9),
    ...lessons('f', 2, 6, 'Türkçe', 2),
  ];
  const ctx = { cal: cal([eokul]), classes, offsiteSubjects: OFFSITE };

  it('sınıf yalnızca kendi ilk–son dersi boyunca derste', () => {
    const d9 = classDay(TUE, ctx.cal, classes[0]!, entries, OFFSITE);
    expect([d9.first, d9.last, d9.periods.length]).toEqual([1, 9, 9]);
    const d12 = classDay(TUE, ctx.cal, classes[1]!, entries, OFFSITE);
    expect(d12.periods.at(-1)).toMatchObject({ no: 11, end: '17:50' });
  });

  it('bütün dersleri okul dışında olan gün okulda sayılmaz', () => {
    expect(classDay(WED, ctx.cal, classes[1]!, entries, OFFSITE).off).toBe(true);
    expect(lessonsNow(entries, WED, ctx, at('09:00')).map((e) => e.classId)).toEqual(['c9']);
  });

  it('genel dersler bitince ek ders saatindeki sınıflar görünür; hesaba katılmayan sınıf listelenmez', () => {
    expect(lessonsNow(entries, TUE, ctx, at('16:30')).map((e) => e.classId)).toEqual(['c12']);
    expect(lessonsNow(entries, TUE, ctx, at('10:00')).map((e) => e.classId).sort()).toEqual(['c12', 'c9']);
  });

  it('pano zili: derste en çok sınıfın olduğu zil, son ders saatine kadar', () => {
    const b = boardBell(TUE, entries, ctx, at('10:00'));
    expect(b.schedule?.id).toBe('z');
    expect(b.periods.at(-1)?.no).toBe(11);
    // Çarşamba 12-A işletmede: zil 9. derste biter
    expect(boardBell(WED, entries, ctx, at('10:00')).periods.at(-1)?.no).toBe(9);
  });

  it('ikili öğretim: sabah sabahçı, öğleden sonra öğlenci zili', () => {
    const cls: ClassBell[] = [
      { id: 's1', name: '7-A' },
      { id: 's2', name: '7-B' },
      { id: 'o1', name: '5-A', bellPlan: { '1': 'n', '2': 'n', '3': 'n', '4': 'n', '5': 'n' } },
    ];
    const e = [...lessons('s1', 2, 7), ...lessons('s2', 2, 7), ...lessons('o1', 2, 7)];
    const c = { cal: cal([morning, noon]), classes: cls, offsiteSubjects: [] };
    expect(boardBell(TUE, e, c, at('09:00')).schedule?.id).toBe('m');
    expect(boardBell(TUE, e, c, at('14:00')).schedule?.id).toBe('n');
    expect(boardBell(TUE, e, c, at('07:00')).schedule?.id).toBe('m');
    expect(boardBell(TUE, e, c, at('09:00'), 'n').schedule?.id).toBe('n');
    expect(lessonsNow(e, TUE, c, at('14:00')).map((x) => x.classId)).toEqual(['o1']);
  });

  it('zil ataması grupları ve eksik ders saati', () => {
    const groups = bellGroups(classes, entries, [eokul], OFFSITE, [2, 3]);
    expect(groups).toHaveLength(2);
    const g12 = groups.find((g) => g.classIds.includes('c12'))!;
    expect(g12.days.map((d) => [d.first, d.last, d.offsite, d.end])).toEqual([
      [1, 11, false, '17:50'],
      [null, null, true, null],
    ]);
    const short = { ...eokul, periods: eokul.periods.slice(0, 9) };
    expect(bellGroups(classes, entries, [short], OFFSITE, [2]).find((g) => g.classIds.includes('c12'))!.days[0]!.missing).toEqual([10, 11]);
  });

  it('farklı zillerde öğretmen çakışması; aynı saatteki birleştirilmiş ders sayılmaz', () => {
    const cls: ClassBell[] = [
      { id: 'a', name: '11-A', bellPlan: { '2': 'n' } },
      { id: 'b', name: '9-C' },
      { id: 'c', name: '9-D' },
    ];
    const e = [
      { teacherId: 't', weekday: 2, periodNo: 1, classGroupId: 'b', subject: 'X' },
      { teacherId: 't', weekday: 2, periodNo: 1, classGroupId: 'c', subject: 'X' },
      { teacherId: 't', weekday: 2, periodNo: 7, classGroupId: 'a', subject: 'X' },
      { teacherId: 'u', weekday: 2, periodNo: 1, classGroupId: 'a', subject: 'X' },
      { teacherId: 'u', weekday: 2, periodNo: 7, classGroupId: 'b', subject: 'X' },
    ];
    // t: 9-C ve 9-D aynı saatte (birleşik) → çakışma yok; u: öğlenci 1. ders 12:20 ile sabahçı 7. ders 12:00–12:40 örtüşür
    const noonEarly = { ...noon, periods: generatePeriods({ firstStart: '12:20', lessonMin: 40, breakMin: 5, count: 7 }) };
    const c = teacherClashes(e, [morning, noonEarly], cls);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ teacherId: 'u', a: { className: '9-C', periodNo: 7 }, b: { className: '11-A', periodNo: 1 } });
  });
});

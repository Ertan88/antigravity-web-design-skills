import { describe, expect, it } from 'vitest';
import { gradeOf } from './grade.ts';
import { areaInitials, formatDays, monthVisitDates, mondayOf, trDate, weekVisitDate, internCells, internKey, internMonthDays, internshipClassIds, internTotals, isInternshipSubject, schoolHalvesFromTimetable, vocationalLessonShare, type InternStored } from './internship.ts';

describe('işletmede devam çizelgesi', () => {
  // Ekim 2026: 1 Ekim Perşembe; 28 Ekim arife (öğleden sonra tatil), 29 Ekim Cumhuriyet Bayramı
  const days = internMonthDays('2026-10', [{ date: '2026-10-29', name: 'Cumhuriyet Bayramı' }], [{ date: '2026-10-28', name: 'Cumhuriyet Bayramı Arifesi' }]);
  const marks = new Map<string, InternStored>([
    [internKey('2026-10-08', 'am'), 'D'],
    [internKey('2026-10-08', 'pm'), 'D'],
    [internKey('2026-10-14', 'pm'), 'R'],
    [internKey('2026-10-16', 'am'), 'K'],
    // İşletmede: koordinatörün koyduğu işaret
    [internKey('2026-10-02', 'am'), 'X'],
    [internKey('2026-10-02', 'pm'), 'X'],
    // Okul gününe düşen işaret yok sayılır (okulda devamı e-Okul tutar)
    [internKey('2026-10-05', 'am'), 'D'],
  ]);
  const school = new Map([
    [1, [true, true] as const],
    [2, [true, true] as const],
  ]);
  const cells = internCells(days, { school, marks, today: '2026-10-31' });
  const at = (d: number) => cells[d - 1];

  it('okul günleri O, hafta sonu W, işaretsiz işletme günleri ? (kontrol edilmedi)', () => {
    expect(days).toHaveLength(31);
    expect(at(1)).toEqual(['?', '?']);
    expect(at(3)).toEqual(['W', 'W']);
    expect(at(5)).toEqual(['O', 'O']);
    expect(at(6)).toEqual(['O', 'O']);
  });
  it('tatil ve arife: arifede yalnızca öğleden sonra', () => {
    expect(at(29)).toEqual(['TA', 'TA']);
    expect(at(28)).toEqual(['?', 'TA']);
  });
  it('öğretmen işaretleri yarım gün olarak', () => {
    expect(at(8)).toEqual(['D', 'D']);
    expect(at(14)).toEqual(['?', 'R']);
    expect(at(16)).toEqual(['K', '?']);
    expect(at(2)).toEqual(['X', 'X']);
  });
  it('henüz gelmemiş günler boş', () => {
    const early = internCells(days, { school, marks, today: '2026-10-21' });
    expect(early[21]).toEqual(['', '']);
    expect(early[20]).toEqual(['?', '?']);
  });
  it('toplamlar: R özürlü, D özürsüz, yarım gün 0,5', () => {
    const t = internTotals(cells);
    expect(t.unexcused).toBe(1);
    expect(t.excused).toBe(0.5);
    expect(t.closed).toBe(0.5);
    expect(t.holiday).toBe(1.5);
    expect(formatDays(t.unexcused + t.excused)).toBe('1,5');
    expect(t.business).toBe(1);
    expect(t.unchecked).toBeGreaterThan(0);
  });

  it('okul günleri ders programından: işletme dersi okul günü sayılmaz, karışık günde bölümler ayrılır', () => {
    expect(isInternshipSubject('İşletmelerde Mesleki Eğitim')).toBe(true);
    expect(isInternshipSubject('İŞLETMELERDE BECERİ EĞİTİMİ')).toBe(true);
    expect(isInternshipSubject('İş ve Beceri Uygulamaları')).toBe(false);
    const e = (weekday: number, n: number, subject: (p: number) => string) => Array.from({ length: n }, (_, i) => ({ weekday, periodNo: i + 1, subject: subject(i + 1) }));
    const halves = schoolHalvesFromTimetable([
      ...e(1, 10, () => 'Matematik'),
      ...e(3, 8, () => 'İşletmelerde Mesleki Eğitim'),
      ...e(4, 8, (p) => (p <= 4 ? 'Türk Dili ve Edebiyatı' : 'İşletmelerde Mesleki Eğitim')),
    ]);
    expect(halves.get(1)).toEqual([true, true]);
    expect(halves.get(3)).toEqual([false, false]);
    expect(halves.get(4)).toEqual([true, false]);
    expect(halves.get(5)).toBeUndefined();
  });

  it('İ ve H özürlü sayılır', () => {
    const t = internTotals([['İ', 'H'], ['R', 'D'], ['X', 'X']]);
    expect(t).toMatchObject({ excused: 1.5, unexcused: 0.5, permitted: 0.5, referred: 0.5, report: 0.5 });
  });

  it('öğrenci seçimi: işletme dersi olan 12. sınıflar; MESEM bütün sınıflar; program yoksa 12. sınıflar', () => {
    const classes = [
      { id: 'a', name: 'AMP 12-C' },
      { id: 'b', name: 'ATP 12-A' },
      { id: 'c', name: 'AMP 11-A' },
      { id: 'd', name: 'AMP 12-F', bellExempt: true },
      { id: 'e', name: 'AMP 10-A' },
      { id: 'f', name: 'AMP 9-A' },
      { id: 'g', name: 'Mobilya A' },
    ];
    const entries = [
      { classId: 'a', subject: 'İşletmelerde Mesleki Eğitim' },
      { classId: 'c', subject: 'İşletmelerde Mesleki Eğitim' },
      { classId: 'd', subject: 'İşletmede Beceri Eğitimi' },
      { classId: 'g', subject: 'İşletmelerde Beceri Eğitimi' },
      { classId: 'e', subject: 'Matematik' },
    ];
    const r = internshipClassIds(classes, entries, ['f'], gradeOf);
    // b: 12 ama işletme dersi yok; c: işletme dersi var ama 11; f: öğrencisi zaten işletmede
    expect([...r.ids].sort()).toEqual(['a', 'd', 'f', 'g']);
    expect([...r.withLesson].sort()).toEqual(['a', 'c', 'd', 'g']);
    expect(r.fallback).toBe(false);
    const mesem = internshipClassIds(classes, entries, [], gradeOf, { mesem: true });
    expect(mesem.ids.size).toBe(classes.length);
    // Program yok: 12. sınıflar (özel eğitim hariç)
    const noPlan = internshipClassIds(classes, [], [], gradeOf);
    expect(noPlan).toMatchObject({ fallback: true });
    expect([...noPlan.ids].sort()).toEqual(['a', 'b']);
    // Program yok, adlardan düzey çıkmıyor: bütün sınıflar
    const none = internshipClassIds([{ id: 'x', name: 'Mobilya A' }], [], [], gradeOf);
    expect(none).toMatchObject({ fallback: true });
    expect([...none.ids]).toEqual(['x']);
  });

  it('branşsız öğretmen ipucu: alana özgü ders payı', () => {
    const classes = ['11-A', '11-B', '11-C', '11-D'].map((n) => ({ id: n, name: n }));
    const entries = [
      ...classes.map((c) => ({ teacherId: 'mat', classId: c.id, subject: 'Matematik' })),
      { teacherId: 'mat', classId: '11-A', subject: 'Temel Matematik (Seçmeli)' },
      { teacherId: 'mob', classId: '11-A', subject: 'Panel Mobilya Üretimi' },
      { teacherId: 'mob', classId: '11-A', subject: 'Tasarım ve Malzeme Bilgisi' },
      { teacherId: 'mob', classId: '11-B', subject: 'Matematik' },
    ];
    const share = vocationalLessonShare(entries, classes, gradeOf);
    expect(share.get('mat')).toBeCloseTo(0.2);
    expect(share.get('mob')).toBeCloseTo(2 / 3);
  });
});

describe('rehberlik formları: görev tarihleri', () => {
  it('haftanın görev günü', () => {
    expect(weekVisitDate('2026-11-16', 4)).toBe('2026-11-19');
    expect(weekVisitDate('2026-11-16', null)).toBeNull();
    expect(mondayOf('2026-11-19')).toBe('2026-11-16');
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
  });
  it('ayın görev tarihleri tatili atlar', () => {
    const days = internMonthDays('2026-11', [{ date: '2026-11-19', name: 'Örnek tatil' }], []);
    expect(monthVisitDates(days, 4)).toEqual(['2026-11-05', '2026-11-12', '2026-11-26']);
    expect(monthVisitDates(days, null)).toEqual([]);
  });
  it('alan kısaltması ve tarih', () => {
    expect(areaInitials('Bilişim Teknolojileri')).toBe('BT');
    expect(areaInitials('Mobilya ve İç Mekân Tasarımı')).toBe('MİMT');
    expect(trDate('2026-11-05')).toBe('05.11.2026');
  });
});

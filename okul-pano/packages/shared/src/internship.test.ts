import { describe, expect, it } from 'vitest';
import { formatDays, internCells, internKey, internMonthDays, internTotals, isInternshipSubject, schoolHalvesFromTimetable, type InternMark } from './internship.ts';

describe('işletmede devam çizelgesi', () => {
  // Ekim 2026: 1 Ekim Perşembe; 28 Ekim arife (öğleden sonra tatil), 29 Ekim Cumhuriyet Bayramı
  const days = internMonthDays('2026-10', [{ date: '2026-10-29', name: 'Cumhuriyet Bayramı' }], [{ date: '2026-10-28', name: 'Cumhuriyet Bayramı Arifesi' }]);
  const marks = new Map<string, InternMark>([
    [internKey('2026-10-08', 'am'), 'D'],
    [internKey('2026-10-08', 'pm'), 'D'],
    [internKey('2026-10-14', 'pm'), 'R'],
    [internKey('2026-10-16', 'am'), 'K'],
    // Okul gününe düşen işaret yok sayılır (okulda devamı e-Okul tutar)
    [internKey('2026-10-05', 'am'), 'D'],
  ]);
  const school = new Map([
    [1, [true, true] as const],
    [2, [true, true] as const],
  ]);
  const cells = internCells(days, { school, marks, today: '2026-10-31' });
  const at = (d: number) => cells[d - 1];

  it('okul günleri O, hafta sonu W, işletme günleri X', () => {
    expect(days).toHaveLength(31);
    expect(at(1)).toEqual(['X', 'X']);
    expect(at(3)).toEqual(['W', 'W']);
    expect(at(5)).toEqual(['O', 'O']);
    expect(at(6)).toEqual(['O', 'O']);
  });
  it('tatil ve arife: arifede yalnızca öğleden sonra', () => {
    expect(at(29)).toEqual(['TA', 'TA']);
    expect(at(28)).toEqual(['X', 'TA']);
  });
  it('öğretmen işaretleri yarım gün olarak', () => {
    expect(at(8)).toEqual(['D', 'D']);
    expect(at(14)).toEqual(['X', 'R']);
    expect(at(16)).toEqual(['K', 'X']);
  });
  it('henüz gelmemiş günler boş', () => {
    const early = internCells(days, { school, marks, today: '2026-10-21' });
    expect(early[21]).toEqual(['', '']);
    expect(early[20]).toEqual(['X', 'X']);
  });
  it('toplamlar: R özürlü, D özürsüz, yarım gün 0,5', () => {
    const t = internTotals(cells);
    expect(t.unexcused).toBe(1);
    expect(t.excused).toBe(0.5);
    expect(t.closed).toBe(0.5);
    expect(t.holiday).toBe(1.5);
    expect(formatDays(t.unexcused + t.excused)).toBe('1,5');
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
});

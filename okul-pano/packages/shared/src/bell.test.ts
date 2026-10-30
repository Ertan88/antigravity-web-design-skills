import { describe, expect, it } from 'vitest';
import { computeBellStatus, generatePeriods, pickSchedule, validatePeriods, type Period } from './bell.ts';
import { parseClock } from './time.ts';

const periods: Period[] = generatePeriods({
  firstStart: '08:30',
  lessonMin: 40,
  breakMin: 10,
  count: 6,
  lunchAfter: 4,
  lunchMin: 45,
});

describe('generatePeriods', () => {
  it('ders, teneffüs ve öğle arasını kurala göre üretir', () => {
    expect(periods.map((p) => `${p.no} ${p.start}-${p.end}`)).toEqual([
      '1 08:30-09:10',
      '2 09:20-10:00',
      '3 10:10-10:50',
      '4 11:00-11:40',
      '5 12:25-13:05',
      '6 13:15-13:55',
    ]);
  });
});

describe('computeBellStatus', () => {
  it('ilk dersten önce derslerin başlamasına kalan süreyi verir', () => {
    const s = computeBellStatus(periods, parseClock('08:00'));
    expect(s).toMatchObject({ kind: 'before', remainingSec: 30 * 60 });
  });

  it('ders sırasında dersin bitmesine kalan süreyi verir', () => {
    const s = computeBellStatus(periods, parseClock('09:30') + 15);
    expect(s.kind).toBe('lesson');
    if (s.kind !== 'lesson') return;
    expect(s.period.no).toBe(2);
    expect(s.remainingSec).toBe(30 * 60 - 15);
    expect(s.next?.no).toBe(3);
  });

  it('teneffüste sıradaki derse kalan süreyi verir', () => {
    const s = computeBellStatus(periods, parseClock('09:12'));
    expect(s).toMatchObject({ kind: 'break', isLunch: false, remainingSec: 8 * 60 });
  });

  it('uzun arayı öğle arası olarak tanır', () => {
    const s = computeBellStatus(periods, parseClock('12:00'));
    expect(s).toMatchObject({ kind: 'break', isLunch: true, remainingSec: 25 * 60 });
  });

  it('ders bitiş anında teneffüse geçer (sınır değeri)', () => {
    expect(computeBellStatus(periods, parseClock('09:10')).kind).toBe('break');
    expect(computeBellStatus(periods, parseClock('09:20')).kind).toBe('lesson');
  });

  it('son dersten sonra okul çıkışı durumuna geçer', () => {
    expect(computeBellStatus(periods, parseClock('14:00')).kind).toBe('after');
  });

  it('çizelge boşsa kapalıdır', () => {
    expect(computeBellStatus([], 0).kind).toBe('off');
  });
});

describe('pickSchedule', () => {
  it('hafta gününe uyan çizelgeyi seçer, hafta sonu boş döner', () => {
    const weekday = { id: 'a', name: 'Hafta içi', weekdays: [1, 2, 3, 4], periods };
    const friday = { id: 'b', name: 'Cuma', weekdays: [5], periods: periods.slice(0, 4) };
    expect(pickSchedule([weekday, friday], 5)?.id).toBe('b');
    expect(pickSchedule([weekday, friday], 2)?.id).toBe('a');
    expect(pickSchedule([weekday, friday], 6)).toBeNull();
  });

  it('aynı günü kapsayan çizelgelerden daha özel olanı (az günlü) seçer', () => {
    const all = { id: 'a', name: 'Hafta içi', weekdays: [1, 2, 3, 4, 5], periods, sortOrder: 0 };
    const friday = { id: 'b', name: 'Cuma', weekdays: [5], periods: periods.slice(0, 4), sortOrder: 1 };
    expect(pickSchedule([all, friday], 5)?.id).toBe('b');
    expect(pickSchedule([all, friday], 4)?.id).toBe('a');
  });
});

describe('validatePeriods', () => {
  it('çakışmaları ve hatalı saatleri yakalar', () => {
    expect(validatePeriods(periods)).toBeNull();
    expect(validatePeriods([{ no: 1, start: '09:00', end: '08:00' }])).toMatch(/bitiş/);
    expect(
      validatePeriods([
        { no: 1, start: '08:00', end: '08:40' },
        { no: 2, start: '08:30', end: '09:10' },
      ]),
    ).toMatch(/çakışıyor/);
    expect(
      validatePeriods([
        { no: 1, start: '08:00', end: '08:40' },
        { no: 1, start: '09:00', end: '09:40' },
      ]),
    ).toMatch(/birden fazla/);
  });
});

import { describe, expect, it } from 'vitest';
import { detectHolidayText, holidayDatesInMonth, holidayFullName, monthFromText, officialHolidayOn } from './holidays.ts';

describe('tatiller', () => {
  it('resmi ve dini tatilleri bilir', () => {
    expect(officialHolidayOn('2026-10-29')).toBe('Cumhuriyet Bayramı');
    expect(officialHolidayOn('2026-05-27')).toBe('Kurban Bayramı 1. Gün');
    expect(officialHolidayOn('2026-03-19')).toBe('Ramazan Bayramı Arifesi');
    expect(officialHolidayOn('2026-10-27')).toBeNull();
  });

  it('hücredeki tatil yazısını öğretmen adından ayırır', () => {
    expect(detectHolidayText('29 EKİM CUMHURİYET BAYRAMI')).toBe('29 Ekim Cumhuriyet Bayramı');
    expect(detectHolidayText('RESMİ TATİL')).toBe('Resmi Tatil');
    expect(detectHolidayText('Kurban Bayramı 2. gün')).toBe('Kurban Bayramı 2. Gün');
    expect(detectHolidayText('Ayşe Demir')).toBeNull();
    expect(detectHolidayText('Bayram Yılmaz')).toBeNull();
  });

  it('tatil yazısının ay içindeki tarihini bulur', () => {
    expect(holidayDatesInMonth('29 Ekim Cumhuriyet Bayramı', 2026, 10)).toEqual(['2026-10-29']);
    expect(holidayDatesInMonth('Kurban Bayramı 2. Gün', 2026, 5)).toEqual(['2026-05-28']);
    expect(holidayDatesInMonth('Kurban Bayramı', 2026, 5)).toEqual(['2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30']);
    expect(holidayDatesInMonth('Ara tatil', 2026, 11)).toEqual([]);
  });

  it('başlıktaki ayı okur', () => {
    expect(monthFromText('AİT OLDUĞU AY: EKİM')).toEqual({ month: 10, year: null });
    expect(monthFromText('Kasım 2026 Nöbet Çizelgesi')).toEqual({ month: 11, year: 2026 });
    expect(monthFromText('AİT OLDUĞU AY: AĞUSTOS')).toEqual({ month: 8, year: null });
    expect(monthFromText('ÖĞRETMEN NÖBET ÇİZELGESİ')).toBeNull();
  });
});

describe('holidayFullName', () => {
  it('sabit tarihli bayramları tarihiyle, diğerlerini olduğu gibi yazar', () => {
    expect(holidayFullName('2026-10-29', 'Cumhuriyet Bayramı')).toBe('29 Ekim Cumhuriyet Bayramı');
    expect(holidayFullName('2026-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı')).toBe('23 Nisan Ulusal Egemenlik ve Çocuk Bayramı');
    expect(holidayFullName('2026-10-28', 'Cumhuriyet Bayramı Arifesi')).toBe('Cumhuriyet Bayramı Arifesi');
    expect(holidayFullName('2026-05-28', 'Kurban Bayramı 2. Gün')).toBe('Kurban Bayramı 2. Gün');
    expect(holidayFullName('2026-01-01', 'Yılbaşı')).toBe('Yılbaşı');
    expect(holidayFullName('2026-11-10', 'Ara tatil')).toBe('Ara tatil');
  });
});

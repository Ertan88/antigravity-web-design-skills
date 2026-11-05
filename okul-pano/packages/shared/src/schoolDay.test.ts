import { describe, expect, it } from 'vitest';
import { bridgeDays, halfDayPeriods, nextSchoolDay, schoolDay } from './schoolDay.ts';
import { officialHolidays } from './holidays.ts';

const periods = [
  { no: 1, start: '08:30', end: '09:10' },
  { no: 2, start: '09:20', end: '10:00' },
  { no: 3, start: '11:50', end: '12:30' },
  { no: 4, start: '12:40', end: '13:20' },
  { no: 5, start: '12:55', end: '13:35' },
  { no: 6, start: '13:30', end: '14:10' },
];
const schedules = [{ id: 'h', name: 'Hafta içi', weekdays: [1, 2, 3, 4, 5], periods }];

/** Resmî takvimden: arifeler yarım gün, diğerleri tam gün */
function calendar(year: number) {
  const all = [...officialHolidays(year)].map(([date, name]) => ({ date, name }));
  return { schedules, holidays: all.filter((h) => !h.name.endsWith('Arifesi')), halfDays: all.filter((h) => h.name.endsWith('Arifesi')) };
}

describe('okul günü', () => {
  it('arifede son zilden sonra başlayan dersler düşer, taşan ders son zilde biter', () => {
    expect(halfDayPeriods(periods, '13:00').map((p) => `${p.no} ${p.start}-${p.end}`)).toEqual(['1 08:30-09:10', '2 09:20-10:00', '3 11:50-12:30', '4 12:40-13:00']);
  });

  it('Cumhuriyet Bayramı: 28 Ekim yarım gün, 29 Ekim tatil, sonraki ders günü 30 Ekim', () => {
    const cal = calendar(2026);
    const arife = schoolDay('2026-10-28', cal);
    expect(arife.halfDay).toBe('Cumhuriyet Bayramı Arifesi');
    expect(arife.periods.at(-1)?.end).toBe('13:00');
    expect(schoolDay('2026-10-29', cal).periods).toEqual([]);
    expect(nextSchoolDay('2026-10-28', cal)?.date).toBe('2026-10-30');
  });

  it('okulun belirlediği arife saati geçerli', () => {
    const day = schoolDay('2026-10-28', { ...calendar(2026), halfDayEnd: '12:00' });
    expect(day.endsAt).toBe('12:00');
    expect(day.periods.map((p) => p.no)).toEqual([1, 2]);
  });

  it('Kurban Bayramı: 4 gün tatil, ardından ilk ders günü pazartesi', () => {
    const cal = calendar(2026);
    expect(schoolDay('2026-05-26', cal).halfDay).toBe('Kurban Bayramı Arifesi');
    expect(nextSchoolDay('2026-05-26', cal)?.date).toBe('2026-06-01');
  });

  it('bayrama bitişik köprü günlerini bulur', () => {
    const cal = calendar(2026);
    // 29 Ekim perşembe: 30 Ekim cuma köprü
    expect(bridgeDays('2026-10-01', '2026-11-30', cal.holidays)).toEqual([{ date: '2026-10-30', near: 'Cumhuriyet Bayramı' }]);
    // Kurban 27–30 Mayıs: 25 Mayıs pazartesi ve 26 Mayıs arife köprü
    expect(bridgeDays('2026-05-20', '2026-06-05', cal.holidays)).toEqual([
      { date: '2026-05-25', near: 'Kurban Bayramı' },
      { date: '2026-05-26', near: 'Kurban Bayramı' },
    ]);
  });

  it('köprü günü tatil yapılınca sonraki ders günü atlanır', () => {
    const cal = calendar(2026);
    const withBridge = { ...cal, holidays: [...cal.holidays, { date: '2026-10-30', name: 'İdari İzin (Köprü Günü)' }] };
    expect(nextSchoolDay('2026-10-28', withBridge)?.date).toBe('2026-11-02');
  });
});

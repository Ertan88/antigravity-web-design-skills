import { describe, expect, it } from 'vitest';
import { specialDayFor } from './specialDays.ts';

describe('specialDayFor', () => {
  it('29 Ekim: kutlama, yıl doldurulur', () => {
    const d = specialDayFor('2026-10-29')!;
    expect(d.def.kind).toBe('celebration');
    expect(d.message).toContain('103. yılını');
    expect(d.occurrence).toBe('republic:2026');
  });
  it('10 Kasım ve 15 Temmuz anma günüdür', () => {
    expect(specialDayFor('2026-11-10')!.def.kind).toBe('commemoration');
    expect(specialDayFor('2027-07-15')!.def.kind).toBe('commemoration');
    expect(specialDayFor('2027-03-18')!.def.id).toBe('canakkale');
  });
  it('sıradan gün: yok', () => {
    expect(specialDayFor('2026-11-05')).toBeNull();
  });
  it('yeni yıl 31 Aralık ve 1 Ocak aynı kutlama', () => {
    expect(specialDayFor('2026-12-31')!.occurrence).toBe(specialDayFor('2027-01-01')!.occurrence);
  });
  it('okul kapatabilir ve metni değiştirebilir', () => {
    expect(specialDayFor('2026-10-29', { enabled: false })).toBeNull();
    expect(specialDayFor('2026-11-24', { enabled: true, days: { teachers: { enabled: false } } })).toBeNull();
    const own = specialDayFor('2026-11-24', { enabled: true, days: { teachers: { message: 'Sevgili öğretmenlerimiz…' } } })!;
    expect(own.message).toBe('Sevgili öğretmenlerimiz…');
    expect(own.title).toBe('Öğretmenler Günümüz kutlu olsun');
  });
});

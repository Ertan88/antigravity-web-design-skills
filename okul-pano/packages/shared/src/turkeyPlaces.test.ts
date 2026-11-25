import { describe, expect, it } from 'vitest';
import { districtsOf, isDistrictOf, isProvince, PROVINCES } from './turkeyPlaces.ts';
import { signupSchema } from './schemas.ts';

describe('il ve ilçe listesi', () => {
  it('81 il, 973 ilçe; adlar tekrarsız ve Türkçe sıralı', () => {
    expect(PROVINCES).toHaveLength(81);
    expect(PROVINCES.reduce((n, p) => n + p.districts.length, 0)).toBe(973);
    const names = PROVINCES.map((p) => p.name);
    expect(new Set(names).size).toBe(81);
    expect([...names].sort(new Intl.Collator('tr').compare)).toEqual(names);
    for (const p of PROVINCES) expect(new Set(p.districts).size).toBe(p.districts.length);
  });

  it('il ve ilçe sorgusu', () => {
    expect(isProvince('İstanbul')).toBe(true);
    expect(isProvince('istanbul')).toBe(false);
    expect(districtsOf('Ankara')).toContain('Çankaya');
    expect(isDistrictOf('Kayseri', 'Develi')).toBe(true);
    expect(isDistrictOf('Kayseri', 'Çankaya')).toBe(false);
    expect(districtsOf('Yok')).toEqual([]);
  });

  it('kayıt formu kurum kodunu ve listedeki ili ve ilçeyi ister', () => {
    const base = { institutionCode: '123456', schoolName: 'Deneme Okulu', city: 'Ankara', district: 'Çankaya', schoolType: 'Ortaokulu', ownerName: 'Ayşe YILMAZ', email: 'a@b.test', phone: '05321112233', password: 'GuvenliSifre9', kvkk: true };
    expect(signupSchema.safeParse(base).success).toBe(true);
    expect(signupSchema.safeParse({ ...base, institutionCode: '1234567' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, district: 'Develi' }).success).toBe(false);
  });
});

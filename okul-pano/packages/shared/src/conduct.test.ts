import { describe, expect, it } from 'vitest';
import { classLevel, conductBands, conductTermRange, levelFromClassName, monthRange, rankConductCandidates, resolveTerm2Start } from './conduct.ts';
import { conductCriterionSchema, studentSchema } from './schemas.ts';

describe('gözlem', () => {
  it('sınıf adından düzey', () => {
    expect(levelFromClassName('3-B')).toBe('primary');
    expect(levelFromClassName('7-A')).toBe('middle');
    expect(levelFromClassName('11-C')).toBe('high');
    expect(levelFromClassName('Hazırlık A')).toBe('high');
    expect(levelFromClassName('Anasınıfı')).toBe('primary');
    expect(levelFromClassName('Kulüp')).toBeNull();
    expect(classLevel({ name: 'Kulüp' }, 'middle')).toBe('middle');
    expect(classLevel({ name: '9-A', level: 'middle' }, 'high')).toBe('middle');
  });

  it('ayın öğrencisi: en az üç öğretmen, cömert öğretmenin etkisi sınırlı', () => {
    const e = (studentId: string, by: string, points: number) => ({ studentId, by, points });
    const entries = [
      // A: tek öğretmenden çok puan (öneriye girmez: yalnızca bir öğretmen)
      ...Array.from({ length: 10 }, () => e('A', 't1', 2)),
      // B: üç öğretmen, dengeli
      e('B', 't1', 2), e('B', 't2', 2), e('B', 't3', 1),
      // C: üç öğretmen ama biri çok cömert (+20 → +4 sayılır), bir eksi
      ...Array.from({ length: 10 }, () => e('C', 't1', 2)), e('C', 't2', 1), e('C', 't3', 1), e('C', 't4', -1),
      // D: dört öğretmen, az puan
      e('D', 't1', 1), e('D', 't2', 1), e('D', 't3', 1), e('D', 't4', 1),
    ];
    const r = rankConductCandidates(entries);
    expect(r.map((x) => x.studentId)).toEqual(['C', 'B', 'D']);
    expect(r[0]).toMatchObject({ plus: 22, minus: 1, teachers: 3, balanced: 5 });
    expect(rankConductCandidates(entries, { limit: 1 })).toHaveLength(1);
  });

  it('ay aralığı', () => {
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });

  it('kriter ve okul no doğrulama', () => {
    expect(conductCriterionSchema.safeParse({ level: 'high', group: 'academic', label: 'Ödev', points: 0 }).success).toBe(false);
    expect(conductCriterionSchema.parse({ level: 'high', group: 'academic', label: 'Ödev', points: -1 }).noteRequired).toBe(false);
    expect(studentSchema.parse({ schoolNo: ' 12 34 ', fullName: 'Ali Veli', birthDate: '2012-03-04' }).schoolNo).toBe('1234');
    expect(studentSchema.safeParse({ schoolNo: '', fullName: 'Ali Veli', birthDate: '2012-03-04' }).success).toBe(false);
  });

  it('dönem aralığı: ayar > MEB takvimi > 1 Şubat', () => {
    expect(resolveTerm2Start(2026, null, null)).toBe('2027-02-01');
    expect(resolveTerm2Start(2026, null, '2027-02-08')).toBe('2027-02-08');
    expect(resolveTerm2Start(2026, '02-15', '2027-02-08')).toBe('2027-02-15');
    expect(conductTermRange(2026, 1, '2027-02-08')).toEqual({ from: '2026-09-01', to: '2027-02-08' });
    expect(conductTermRange(2026, 2, '2027-02-08')).toEqual({ from: '2027-02-08', to: '2027-09-01' });
  });

  it('dönem göstergesi bantları', () => {
    const e = (studentId: string, by: string, points: number, label = 'Katılım', month = '2026-10') => ({ studentId, by, points, label, month });
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const entries = [
      // a: üç öğretmenden artı, en yüksek -> yüksek
      e('a', 't1', 2), e('a', 't2', 2), e('a', 't3', 2),
      // b: tek öğretmenden çok artı; sınır ±4/ay, öğretmen şartı yok -> orta
      e('b', 't1', 5), e('b', 't1', 5), e('b', 't1', 5),
      // c: iki ayda üç öğretmen -> yüksek (sınır her ay ayrı)
      e('c', 't1', 4, 'Ödev', '2026-10'), e('c', 't1', 4, 'Ödev', '2026-11'), e('c', 't2', 1), e('c', 't3', 1),
      // d: eksisi artısından fazla -> gelişime açık
      e('d', 't1', 2), e('d', 't2', -3, 'Dersi bölme'), e('d', 't3', -1, 'Geç kalma'),
      // e: az artı -> orta
      e('e', 't1', 1),
    ];
    const rows = Object.fromEntries(conductBands(ids, entries).map((r) => [r.studentId, r]));
    expect(rows.a!.band).toBe('high');
    expect(rows.c!).toMatchObject({ band: 'high', balanced: 10, topPlus: 'Ödev', teachers: 3 });
    expect(rows.b!).toMatchObject({ band: 'mid', balanced: 4 });
    expect(rows.d!).toMatchObject({ band: 'low', topMinus: 'Dersi bölme', topPlus: 'Katılım' });
    expect(rows.e!.band).toBe('mid');
    expect(rows.f!.band).toBe('none');
    // Yalnızca kendi kayıtları: öğretmen şartı ve sınır yok
    const mine = Object.fromEntries(conductBands(ids, entries.filter((x) => x.by === 't1'), { single: true }).map((r) => [r.studentId, r]));
    expect(mine.b!).toMatchObject({ band: 'high', balanced: 15 });
  });
});

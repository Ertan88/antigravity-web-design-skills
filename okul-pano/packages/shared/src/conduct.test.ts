import { describe, expect, it } from 'vitest';
import { classLevel, levelFromClassName, monthRange, rankConductCandidates } from './conduct.ts';
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
});

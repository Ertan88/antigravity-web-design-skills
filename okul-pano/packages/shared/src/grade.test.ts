import { describe, expect, it } from 'vitest';
import { classLongName, compareClassNames, gradeHue, gradeOf, joinClassNames, shortClassLabeler } from './grade.ts';

describe('sınıf kademesi', () => {
  it('aynı kademedeki şubeler aynı renktedir', () => {
    expect(gradeHue('9-A')).toBe(gradeHue('9-B'));
    expect(gradeHue('10/C')).toBe(gradeHue('10 A'));
    expect(gradeHue('9-A')).not.toBe(gradeHue('10-A'));
    expect(gradeHue('Anasınıfı A')).toBe(gradeHue('Anasınıfı B'));
    expect(gradeOf('12-F')).toBe(12);
    expect(gradeOf('Hazırlık A')).toBeNull();
    expect(gradeOf('AMP 11-A')).toBe(11);
  });

  it('doğal sıralar', () => {
    expect(['10-A', '9-B', 'Hazırlık', '9-A', '11-A', '10-B'].sort(compareClassNames)).toEqual(['9-A', '9-B', '10-A', '10-B', '11-A', 'Hazırlık']);
  });
});

describe('joinClassNames', () => {
  it('birleştirilmiş şubeleri yan yana ve alfabetik yazar', () => {
    expect(joinClassNames(['AMP 11-M', 'AMP 11-A', 'AMP 11-C'])).toBe('AMP 11-ACM');
    expect(joinClassNames(['AMP 10-T', 'ATP 10-A', 'AMP 10-C'])).toBe('AMP 10-CT, ATP 10-A');
    expect(joinClassNames(['9-A'])).toBe('9-A');
    expect(joinClassNames(['Hazırlık', '9-B', '9-A'])).toBe('9-AB, Hazırlık');
  });
});

describe('sınıf adı biçimleri', () => {
  it('uzun ad ve birleştirilmiş sınıflar', () => {
    expect(classLongName('AMP 10-C')).toBe('AMP 10. Sınıf / C Şubesi');
    expect(classLongName(['AMP 11-M', 'AMP 11-A'])).toBe('AMP 11. Sınıf / A, M Şubeleri');
    expect(classLongName('9-A')).toBe('9. Sınıf / A Şubesi');
    expect(classLongName('Hazırlık')).toBe('Hazırlık');
  });
  it('panoda kısa ad: baskın programın öneki yazılmaz', () => {
    const short = shortClassLabeler(['AMP 9-A', 'AMP 9-B', 'AMP 10-A', 'ATP 9-A']);
    expect(short('AMP 9-B')).toBe('9/B');
    expect(short('ATP 9-A')).toBe('ATP 9/A');
    expect(shortClassLabeler(['9-A', '10-B'])('10-B')).toBe('10/B');
  });
});

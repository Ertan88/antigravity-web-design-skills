import { describe, expect, it } from 'vitest';
import { examGroupClasses, examGroupPeriods, groupExams } from './examCore.ts';

const ex = (className: string, subject: string, periodNo = 2, kind: 'written' | 'common' = 'written', date = '2026-11-10') => ({ date, className, subject, kind, periodNo });

describe('sınavları kademeye göre gruplama', () => {
  it('aynı gün, kademe, ders ve tür tek grup; tek şube kendi adıyla', () => {
    const g = groupExams([ex('9-A', 'Matematik'), ex('9-B', 'Matematik'), ex('10-B', 'Fizik', 3), ex('AMP 10-A', 'Fizik', 3), ex('9-C', 'Matematik', 2, 'common')]);
    expect(g.map((x) => [x.label, x.classNames.join(',')])).toEqual([
      ['9. sınıflar', '9-A,9-B'],
      ['10-B', '10-B'],
      ['AMP 10-A', 'AMP 10-A'],
      ['9-C', '9-C'],
    ]);
    expect(g[0]!.badge).toBe('9');
  });

  it('saat farklı olsa da aynı grup; ders saati şubeye göre yazılır', () => {
    const [g] = groupExams([ex('9-A', 'İngilizce', 1), ex('9-B', 'ingilizce', 3)]);
    expect(g!.samePeriod).toBe(false);
    expect(examGroupPeriods(g!)).toBe('1. / 3. ders');
  });

  it('farklı gün ayrı; program önekiyle kademe; tanınmayan ad tek başına', () => {
    const g = groupExams([ex('AMP 10-A', 'Kimya'), ex('AMP 10-B', 'Kimya'), ex('9-A', 'Kimya', 2, 'written', '2026-11-11'), ex('Hazırlık', 'Kimya'), ex('Hazırlık', 'Kimya')]);
    expect(g.map((x) => x.label)).toEqual(['AMP 10. sınıflar', '9-A', 'Hazırlık']);
    expect(g[0]!.badge).toBe('AMP 10');
  });

  it('çok şubede kısa yazım', () => {
    const [g] = groupExams(['A', 'B', 'C', 'D', 'E', 'F'].map((s) => ex(`9-${s}`, 'Tarih')));
    expect(examGroupClasses(g!)).toBe('6 şube');
  });
});

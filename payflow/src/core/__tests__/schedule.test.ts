import { describe, expect, it } from '@jest/globals';
import { daysUntil, dueLabel, formatLongDate, greetingFor, urgencyFor } from '../schedule';

describe('aciliyet ve tarih yardımcıları', () => {
  const now = new Date(2026, 10, 17, 22, 45);
  it('gün farkı saatten bağımsız hesaplanır', () => {
    expect(daysUntil(new Date(2026, 10, 19, 0, 1), now)).toBe(2);
    expect(daysUntil(new Date(2026, 10, 16), now)).toBe(-1);
  });
  it('aciliyet seviyeleri', () => {
    expect([-1, 0, 2, 3, 4, 11, 12].map(urgencyFor)).toEqual(['overdue', 'today', 'soon', 'soon', 'upcoming', 'upcoming', 'later']);
  });
  it('Türkçe etiketler', () => {
    expect([dueLabel(-2), dueLabel(0), dueLabel(1), dueLabel(6)]).toEqual(['2 gün gecikti', 'Bugün', 'Yarın', '6 gün']);
    expect(greetingFor(new Date(2026, 10, 17, 9))).toBe('Günaydın');
    expect(greetingFor(now)).toBe('İyi akşamlar');
    expect(formatLongDate(now)).toMatch(/17 Kasım/);
  });
});

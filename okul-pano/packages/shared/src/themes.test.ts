import { describe, expect, it } from 'vitest';
import { specialThemeFor } from './themes.ts';

describe('özel gün temaları', () => {
  it('tarihe göre temayı bulur', () => {
    expect(specialThemeFor('2026-10-29')?.id).toBe('national');
    expect(specialThemeFor('2026-11-10')?.id).toBe('ataturk');
    expect(specialThemeFor('2026-11-24')?.id).toBe('teachers');
    expect(specialThemeFor('2026-05-28')?.id).toBe('kurban');
    expect(specialThemeFor('2026-03-20')?.id).toBe('ramazan');
    expect(specialThemeFor('2026-12-31')?.id).toBe('newyear');
    expect(specialThemeFor('2026-10-27')).toBeNull();
  });
});

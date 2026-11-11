import { describe, expect, it } from 'vitest';
import { defaultTitleRole, titleRoleFor } from './schemas.ts';

describe('ünvandan rol önerisi', () => {
  it('müdür yardımcısı ve başyardımcısı Yönetici, diğerleri Öğretmen', () => {
    for (const t of ['Müdür Yardımcısı', 'MÜDÜR YARDIMCISI', 'Müdür Başyardımcısı', 'Müdür Baş Yardımcısı', 'Müd. Yrd.', 'Müdür Yrd.']) expect(defaultTitleRole(t)).toBe('admin');
    for (const t of ['Öğretmen', 'Uzman Öğretmen', 'Müdür', 'Rehber Öğretmen', '', null]) expect(defaultTitleRole(t)).toBe('teacher');
  });
  it('okulun eşlemesi varsayılanı geçer', () => {
    expect(titleRoleFor({}, 'a', 'Müdür Yardımcısı')).toBe('admin');
    expect(titleRoleFor({ a: 'teacher' }, 'a', 'Müdür Yardımcısı')).toBe('teacher');
    expect(titleRoleFor({ b: 'counselor' }, 'b', 'Öğretmen')).toBe('counselor');
    expect(titleRoleFor({}, null, 'Müdür Yardımcısı')).toBe('teacher');
  });
});

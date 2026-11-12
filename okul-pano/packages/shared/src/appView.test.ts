import { describe, expect, it } from 'vitest';
import { appView } from './permissions.ts';

describe('appView: uygulamadaki görünüm (mobil ve panelin telefon görünümü ortak)', () => {
  it('okul müdürü ve müdür yardımcısı yönetici görünümündedir', () => {
    expect(appView({ role: 'owner', permissions: [] })).toBe('manager');
    expect(appView({ role: 'admin', permissions: [], teacherId: 't1' })).toBe('manager');
  });
  it('öğretmen kaydı olan kişi görevi olsa da öğretmen görünümünde kalır', () => {
    expect(appView({ role: 'editor', permissions: ['duties.manage', 'leaves.manage'], teacherId: 't1' })).toBe('teacher');
    expect(appView({ role: 'editor', permissions: ['announcements.manage'], teacherId: 't1' })).toBe('teacher');
  });
  it('kadroda olmayan kişi: görevi varsa görevli (editör), yoksa öğretmen görünümü (yalnız ana sayfa ve Menü)', () => {
    expect(appView({ role: 'editor', permissions: ['announcements.manage'] })).toBe('editor');
    expect(appView({ role: 'editor', permissions: [] })).toBe('teacher');
    // Rehber öğretmen yetkisi tek başına içerik görevi sayılmaz
    expect(appView({ role: 'editor', permissions: ['conduct.counsel'] })).toBe('teacher');
  });
});

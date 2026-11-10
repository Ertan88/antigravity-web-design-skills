import { describe, expect, it } from 'vitest';
import { applyPersonRole, DUTY_PACKAGES, dutiesOf, EXTRA_PERMISSIONS, partialDutyPermissions, personRole, toggleDuty } from './duties.ts';
import { PERMISSION_KEYS } from './permissions.ts';

describe('görev paketleri', () => {
  it('her yetki ya bir pakette ya diğer yetkilerde ya da rolde (kayıp yok)', () => {
    const covered = new Set<string>([...DUTY_PACKAGES.flatMap((d) => d.permissions), ...EXTRA_PERMISSIONS.map((e) => e.key), 'users.manage', 'conduct.counsel']);
    expect(PERMISSION_KEYS.filter((p) => !covered.has(p))).toEqual([]);
  });
  it('paket aç/kapat; diğer yetkiler korunur; yarım paket ayrı gösterilir', () => {
    let p = toggleDuty(['announcements.approve'], 'announcements', true);
    expect(dutiesOf(p)).toEqual(['announcements']);
    expect(p).toContain('announcements.approve');
    p = toggleDuty(p, 'announcements', false);
    expect(p).toEqual(['announcements.approve']);
    expect(dutiesOf(['announcements.manage'])).toEqual([]);
    expect(partialDutyPermissions(['announcements.manage', 'exams.manage'])).toEqual(['announcements.manage']);
  });
  it('kişi rolü ve geri çevirme', () => {
    expect(personRole({ role: 'editor', permissions: [], teacherId: 't' })).toBe('teacher');
    expect(personRole({ role: 'editor', permissions: [], teacherId: null })).toBe('staff');
    expect(personRole({ role: 'editor', permissions: ['conduct.counsel'] })).toBe('counselor');
    expect(applyPersonRole('counselor', ['exams.manage'])).toEqual({ role: 'editor', permissions: ['exams.manage', 'conduct.counsel'] });
    expect(applyPersonRole('teacher', ['conduct.counsel', 'exams.manage'])).toEqual({ role: 'editor', permissions: ['exams.manage'] });
    expect(applyPersonRole('admin', ['exams.manage'])).toEqual({ role: 'admin', permissions: [] });
  });
});

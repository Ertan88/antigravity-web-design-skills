import { dutiesOf, personRole, type DutyKey, type PersonRole } from './duties.ts';
import type { Permission, Role } from './permissions.ts';
import type { EnrollRole } from './schemas.ts';

/*
 * Kişiler ve Yetkiler (panel ve mobil ortak): kadrodaki öğretmenler ve kadro dışı hesaplar tek listede.
 */

/** Hesap (okul üyeliği) */
export interface Member {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  permissions: string[];
  effectivePermissions: Permission[];
  teacherId: string | null;
  teacherName: string | null;
  lastLoginAt: string | null;
  invitePending: boolean;
  promotionRequest: { byName: string; at: string } | null;
}

export type RosterStatus = 'account' | 'invited' | 'pending' | 'code' | 'none';

/** Kadrodaki öğretmen ve hesap durumu */
export interface RosterRow {
  teacherId: string;
  fullName: string;
  title: string | null;
  branch: string | null;
  status: RosterStatus;
  /** Hesabı yoksa ünvandan önerilen rol, varsa hesaptaki rol */
  role: EnrollRole;
  email: string | null;
  enrollmentId: string | null;
  lastLoginAt: string | null;
}

export interface Roster {
  mail: boolean;
  /** Kullanıcı yönetimi yetkisi (yoksa dar yetki: yalnızca Öğretmen rolüyle hesap açar) */
  full: boolean;
  owner: boolean;
  rows: RosterRow[];
}

/** Listedeki kişi: kadrodaki öğretmen (hesabı olsun olmasın) ya da kadro dışı hesap */
export interface Person {
  key: string;
  fullName: string;
  /** Ünvan · branş ya da "Kadro dışı" */
  sub: string;
  email: string | null;
  teacherId: string | null;
  member: Member | null;
  roster: RosterRow | null;
  status: RosterStatus;
  role: PersonRole;
  duties: DutyKey[];
}

const enrollToPerson: Record<EnrollRole, PersonRole> = { admin: 'admin', counselor: 'counselor', teacher: 'teacher' };

export function mergePeople(roster: RosterRow[], members: Member[] | undefined): Person[] {
  const byTeacher = new Map((members ?? []).filter((m) => m.teacherId).map((m) => [m.teacherId!, m]));
  const people: Person[] = roster.map((r) => {
    const m = byTeacher.get(r.teacherId) ?? null;
    return {
      key: `t:${r.teacherId}`,
      fullName: r.fullName,
      sub: [r.title, r.branch].filter(Boolean).join(' · ') || 'Ünvan girilmemiş',
      email: m?.email ?? r.email,
      teacherId: r.teacherId,
      member: m,
      roster: r,
      status: m ? (m.invitePending ? 'invited' : 'account') : r.status,
      role: m ? personRole(m) : enrollToPerson[r.role],
      duties: m ? dutiesOf(m.permissions) : [],
    };
  });
  const inRoster = new Set(roster.map((r) => r.teacherId));
  for (const m of members ?? []) {
    if (m.teacherId && inRoster.has(m.teacherId)) continue;
    people.push({
      key: `m:${m.id}`,
      fullName: m.fullName,
      sub: m.role === 'owner' ? 'Okul müdürü' : m.teacherId ? 'Kadroda pasif' : 'Kadro dışı',
      email: m.email,
      teacherId: m.teacherId,
      member: m,
      roster: null,
      status: m.invitePending ? 'invited' : 'account',
      role: personRole(m),
      duties: dutiesOf(m.permissions),
    });
  }
  const order: Record<PersonRole, number> = { owner: 0, admin: 1, counselor: 2, teacher: 3, staff: 4 };
  return people.sort((a, b) => order[a.role] - order[b.role] || a.fullName.localeCompare(b.fullName, 'tr'));
}

export const PERSON_STATUS: Record<RosterStatus, { label: string; tone: 'green' | 'blue' | 'amber' | 'slate' }> = {
  account: { label: 'Aktif', tone: 'green' },
  invited: { label: 'Davet gönderildi', tone: 'blue' },
  pending: { label: 'Onay bekliyor', tone: 'amber' },
  code: { label: 'Kod verildi', tone: 'blue' },
  none: { label: 'Hesabı yok', tone: 'slate' },
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase('tr-TR'))
    .join('');

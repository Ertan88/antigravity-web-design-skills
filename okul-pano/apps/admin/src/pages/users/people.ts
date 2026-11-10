import { dutiesOf, personRole, type DutyKey, type EnrollRole, type Permission, type PersonRole, type Role } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

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

/** Kişiler: kadro + hesaplar (dar yetkide yalnızca kadro) */
export function usePeople() {
  const { schoolId, can } = useAuth();
  const full = can('users.manage');
  const membersPath = useSchoolPath('members');
  const enrollPath = useSchoolPath('enrollments');
  const qc = useQueryClient();
  const roster = useQuery({ queryKey: [schoolId, 'enrollments'], queryFn: () => api<Roster>(`${enrollPath}/roster`), enabled: Boolean(schoolId), refetchInterval: 15_000 });
  const members = useQuery({ queryKey: [schoolId, 'members'], queryFn: () => api<Member[]>(membersPath), enabled: Boolean(schoolId) && full });
  const people = roster.data ? mergePeople(roster.data.rows, full ? members.data : undefined) : [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [schoolId, 'enrollments'] });
    void qc.invalidateQueries({ queryKey: [schoolId, 'members'] });
    void qc.invalidateQueries({ queryKey: [schoolId, 'teachers'] });
  };
  return {
    people,
    loading: roster.isLoading || (full && members.isLoading),
    full,
    mail: Boolean(roster.data?.mail),
    isOwner: Boolean(roster.data?.owner),
    membersPath,
    enrollPath,
    refresh,
  };
}

export const STATUS: Record<RosterStatus, { label: string; tone: 'green' | 'blue' | 'amber' | 'slate' }> = {
  account: { label: 'Aktif', tone: 'green' },
  invited: { label: 'Davet gönderildi', tone: 'blue' },
  pending: { label: 'Onay bekliyor', tone: 'amber' },
  code: { label: 'Kod verildi', tone: 'blue' },
  none: { label: 'Hesabı yok', tone: 'slate' },
};

export const ROLE_TONE: Record<PersonRole, string> = {
  owner: 'bg-amber-100 text-amber-800',
  admin: 'bg-violet-100 text-violet-800',
  counselor: 'bg-emerald-100 text-emerald-800',
  teacher: 'bg-slate-100 text-slate-700',
  staff: 'bg-orange-100 text-orange-800',
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase('tr-TR'))
    .join('');

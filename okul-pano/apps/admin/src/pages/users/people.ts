import { mergePeople, PERSON_STATUS, type Member, type Person, type PersonRole, type Roster } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

export { initials, mergePeople } from '@okulpano/shared';
export type { Member, Person, Roster, RosterRow, RosterStatus } from '@okulpano/shared';
export const STATUS = PERSON_STATUS;

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

export const ROLE_TONE: Record<PersonRole, string> = {
  owner: 'bg-amber-100 text-amber-800',
  admin: 'bg-violet-100 text-violet-800',
  counselor: 'bg-emerald-100 text-emerald-800',
  teacher: 'bg-slate-100 text-slate-700',
  staff: 'bg-orange-100 text-orange-800',
};

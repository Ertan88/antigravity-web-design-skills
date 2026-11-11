import { mergePeople, type Member, type Person, type PersonRole, type Roster } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import { useAuth, useSchoolPath } from './auth.tsx';

/** Kişiler ve Yetkiler (panelle aynı model): kadro + hesaplar tek listede; dar yetkide yalnızca kadro */
export function usePeople() {
  const { school, can } = useAuth();
  const full = can('users.manage');
  const allowed = full || can('accounts.enroll');
  const membersPath = useSchoolPath('members');
  const enrollPath = useSchoolPath('enrollments');
  const qc = useQueryClient();
  const roster = useQuery({ queryKey: [school?.id, 'roster'], queryFn: () => api<Roster>(`${enrollPath}/roster`), enabled: Boolean(school) && allowed, refetchInterval: 15_000 });
  const members = useQuery({ queryKey: [school?.id, 'members'], queryFn: () => api<Member[]>(membersPath), enabled: Boolean(school) && full });
  const people: Person[] = roster.data ? mergePeople(roster.data.rows, full ? members.data : undefined) : [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [school?.id, 'roster'] });
    void qc.invalidateQueries({ queryKey: [school?.id, 'members'] });
    void qc.invalidateQueries({ queryKey: [school?.id, 'teachers'] });
  };
  return {
    people,
    allowed,
    full,
    loading: roster.isLoading || (full && members.isLoading),
    refreshing: roster.isRefetching || members.isRefetching,
    error: roster.error ?? members.error,
    mail: Boolean(roster.data?.mail),
    isOwner: Boolean(roster.data?.owner),
    membersPath,
    enrollPath,
    refresh,
  };
}

export const ROLE_BADGE: Record<PersonRole, 'warning' | 'primary' | 'success' | 'muted'> = { owner: 'warning', admin: 'primary', counselor: 'success', teacher: 'muted', staff: 'warning' };
export const STATUS_BADGE = { green: 'success', blue: 'primary', amber: 'warning', slate: 'muted' } as const;

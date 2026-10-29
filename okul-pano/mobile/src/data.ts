import { academicYearOf, type AcademicCalendarData } from '@okulpano/shared/academicCalendar';
import type { BellScheduleLike } from '@okulpano/shared/bell';
import type { ScreenLiveStatus } from '@okulpano/shared/control';
import type { AnnouncementDesign } from '@okulpano/shared/designs';
import type { EmergencyType } from '@okulpano/shared/emergency';
import type { Permission, Role } from '@okulpano/shared/permissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { useAuth, useSchoolPath } from './auth.tsx';

/* ---------- API yanıt tipleri ---------- */

export interface SchoolInfo {
  id: string;
  name: string;
  logoUrl: string | null;
  timezone: string;
  supportAccessUntil?: string | null;
  settings: { requireApproval?: boolean; schoolType?: string; lunchThresholdMin?: number };
}

export interface MeToday {
  teacher: { id: string; fullName: string } | null;
  today: string;
  timezone: string;
  lunchThresholdMin: number;
  bellSchedules: BellScheduleLike[];
  holidays: { date: string; name: string }[];
  /** Arifeler (yarım gün): dersler halfDayEnd saatinde biter */
  halfDays?: { date: string; name: string }[];
  halfDayEnd?: string;
  lessons: { weekday: number; periodNo: number; className: string; subject: string }[];
  leaves: { id: string; startDate: string; endDate: string; note: string | null; status: 'approved' | 'pending' | 'rejected' }[];
  week: {
    date: string;
    weekday: number;
    holiday: string | null;
    supervisor: string | null;
    duties: { dutyId: string; area: string; partners: string[]; substituteFor: string | null; coveredBy: string | null }[];
  }[];
}

export interface ControlCenter {
  today: string;
  emergency: { type: EmergencyType; message: string | null; startedAt: string; startedBy: string | null } | null;
  screens: { total: number; online: number; offline: { id: string; name: string; lastSeenAt: string | null }[] };
  pending: { announcements: number; leaves: number };
  onAir: number;
  endingToday: { id: string; title: string; endsAt: string }[];
  dutyGaps: { dutyId: string; area: string; teacherName: string }[];
  holiday: string | null;
}

export interface Screen {
  id: string;
  name: string;
  location: string | null;
  lastSeenAt: string | null;
  online: boolean;
  live: ScreenLiveStatus | null;
  display: { orientation: 'landscape' | 'portrait'; mode: 'board' | 'slides' | 'clock' };
}

export interface Announcement {
  id: string;
  kind: 'image' | 'video' | 'text' | 'design';
  title: string;
  body: string | null;
  imageUrl: string | null;
  design: AnnouncementDesign | null;
  screenIds: string[] | null;
  schedule: { days: number[]; from: string | null; to: string | null; phase: 'any' | 'break' | 'lesson' } | null;
  approvalStatus: 'approved' | 'pending' | 'rejected';
  reviewNote: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Leave {
  id: string;
  teacherId: string;
  startDate: string;
  endDate: string;
  note: string | null;
  approvalStatus: 'approved' | 'pending' | 'rejected';
  createdAt: string;
}

export interface DutyDay {
  date: string;
  weekday: number;
  holiday: string | null;
  supervisor: string | null;
  entries: {
    dutyId: string;
    area: string;
    teacherId: string;
    teacherName: string;
    onLeave: boolean;
    leavePending: boolean;
    substitute: { id: string; teacherId: string; teacherName: string } | null;
  }[];
  gaps: string[];
  candidates: { teacherId: string; fullName: string; monthCount: number }[];
}

/** Bildirim kutusu (panelle ortak): okunanlar da saklanır, okundu bilgisi her cihazda aynıdır */
export interface InboxItem {
  id: string;
  key: string;
  kind: string;
  title: string;
  body: string;
  at: string;
  to: string;
  readAt: string | null;
  /** Durum ortadan kalktı (duyuru onaylandı, nöbet dolduruldu…) */
  resolvedAt: string | null;
}
export interface InboxPage {
  items: InboxItem[];
  unread: number;
  total: number;
  nextBefore: string | null;
}

/* ---------- Sorgular ---------- */

export function useSchoolQuery<T>(resource: string, opts: { refetchInterval?: number; enabled?: boolean } = {}) {
  const { school } = useAuth();
  const path = useSchoolPath(resource);
  return useQuery({
    queryKey: [school?.id, resource],
    queryFn: () => api<T>(path),
    enabled: Boolean(school) && opts.enabled !== false,
    refetchInterval: opts.refetchInterval,
  });
}

export const useSchoolInfo = () => useSchoolQuery<SchoolInfo>('');
export const useMeToday = () => useSchoolQuery<MeToday>('me/today', { refetchInterval: 5 * 60_000 });
export const useControlCenter = (enabled = true) => useSchoolQuery<ControlCenter>('control-center', { refetchInterval: 30_000, enabled });
export const useScreens = (fast = false) => useSchoolQuery<Screen[]>('screens', { refetchInterval: fast ? 3000 : 30_000 });
export const useAnnouncements = () => useSchoolQuery<Announcement[]>('announcements', { refetchInterval: 60_000 });
export const useLeaves = (enabled = true) => useSchoolQuery<Leave[]>('leaves', { enabled });
export const useMyLeaves = () => useSchoolQuery<Leave[]>('me/leaves');
/** Bildirim kutusu: okul seçiliyse okulun ve platformun bildirimleri, değilse (platform yöneticisi) yalnızca platformunkiler */
export function useInbox(filter: 'all' | 'unread' = 'all') {
  const { school } = useAuth();
  const path = useSchoolPath(`inbox?filter=${filter}&limit=50`);
  return useQuery({
    queryKey: [school?.id ?? 'me', `inbox?filter=${filter}`],
    queryFn: () => api<InboxPage>(school ? path : `/api/me/inbox?filter=${filter}&limit=50`),
    refetchInterval: 60_000,
  });
}

/** Okundu / okunmadı / sil; sonrasında kutu ve zil tazelenir */
export function useInboxActions() {
  const { school } = useAuth();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[1]).startsWith('inbox') });
  const read = useMutation({ mutationFn: (body: { ids?: string[]; all?: true; schoolId?: string }) => api('/api/me/inbox/read', { method: 'POST', body }), onSuccess: refresh });
  const unread = useMutation({ mutationFn: (id: string) => api(`/api/me/inbox/${id}/unread`, { method: 'POST' }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/me/inbox/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  return { read, unread, remove, readAll: () => read.mutate({ all: true, ...(school ? { schoolId: school.id } : {}) }) };
}
export const useTeachers = (enabled = true) => useSchoolQuery<{ id: string; fullName: string; isActive: boolean }[]>('teachers', { enabled });

export function useDutyDay(date?: string) {
  const { school } = useAuth();
  const path = useSchoolPath(`duty-day${date ? `?date=${date}` : ''}`);
  return useQuery({ queryKey: [school?.id, 'duty-day', date ?? 'today'], queryFn: () => api<DutyDay>(path), enabled: Boolean(school) });
}

/** Saniyede bir (ya da verilen aralıkla) yenilenen saat */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* ---------- Okul yönetimi ---------- */

export interface Member {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  permissions: Permission[];
  effectivePermissions: Permission[];
  teacherId: string | null;
  teacherName: string | null;
  lastLoginAt: string | null;
  invitePending: boolean;
}
export const useMembers = (enabled = true) => useSchoolQuery<Member[]>('members', { enabled });

export interface HolidayList {
  holidays: { id: string | null; date: string; name: string; source: 'official' | 'meb' | 'school' }[];
  halfDays: { date: string; name: string }[];
  bridges: { date: string; near: string }[];
}
/** Bugünden eğitim yılının sonuna (30 Haziran) kadar tatiller, arifeler ve olası köprü günleri */
export function useUpcomingHolidays() {
  const today = new Date().toISOString().slice(0, 10);
  const end = `${academicYearOf(today) + 1}-06-30`;
  const days = Math.max(30, Math.round((Date.parse(end) - Date.parse(today)) / 86400_000));
  return useSchoolQuery<HolidayList>(`holidays/upcoming?days=${days}`);
}

export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  summary: string | null;
  createdAt: string;
  userName: string | null;
}

/* ---------- Platform yöneticisi ---------- */

export interface PlatformSchool {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  plan: 'trial' | 'basic' | 'pro';
  maxScreens: number;
  isActive: boolean;
  trialEndsAt: string | null;
  supportAccessUntil: string | null;
  screenCount: number;
  createdAt: string;
  member: boolean;
  canOpen: boolean;
}
export interface Signup {
  id: string;
  schoolName: string;
  ownerName: string;
  email: string;
  city: string | null;
  createdAt: string;
  expired: boolean;
}
export interface CalendarRow {
  startYear: number;
  label: string;
  data: AcademicCalendarData;
  source: 'meb' | 'manual' | 'builtin';
  sourceUrl: string | null;
  status: 'confirmed' | 'review';
  pending: { data: AcademicCalendarData; sourceUrl: string; foundAt: string } | null;
  checkedAt: string | null;
}

function usePlatformQuery<T>(path: string) {
  const { me } = useAuth();
  return useQuery({ queryKey: ['platform', path], queryFn: () => api<T>(`/api/platform/${path}`), enabled: Boolean(me?.user.isSuperAdmin) });
}
export const usePlatformSchools = () => usePlatformQuery<PlatformSchool[]>('schools');
export const useSignups = () => usePlatformQuery<Signup[]>('signups');
export const useAcademicCalendars = () => usePlatformQuery<CalendarRow[]>('academic-calendars');

/* ---------- Gözlem ---------- */

export type SchoolLevel = 'primary' | 'middle' | 'high';
export type ConductGroup = 'academic' | 'behavior' | 'social';
export interface ConductCriterion {
  id: string;
  level: SchoolLevel;
  group: ConductGroup;
  label: string;
  points: number;
  noteRequired: boolean;
  isActive: boolean;
}
export interface ConductClass {
  id: string;
  name: string;
  level: SchoolLevel;
  students: number;
}
export interface ConductClassScreen {
  month: string;
  class: { id: string; name: string; level: SchoolLevel };
  criteria: ConductCriterion[];
  students: { id: string; schoolNo: string; fullName: string; plus: number; minus: number; net: number }[];
}
export interface ConductStudentCard {
  month: string;
  student: { id: string; schoolNo: string; fullName: string; className: string | null };
  totals: { net: number; plus: number; minus: number; plusPoints: number; minusPoints: number; teachers: number };
  byCriterion: { label: string; group: ConductGroup; points: number; count: number }[];
  entries: { id: string; group: ConductGroup; label: string; points: number; note: string | null; userName: string | null; createdAt: string; mine: boolean }[];
  canSeeAuthors: boolean;
}

export const useConductClasses = (enabled = true) => useSchoolQuery<ConductClass[]>('conduct/classes', { enabled });
export const useConductClass = (classId: string | null) => useSchoolQuery<ConductClassScreen>(`conduct/classes/${classId}/students`, { enabled: Boolean(classId) });
export const useConductStudent = (id: string, month: string) => useSchoolQuery<ConductStudentCard>(`conduct/students/${id}?month=${month}`);

export type ConductBand = 'high' | 'mid' | 'low' | 'none';
export interface ConductReport {
  startYear: number;
  term: 1 | 2;
  range: { from: string; to: string };
  mine: boolean;
  class: {
    id: string;
    name: string;
    counts: Record<ConductBand, number>;
    entries: number;
    students: { id: string; schoolNo: string; fullName: string; plus: number; minus: number; teachers: number; topPlus: string | null; topMinus: string | null; band: ConductBand }[];
  };
}
export interface ConductAlert {
  id: string;
  minusCount: number;
  windowDays: number;
  summary: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  note: string | null;
  student: { id: string; schoolNo: string; fullName: string; className: string | null };
}
export const useConductReport = (classId: string | null, term: 1 | 2 | null, mine: boolean) =>
  useSchoolQuery<ConductReport>(`conduct/report?classId=${classId}${term ? `&term=${term}` : ''}${mine ? '&mine=1' : ''}`, { enabled: Boolean(classId) });
export const useConductAlerts = (status: 'open' | 'resolved', enabled = true) =>
  useSchoolQuery<{ open: number; alerts: ConductAlert[] }>(`conduct/alerts?status=${status}`, { enabled });

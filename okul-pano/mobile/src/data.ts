import type { BellScheduleLike } from '@okulpano/shared/bell';
import type { ScreenLiveStatus } from '@okulpano/shared/control';
import type { AnnouncementDesign } from '@okulpano/shared/designs';
import type { EmergencyType } from '@okulpano/shared/emergency';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { useAuth, useSchoolPath } from './auth.tsx';

/* ---------- API yanıt tipleri ---------- */

export interface SchoolInfo {
  id: string;
  name: string;
  logoUrl: string | null;
  timezone: string;
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

export interface PanelNotification {
  key: string;
  kind: 'approval' | 'returned' | 'approved' | 'month-student' | 'leave-request' | 'duty-gap';
  title: string;
  body: string;
  at: string;
  to: string;
}

/* ---------- Sorgular ---------- */

function useSchoolQuery<T>(resource: string, opts: { refetchInterval?: number; enabled?: boolean } = {}) {
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
export const useNotifications = () => useSchoolQuery<PanelNotification[]>('notifications', { refetchInterval: 60_000 });
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

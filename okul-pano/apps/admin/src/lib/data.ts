import type { Period, SchoolSettings } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import { useAuth } from './auth.tsx';
import { useToast } from '../components/Toast.tsx';

/* ---------- Kayıt tipleri (API yanıtları) ---------- */

interface Base {
  id: string;
  schoolId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Announcement extends Base {
  kind: 'image' | 'video' | 'text';
  title: string;
  body: string | null;
  imageUrl: string | null;
  youtubeUrl: string | null;
  durationSec: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
}
export interface TickerItem extends Base {
  text: string;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
}
export interface Exam extends Base {
  title: string;
  examAt: string;
  isActive: boolean;
  sortOrder: number;
}
export interface Teacher extends Base {
  fullName: string;
  branchId: string | null;
  titleId: string | null;
  /** Listeden gelen adlar (salt okunur) */
  branch: string | null;
  title: string | null;
  isActive: boolean;
}
/** Branş ya da ünvan listesinin bir öğesi */
export interface TeacherOption {
  id: string;
  name: string;
  teacherCount: number;
}
export interface ClassGroup extends Base {
  name: string;
  sortOrder: number;
}
export interface Duty extends Base {
  /** YYYY-AA */
  month: string;
  weekday: number;
  area: string;
  teacherId: string;
  sortOrder: number;
}
export interface Leave extends Base {
  teacherId: string;
  startDate: string;
  endDate: string;
  note: string | null;
}
export interface Student extends Base {
  fullName: string;
  classGroupId: string | null;
  birthDate: string;
}
export interface BellSchedule extends Base {
  name: string;
  weekdays: number[];
  periods: Period[];
  sortOrder: number;
}
export interface TimetableEntry extends Base {
  weekday: number;
  periodNo: number;
  classGroupId: string;
  teacherId: string | null;
  subject: string;
}
export interface Screen {
  id: string;
  name: string;
  location: string | null;
  lastSeenAt: string | null;
  online: boolean;
  hasKey: boolean;
  createdAt: string;
}
export interface School {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  timezone: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  settings: SchoolSettings;
  plan: 'trial' | 'basic' | 'pro';
  maxScreens: number;
  isActive: boolean;
  trialEndsAt: string | null;
}

/* ---------- Kancalar ---------- */

export function useSchoolPath(resource = ''): string {
  const { schoolId } = useAuth();
  return `/api/schools/${schoolId}${resource ? `/${resource}` : ''}`;
}

/** Okul kapsamlı liste sorgusu */
export function useList<T>(resource: string, opts: { refetchInterval?: number } = {}) {
  const { schoolId } = useAuth();
  const path = useSchoolPath(resource);
  return useQuery({
    queryKey: [schoolId, resource],
    queryFn: () => api<T[]>(path),
    enabled: Boolean(schoolId),
    refetchInterval: opts.refetchInterval,
  });
}

export function useSchool() {
  const { schoolId } = useAuth();
  const path = useSchoolPath();
  return useQuery({ queryKey: [schoolId, 'school'], queryFn: () => api<School>(path), enabled: Boolean(schoolId) });
}

/** Standart CRUD işlemleri; başarıda listeyi tazeler ve bildirim gösterir. */
export function useResource<T extends { id: string }>(resource: string, label: string) {
  const { schoolId } = useAuth();
  const path = useSchoolPath(resource);
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: [schoolId, resource] });

  const create = useMutation({
    mutationFn: (body: unknown) => api<T>(path, { method: 'POST', body }),
    onSuccess: () => {
      void invalidate();
      toast.success(`${label} eklendi`);
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api<T>(`${path}/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      void invalidate();
      toast.success(`${label} güncellendi`);
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { isActive?: boolean; sortOrder?: number } }) =>
      api<T>(`${path}/${id}`, { method: 'PATCH', body }),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void invalidate();
      toast.success(`${label} silindi`);
    },
    onError: (e) => toast.error(e.message),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api(`${path}/reorder`, { method: 'POST', body: { ids } }),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e.message),
  });
  return { create, update, patch, remove, reorder, invalidate };
}

export function nameMap<T extends { id: string }>(rows: T[] | undefined, pick: (r: T) => string): Map<string, string> {
  return new Map((rows ?? []).map((r) => [r.id, pick(r)]));
}

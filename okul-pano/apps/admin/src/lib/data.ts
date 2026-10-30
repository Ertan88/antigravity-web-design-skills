import type { AnnouncementDesign, BoardLayout, Period, SchoolSettings, ScreenDisplay } from '@okulpano/shared';
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
  kind: 'image' | 'video' | 'text' | 'design';
  title: string;
  /** Hazır şablonla hazırlanan duyuru */
  design: AnnouncementDesign | null;
  /** Yalnızca bu panolarda (null: bütün panolar) */
  screenIds: string[] | null;
  schedule: AnnouncementSchedule | null;
  approvalStatus: 'approved' | 'pending' | 'rejected';
  reviewNote: string | null;
  createdBy: string | null;
  createdByName: string | null;
  body: string | null;
  imageUrl: string | null;
  youtubeUrl: string | null;
  durationSec: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
}
export interface AnnouncementSchedule {
  days: number[];
  from: string | null;
  to: string | null;
  phase: 'any' | 'break' | 'lesson';
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
  /** Gözlem düzeyi; boşsa sınıf adından anlaşılır */
  level: 'primary' | 'middle' | 'high' | null;
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
  /** Öğretmenin mobil uygulamadan bildirdiği izin onay bekler */
  approvalStatus: 'approved' | 'pending' | 'rejected';
}
export interface Student extends Base {
  /** Okul numarası: okul içinde benzersiz */
  schoolNo: string;
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
  /** Bu panoya özel düzen; null ise okulun varsayılanı */
  layout: BoardLayout | null;
  /** Ekran biçimi: yatay / dikey, yalnızca duyurular, video duvarı */
  display: ScreenDisplay;
  /** Panonun bildirdiği anlık durum (gösterilen içerik, duraklatma, uyku) */
  live?: { slideIndex: number; slideCount: number; slideTitle: string | null; paused: boolean; sleeping: boolean; mode: string } | null;
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
  /** İlk giriş sorusu: 'pending' iken örnek veri sorulur */
  onboarding: 'pending' | 'sample' | 'empty' | null;
  /** Platform desteğinin okul verilerine erişebileceği son an (KVKK; okul yöneticisi verir) */
  supportAccessUntil: string | null;
  hasSampleData: boolean;
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
export function useResource<T extends { id: string }>(
  resource: string,
  label: string,
  /** Kayıttan sonra gösterilecek özel mesaj (ör. "Duyuru onaya gönderildi") */
  savedMessage?: (saved: T, isNew: boolean) => string | null,
) {
  const { schoolId } = useAuth();
  const path = useSchoolPath(resource);
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: [schoolId, resource] });

  const create = useMutation({
    mutationFn: (body: unknown) => api<T>(path, { method: 'POST', body }),
    onSuccess: (saved) => {
      void invalidate();
      toast.success(savedMessage?.(saved, true) ?? `${label} eklendi`);
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api<T>(`${path}/${id}`, { method: 'PUT', body }),
    onSuccess: (saved) => {
      void invalidate();
      toast.success(savedMessage?.(saved, false) ?? `${label} güncellendi`);
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

export interface Achievement extends Base {
  kind: 'month' | 'achievement';
  name: string;
  className: string | null;
  title: string;
  description: string | null;
  photoUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  showCard: boolean;
  showSlide: boolean;
  sortOrder: number;
}
export interface SchoolEvent extends Base {
  title: string;
  organizer: string | null;
  date: string;
  time: string | null;
  place: string | null;
  isActive: boolean;
}
export interface Book extends Base {
  title: string;
  author: string;
  coverUrl: string | null;
  note: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
}

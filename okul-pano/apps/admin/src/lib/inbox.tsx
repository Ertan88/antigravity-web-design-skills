import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  LockKeyhole,
  ShieldAlert,
  Star,
  TimerOff,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from './api.ts';
import { useAuth } from './auth.tsx';

export interface InboxItem {
  id: string;
  key: string;
  kind: string;
  title: string;
  body: string;
  at: string;
  to: string;
  /** Tıklayınca önce bu okula geçilir (platform bildirimleri) */
  schoolId?: string;
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

export type InboxFilter = 'all' | 'unread' | 'read';

export const KIND_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  approval: { icon: ClipboardCheck, tone: 'bg-amber-100 text-amber-700' },
  returned: { icon: Undo2, tone: 'bg-red-100 text-red-700' },
  approved: { icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700' },
  'month-student': { icon: Star, tone: 'bg-brand-100 text-brand-700' },
  'leave-request': { icon: CalendarX2, tone: 'bg-amber-100 text-amber-700' },
  'duty-gap': { icon: ShieldAlert, tone: 'bg-red-100 text-red-700' },
  'support-access': { icon: KeyRound, tone: 'bg-emerald-100 text-emerald-700' },
  'support-revoked': { icon: LockKeyhole, tone: 'bg-slate-200 text-slate-700' },
  'support-expired': { icon: TimerOff, tone: 'bg-slate-200 text-slate-700' },
  'bridge-day': { icon: CalendarDays, tone: 'bg-amber-100 text-amber-700' },
  'meb-calendar': { icon: CalendarDays, tone: 'bg-emerald-100 text-emerald-700' },
};
export const kindStyle = (kind: string) => KIND_STYLE[kind] ?? { icon: Bell, tone: 'bg-slate-100 text-slate-600' };

/**
 * Okul seçiliyse okulun ve platformun bildirimleri, değilse yalnızca platformunkiler. Okula erişim kapandıysa
 * (destek erişimi kapatıldı ya da süresi doldu) okul listesi yenilenir; o arada platform bildirimleri gelir.
 */
function useInboxFetch() {
  const { schoolId, reloadMe } = useAuth();
  return useCallback(
    async (query: string) => {
      if (schoolId) {
        try {
          return await api<InboxPage>(`/api/schools/${schoolId}/inbox?${query}`);
        } catch (err) {
          if (!(err instanceof ApiError && (err.status === 403 || err.status === 404))) throw err;
          void reloadMe();
        }
      }
      return api<InboxPage>(`/api/me/inbox?${query}`);
    },
    [schoolId, reloadMe],
  );
}

/** Zil için son bildirimler ve okunmamış sayısı (sık yoklanır) */
export function useInboxPreview(refetchInterval: number) {
  const { me, schoolId } = useAuth();
  const fetchInbox = useInboxFetch();
  return useQuery({
    queryKey: ['inbox', schoolId, 'preview'],
    queryFn: () => fetchInbox('limit=8'),
    enabled: Boolean(me && (schoolId || me.user.isSuperAdmin)),
    refetchInterval,
  });
}

/** Bildirimler sayfası: süzgeçli, "daha fazla" ile geriye doğru sayfalı */
export function useInboxList(filter: InboxFilter) {
  const { me, schoolId } = useAuth();
  const fetchInbox = useInboxFetch();
  return useInfiniteQuery({
    queryKey: ['inbox', schoolId, 'list', filter],
    queryFn: ({ pageParam }) => fetchInbox(`filter=${filter}&limit=30${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: Boolean(me && (schoolId || me.user.isSuperAdmin)),
  });
}

/** Okundu / okunmadı / sil işlemleri; sonrasında zil ve sayfa tazelenir */
export function useInboxActions() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['inbox'] });
  const read = useMutation({
    mutationFn: (body: { ids?: string[]; keys?: string[]; all?: true; schoolId?: string }) => api('/api/me/inbox/read', { method: 'POST', body }),
    onSuccess: refresh,
  });
  const unread = useMutation({ mutationFn: (id: string) => api(`/api/me/inbox/${id}/unread`, { method: 'POST' }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/me/inbox/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  const readAll = () => read.mutate({ all: true, ...(schoolId ? { schoolId } : {}) });
  return { read, unread, remove, readAll };
}

/** Bildirime tıklayınca: okundu say, gerekiyorsa okula geç, ilgili sayfayı aç */
export function useOpenNotification() {
  const { me, schoolId, setSchoolId } = useAuth();
  const navigate = useNavigate();
  const { read } = useInboxActions();
  return useCallback(
    (n: InboxItem) => {
      if (!n.readAt) read.mutate({ ids: [n.id] });
      if (n.schoolId && n.schoolId !== schoolId) {
        // Erişim süresi dolmuş ya da kapatılmışsa okul listede yoktur: Platform sayfası açılır
        if (!me?.schools.some((s) => s.id === n.schoolId)) return navigate('/platform');
        setSchoolId(n.schoolId);
      }
      navigate(n.to);
    },
    [me, schoolId, setSchoolId, navigate, read],
  );
}

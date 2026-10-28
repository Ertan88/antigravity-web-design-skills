import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, CalendarDays, CalendarX2, CheckCircle2, ClipboardCheck, KeyRound, ShieldAlert, Star, Undo2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { timeAgo } from '../lib/format.ts';

interface PanelNotification {
  key: string;
  kind: 'approval' | 'returned' | 'approved' | 'month-student' | 'leave-request' | 'duty-gap' | 'support-access' | 'bridge-day';
  title: string;
  body: string;
  at: string;
  to: string;
  /** Tıklayınca önce bu okula geçilir */
  schoolId?: string;
}

const ICONS: Record<PanelNotification['kind'], { icon: LucideIcon; tone: string }> = {
  approval: { icon: ClipboardCheck, tone: 'bg-amber-100 text-amber-700' },
  returned: { icon: Undo2, tone: 'bg-red-100 text-red-700' },
  approved: { icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700' },
  'month-student': { icon: Star, tone: 'bg-brand-100 text-brand-700' },
  'leave-request': { icon: CalendarX2, tone: 'bg-amber-100 text-amber-700' },
  'duty-gap': { icon: ShieldAlert, tone: 'bg-red-100 text-red-700' },
  'support-access': { icon: KeyRound, tone: 'bg-emerald-100 text-emerald-700' },
  'bridge-day': { icon: CalendarDays, tone: 'bg-amber-100 text-amber-700' },
};
const FALLBACK = { icon: Bell, tone: 'bg-slate-100 text-slate-600' };

/** Okunan bildirimler bu tarayıcıda tutulur (bildirimler sunucuda o anki duruma göre hesaplanır) */
const SEEN_KEY = 'okulpano.seenNotifications';
function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)));
  } catch {
    /* gizli pencere */
  }
}

/**
 * Sağ üstteki bildirim zili: onay bekleyen duyurular (onay yetkisi olanlara), düzeltme istekleri ve
 * onaylar (duyuruyu girene), ayın öğrencisi hatırlatması. Tıklayınca ilgili yer açılır.
 */
export function NotificationBell() {
  const { me, schoolId, setSchoolId, reloadMe } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isSuperAdmin = Boolean(me?.user.isSuperAdmin);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(loadSeen);
  const box = useRef<HTMLDivElement>(null);
  const list = useQuery({
    queryKey: [schoolId, 'notifications'],
    queryFn: () => api<PanelNotification[]>(`/api/schools/${schoolId}/notifications`),
    enabled: Boolean(schoolId),
    refetchInterval: 30_000,
  });
  // Platform yöneticisine: okulların verdiği destek erişimi. Sık yoklanır; liste değişince (erişim verildi ya da
  // kapandı) okul listesi ve Platform sayfası yenilenir, sayfayı yenilemeden okula girilir.
  const platform = useQuery({
    queryKey: ['me', 'notifications'],
    queryFn: () => api<PanelNotification[]>('/api/me/notifications'),
    enabled: isSuperAdmin,
    refetchInterval: 10_000,
  });
  const platformKeys = platform.data?.map((n) => n.key).join('|');
  const lastKeys = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (platformKeys === undefined) return;
    if (lastKeys.current !== undefined && lastKeys.current !== platformKeys) {
      void reloadMe();
      void qc.invalidateQueries({ queryKey: ['platform'] });
    }
    lastKeys.current = platformKeys;
  }, [platformKeys, reloadMe, qc]);
  const items = [...(platform.data ?? []), ...(list.data ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const unread = items.filter((n) => !seen.has(n.key)).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'pointerdown' && box.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!schoolId && !isSuperAdmin) return null;
  const markAll = () => {
    const next = new Set([...seen, ...items.map((n) => n.key)]);
    setSeen(next);
    saveSeen(next);
  };
  const go = (n: PanelNotification) => {
    const next = new Set([...seen, n.key]);
    setSeen(next);
    saveSeen(next);
    setOpen(false);
    if (n.schoolId && n.schoolId !== schoolId) setSchoolId(n.schoolId);
    navigate(n.to);
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-label={unread ? `${unread} yeni bildirim` : 'Bildirimler'}
        onClick={() => setOpen((x) => !x)}
        className={clsx(
          'relative inline-flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-ink',
          open && 'bg-slate-100 text-ink',
        )}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-toast absolute top-11 right-0 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-surface shadow-[0_16px_50px_-12px_rgba(15,23,42,0.4)] ring-1 ring-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-ink">Bildirimler</span>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-semibold text-brand-700 hover:underline">
                Tümünü okundu say
              </button>
            )}
          </div>
          {items.length ? (
            <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
              {items.map((n) => {
                const { icon: Icon, tone } = ICONS[n.kind] ?? FALLBACK;
                const isNew = !seen.has(n.key);
                return (
                  <li key={n.key}>
                    <button type="button" onClick={() => go(n)} className={clsx('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50', isNew && 'bg-brand-50/40')}>
                      <span className={clsx('flex size-8 shrink-0 items-center justify-center rounded-lg', tone)}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                          {n.title}
                          {isNew && <span className="size-2 rounded-full bg-red-500" />}
                        </span>
                        <span className="block text-sm text-slate-600">{n.body}</span>
                        <span className="text-xs text-slate-400">{timeAgo(n.at)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Yeni bildirim yok.</p>
          )}
        </div>
      )}
    </div>
  );
}

import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.tsx';
import { timeAgo } from '../lib/format.ts';
import { kindStyle, useInboxActions, useInboxPreview, useOpenNotification } from '../lib/inbox.tsx';

/** Eski sürümde okunanlar tarayıcıda tutuluyordu: bir kez sunucuya aktarılır */
const SEEN_KEY = 'okulpano.seenNotifications';
function takeLegacySeen(): string[] {
  try {
    const keys = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
    localStorage.removeItem(SEEN_KEY);
    return keys;
  } catch {
    return [];
  }
}

/**
 * Sağ üstteki bildirim zili: son bildirimler ve okunmamış sayısı. Bildirimler sunucudaki kutuda saklanır;
 * okunanlar "Tüm bildirimler" sayfasında geçmiş olarak kalır, okundu bilgisi her cihazda aynıdır.
 */
export function NotificationBell() {
  const { me, schoolId, reloadMe } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = Boolean(me?.user.isSuperAdmin);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Platform yöneticisi destek erişimini hızlı görsün diye daha sık yoklanır
  const preview = useInboxPreview(isSuperAdmin ? 10_000 : 30_000);
  const { read, readAll } = useInboxActions();
  const openItem = useOpenNotification();
  const items = preview.data?.items ?? [];
  const unread = preview.data?.unread ?? 0;

  // İlk yoklama bildirimleri kutuya yazdıktan sonra eski okunanlar aktarılır
  const migrated = useRef(false);
  useEffect(() => {
    if (!preview.data || migrated.current) return;
    migrated.current = true;
    const keys = takeLegacySeen();
    if (keys.length) read.mutate({ keys });
  }, [preview.data, read]);

  // Destek erişimi verildi / kapatıldı / doldu: okul listesi ve Platform sayfası sayfa yenilemeden güncellenir
  const supportSig = items.filter((n) => n.kind.startsWith('support-')).map((n) => n.id).join('|');
  const lastSig = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!preview.data) return;
    if (lastSig.current !== undefined && lastSig.current !== supportSig) {
      void reloadMe();
      void qc.invalidateQueries({ queryKey: ['platform'] });
    }
    lastSig.current = supportSig;
  }, [supportSig, preview.data, reloadMe, qc]);

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
            <span className="text-sm font-semibold text-ink">
              Bildirimler
              {unread > 0 && <span className="ml-1.5 text-xs font-medium text-slate-500">{unread} okunmamış</span>}
            </span>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="text-xs font-semibold text-brand-700 hover:underline">
                Tümünü okundu say
              </button>
            )}
          </div>
          {items.length ? (
            <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
              {items.map((n) => {
                const { icon: Icon, tone } = kindStyle(n.kind);
                const isNew = !n.readAt;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        openItem(n);
                      }}
                      className={clsx('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50', isNew ? 'bg-brand-50/40' : 'opacity-75')}
                    >
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
            <p className="px-4 py-8 text-center text-sm text-slate-500">Bildirim yok.</p>
          )}
          <Link
            to="/bildirimler"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-slate-50"
          >
            Tüm bildirimler ve geçmiş <ChevronRight className="size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

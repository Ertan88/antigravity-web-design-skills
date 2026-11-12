/**
 * Panelin tek onay penceresi. Her yerden `await confirm({...})` ile açılır; `<ConfirmHost />` uygulamada bir kez
 * çizilir. Tarayıcının onay kutusu ve sil düğmesinin yanında açılan küçük kutu bunun yerine kullanılmaz.
 *
 * - Ton: nötr (bilgi), uyarı (amber), tehlike (kırmızı). Simge ve renk tondan gelir.
 * - `hold`: kritik işlemlerde onay düğmesine 1,5 sn basılı tutmak gerekir (yanlış tıklamaya karşı).
 * - Esc, dışarı tıklama ve Vazgeç "hayır" sayılır; ilk odak Vazgeç'tedir, Enter yanlışlıkla bir şey silmez.
 */
import clsx from 'clsx';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, CircleAlert, Power, Trash2, X, type AppIcon } from './icons.tsx';

export type ConfirmTone = 'neutral' | 'warning' | 'danger';

export type ConfirmOptions = {
  title: string;
  /** Başlığın altındaki soluk satır (ör. okul adı) */
  subtitle?: string;
  message?: ReactNode;
  /** "Ne olur?" listesi: ok=true yeşil tik (korunan), diğerleri kırmızı çarpı */
  effects?: { text: string; ok?: boolean }[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: AppIcon;
  /** Kritik işlem: düğmeye basılı tutarak onay */
  hold?: boolean;
  /** Basılı tutma düğmesinin yazısı (varsayılan "Onaylamak için basılı tutun") */
  holdLabel?: string;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirm(options: ConfirmOptions): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...options, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const p = current;
  current = null;
  emit();
  p?.resolve(ok);
}

const TONE: Record<ConfirmTone, { tile: string; button: string; icon: AppIcon }> = {
  neutral: { tile: 'bg-slate-100 text-ink', button: 'bg-brand-600 text-white hover:bg-brand-500', icon: CircleAlert },
  warning: {
    tile: 'bg-amber-100 text-amber-700 dark:bg-[#3b2a0c] dark:text-[#fbbf24]',
    button: 'bg-amber-600 text-white hover:bg-amber-500 dark:bg-[#f59e0b] dark:text-[#1c1206]',
    icon: AlertTriangle,
  },
  danger: {
    tile: 'bg-rose-100 text-rose-600 dark:bg-[#3e1422] dark:text-[#fb7185]',
    button: 'bg-rose-600 text-white hover:bg-rose-500 dark:bg-[#fb7185] dark:text-[#1d0a10] dark:hover:bg-[#fda4af]',
    icon: Trash2,
  },
};

const HOLD_MS = 1500;

/** Basılı tutunca dolan onay düğmesi; bırakınca boşalır. Fare, dokunma, Boşluk ve Enter ile çalışır. */
function HoldButton({ label, onDone, tone }: { label: string; onDone: () => void; tone: ConfirmTone }) {
  const [p, setP] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef(0);
  const done = useRef(false);

  const tick = () => {
    if (start.current == null) return;
    const v = Math.min(1, (performance.now() - start.current) / HOLD_MS);
    setP(v);
    if (v >= 1) {
      done.current = true;
      start.current = null;
      onDone();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (start.current != null || done.current) return;
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  };
  const end = () => {
    if (done.current) return;
    start.current = null;
    cancelAnimationFrame(raf.current);
    setP(0);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const fill = tone === 'danger' ? 'bg-rose-600 dark:bg-[#fb7185]' : tone === 'warning' ? 'bg-amber-600' : 'bg-brand-600';
  const soft = tone === 'danger' ? 'bg-rose-100 text-rose-700 dark:bg-[#3e1422] dark:text-[#fb7185]' : tone === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-ink';
  const onFill = tone === 'danger' ? 'text-white dark:text-[#1d0a10]' : 'text-white';
  const pct = `${Math.round(p * 100)}%`;
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        begin();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && end()}
      onBlur={end}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
      className={clsx('relative h-10 touch-none overflow-hidden rounded-full px-5 text-sm font-bold select-none', soft)}
    >
      <span className={clsx('absolute inset-y-0 left-0', fill, p === 0 && 'transition-[width] duration-200')} style={{ width: pct }} />
      <span className="relative">{label}</span>
      <span
        aria-hidden
        className={clsx('absolute inset-0 flex items-center justify-center px-5', onFill)}
        style={{ clipPath: `inset(0 calc(100% - ${pct}) 0 0)` }}
      >
        {label}
      </span>
    </button>
  );
}

export function ConfirmHost() {
  const pending = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && settle(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending]);

  if (!pending) return null;
  const tone = pending.tone ?? 'danger';
  const t = TONE[tone];
  const Icon = pending.icon ?? t.icon;
  const label = pending.confirmLabel ?? (tone === 'danger' ? 'Sil' : 'Onayla');

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade absolute inset-0 bg-black/40 backdrop-blur-[2px] dark:bg-black/65" onClick={() => settle(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={pending.title}
        className="animate-toast relative w-full overflow-hidden rounded-t-3xl bg-elevated shadow-2xl sm:max-w-[30rem] sm:rounded-3xl dark:ring-1 dark:ring-white/12"
      >
        <div className="flex gap-4 px-6 pt-6 pb-5">
          <div className={clsx('grid size-11 shrink-0 place-items-center rounded-2xl', t.tile)}>
            <Icon className="size-[22px]" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-lg leading-snug font-extrabold tracking-tight text-ink">{pending.title}</h2>
            {pending.subtitle && <div className="mt-0.5 text-sm text-slate-500">{pending.subtitle}</div>}
            {pending.message && <div className="mt-1.5 text-sm leading-relaxed text-slate-500">{pending.message}</div>}
            {pending.effects && pending.effects.length > 0 && (
              <ul className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
                {pending.effects.map((e) => (
                  <li key={e.text} className="flex items-start gap-2.5 text-sm leading-snug text-ink">
                    <span
                      className={clsx(
                        'mt-px grid size-5 shrink-0 place-items-center rounded-full',
                        e.ok ? 'bg-emerald-100 text-emerald-600 dark:bg-[#14301f] dark:text-[#4ade80]' : 'bg-rose-100 text-rose-600 dark:bg-[#3e1422] dark:text-[#fb7185]',
                      )}
                    >
                      {e.ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                    </span>
                    {e.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => settle(false)}
            className="h-10 rounded-full bg-surface px-5 text-sm font-bold text-ink ring-1 ring-slate-200 hover:bg-slate-100"
          >
            {pending.cancelLabel ?? 'Vazgeç'}
          </button>
          {pending.hold ? (
            <HoldButton label={pending.holdLabel ?? 'Onaylamak için basılı tutun'} tone={tone} onDone={() => settle(true)} />
          ) : (
            <button
              type="button"
              onClick={() => settle(true)}
              className={clsx('inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold', t.button)}
            >
              {tone === 'danger' && !pending.icon && <Trash2 className="size-4" />}
              {label}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Aboneliği kapatma onayı (web ve mobilde aynı metin): kritik işlem, basılı tutarak onaylanır */
export function closeSubscription(schoolName: string): ConfirmOptions {
  return {
    title: 'Aboneliği kapat',
    subtitle: schoolName,
    effects: [
      { text: 'Panolar yayını durdurur' },
      { text: 'Okul kullanıcıları giriş yapamaz' },
      { text: 'Veriler silinmez; yeniden başlatınca kaldığı yerden sürer', ok: true },
    ],
    tone: 'danger',
    icon: Power,
    hold: true,
    holdLabel: 'Kapatmak için basılı tutun',
  };
}

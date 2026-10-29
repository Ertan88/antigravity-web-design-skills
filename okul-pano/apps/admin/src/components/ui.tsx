import { WEEKDAY_SHORT } from '@okulpano/shared';
import clsx from 'clsx';
import { AlertTriangle, Eye, EyeOff, Loader2, Trash2, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { findNav } from '../lib/nav.ts';

/* ---------- Düğmeler ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const variants: Record<Variant, string> = {
  // Düz mürekkep hap düğme (bento): gölge ve geçiş yok
  primary: 'bg-brand-600 text-white hover:bg-brand-500',
  secondary: 'bg-surface text-ink ring-1 ring-slate-200 hover:bg-slate-100 hover:ring-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-ink',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        size === 'sm' ? 'h-8 px-3.5 text-xs' : 'h-10 px-5 text-sm',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      className={clsx(
        'inline-flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-ink disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Form alanları ---------- */

const control =
  'block w-full rounded-xl border-0 bg-surface px-3.5 py-2 text-sm text-ink ring-1 ring-slate-200 transition placeholder:text-slate-400 hover:ring-slate-300 focus:ring-2 focus:ring-ink focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';

export function Field({
  label,
  error,
  help,
  children,
  className,
}: {
  label: string;
  error?: string;
  help?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : help ? (
        <p className="mt-1.5 text-xs text-slate-500">{help}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={clsx(control, 'h-10', invalid && 'ring-red-400', className)} {...rest} />;
}

/** Şifre kutusu: göz düğmesiyle yazılan şifre gösterilip gizlenir (yanlış yazımı görmek için) */
export function PasswordInput({ className, invalid, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input type={visible ? 'text' : 'password'} className={clsx(control, 'h-10 pr-11', invalid && 'ring-red-400', className)} {...rest} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((x) => !x)}
        aria-label={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
        title={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
        className="absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function Textarea({ className, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={clsx(control, 'min-h-24', invalid && 'ring-red-400', className)} {...rest} />;
}

export function Select({ className, invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={clsx(control, 'h-10 pr-8', invalid && 'ring-red-400', className)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={clsx('flex items-start gap-3', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-emerald-500' : 'bg-slate-300',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-medium text-slate-800">{label}</span>}
          {description && <span className="block text-xs text-slate-500">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function WeekdayPicker({ value, onChange, days = [1, 2, 3, 4, 5, 6, 7] }: { value: number[]; onChange: (v: number[]) => void; days?: number[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={clsx(
              'h-9 min-w-12 rounded-full px-3 text-sm font-bold ring-1 transition-colors',
              on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50',
            )}
          >
            {WEEKDAY_SHORT[d]}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full bg-slate-200/70 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-full px-4 py-1.5 text-sm font-bold transition-all',
            o.value === value ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(28,25,23,0.08)]' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Yerleşim ---------- */

/** Sayfa başlığı: menüdeki simge ve bölüm adı adresten otomatik bulunur */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  const nav = findNav(useLocation().pathname);
  const Icon = nav?.item.icon;
  return (
    <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <div className={clsx('hidden size-14 shrink-0 items-center justify-center rounded-3xl sm:flex', groupTile(nav?.group))}>
            <Icon className="size-6" />
          </div>
        )}
        <div className="min-w-0">
          {nav?.group && <div className="mb-0.5 text-[13px] font-semibold text-slate-500">{nav.group}</div>}
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.03em] text-ink sm:text-[32px]">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Menü grubuna göre başlık simgesinin pastel kutusu (her bölüm kendi renginde) */
const GROUP_TILES = ['bg-tile-sky text-tile-sky-ink', 'bg-tile-peach text-tile-peach-ink', 'bg-tile-mint text-tile-mint-ink', 'bg-tile-lilac text-tile-lilac-ink', 'bg-tile-sun text-tile-sun-ink', 'bg-tile-rose text-tile-rose-ink'];
export function groupTile(group?: string | null): string {
  if (!group) return 'bg-tile-dark text-white';
  const n = [...group].reduce((a, c) => a + c.charCodeAt(0), 0);
  return GROUP_TILES[n % GROUP_TILES.length]!;
}

/** Düz bento kartı: beyaz zemin, ince sıcak kenarlık, gölgesiz */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-3xl bg-surface ring-1 ring-slate-200', className)}>
      {children}
    </div>
  );
}

const badgeTones = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  blue: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
};

export function Badge({ tone = 'slate', children, dot }: { tone?: keyof typeof badgeTones; children: ReactNode; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', badgeTones[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">{icon}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 className="size-5 animate-spin" /> {label}
    </div>
  );
}

export function Alert({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'red' | 'blue' }) {
  const tones = {
    amber: 'bg-tile-sun text-tile-sun-ink ring-transparent',
    red: 'bg-tile-rose text-tile-rose-ink ring-transparent',
    blue: 'bg-tile-sky text-tile-sky-ink ring-transparent',
  };
  return (
    <div className={clsx('flex gap-2.5 rounded-2xl p-4 text-sm font-medium ring-1', tones[tone])}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/* ---------- Pencere ---------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  // Dışarı tıklama sayacı: uyarıyı yeniden gösterir; sallanma içeriği yeniden kurmadan sınıfla yapılır
  const [nudge, setNudge] = useState(0);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (!open) setNudge(0);
  }, [open]);
  useEffect(() => {
    if (!nudge) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 320);
    return () => clearTimeout(t);
  }, [nudge]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      {/* Dışarı tıklamak pencereyi kapatmaz (yazılanlar kaybolmasın): pencere kısaca sallanır ve nasıl kapanacağı söylenir */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setNudge((n) => n + 1)} />
      {nudge > 0 && (
        <div key={nudge} role="status" className="animate-toast pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          Kapatmak için Vazgeç ya da ✕ düğmesini kullanın
        </div>
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl',
          shaking && 'animate-nudge',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
          size === 'xl' && 'sm:max-w-4xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <IconButton label="Kapat" onClick={onClose} className="-mr-2 -mt-1">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:rounded-b-3xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Tek tıkla silmeyi önleyen iki aşamalı sil düğmesi */
/**
 * Silme: çöp kutusuna basınca hemen yanında küçük bir onay kutusu açılır ("Silinsin mi?" · Vazgeç · Sil).
 * Kendiliğinden kapanmaz; Vazgeç, Esc ya da dışarı tıklamak kapatır. Kutu sayfanın üstünde açılır,
 * tablo kenarlarında kesilmez.
 */
export function DeleteButton({
  onConfirm,
  label = 'Sil',
  disabled,
  what,
}: {
  onConfirm: () => void;
  label?: string;
  disabled?: boolean;
  /** Onay kutusunda ne silineceği (ör. "Bu duyuru") */
  what?: string;
}) {
  const [pos, setPos] = useState<{ top: number; right: number; above: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const open = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const above = r.bottom + 120 > window.innerHeight;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, right: Math.max(8, window.innerWidth - r.right), above });
  };
  useEffect(() => {
    if (!pos) return;
    cancel.current?.focus();
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'pointerdown' && (box.current?.contains(e.target as Node) || button.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    const reset = () => setPos(null);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close);
    window.addEventListener('scroll', reset, true);
    window.addEventListener('resize', reset);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close);
      window.removeEventListener('scroll', reset, true);
      window.removeEventListener('resize', reset);
    };
  }, [pos]);
  return (
    <>
      <IconButton
        ref={button}
        label={label}
        disabled={disabled}
        aria-expanded={Boolean(pos)}
        className={clsx('hover:bg-red-50 hover:text-red-600', pos && 'bg-red-50 text-red-600')}
        onClick={() => (pos ? setPos(null) : open())}
      >
        <Trash2 className="size-4" />
      </IconButton>
      {pos &&
        createPortal(
          <div
            ref={box}
            role="dialog"
            aria-label="Silme onayı"
            className="animate-toast fixed z-[60] w-60 rounded-2xl bg-surface p-3 text-left shadow-[0_12px_40px_-8px_rgba(15,23,42,0.35)] ring-1 ring-slate-200"
            style={{ top: pos.top, right: pos.right, transform: pos.above ? 'translateY(-100%)' : undefined }}
          >
            <div className="text-sm font-semibold text-ink">{what ? `${what} silinsin mi?` : 'Silinsin mi?'}</div>
            <div className="mt-0.5 text-xs text-slate-500">Bu işlem geri alınamaz.</div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                ref={cancel}
                type="button"
                onClick={() => setPos(null)}
                className="rounded-full px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setPos(null);
                  onConfirm();
                }}
                className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
              >
                <Trash2 className="size-3.5" /> Sil
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ---------- Tablo ---------- */

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-500">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 whitespace-nowrap first:pl-5 last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx('px-4 py-3 align-middle first:pl-5 last:pr-5', className)}>{children}</td>;
}

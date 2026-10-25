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
  primary:
    'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_1px_2px_rgba(19,112,143,0.35),0_4px_12px_-4px_rgba(19,112,143,0.5),inset_0_1px_0_rgba(255,255,255,0.18)] hover:brightness-110',
  secondary:
    'bg-surface text-slate-700 ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-slate-50 hover:text-ink hover:ring-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-ink',
  danger: 'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_1px_2px_rgba(220,38,38,0.35)] hover:brightness-110',
  success:
    'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_1px_2px_rgba(5,150,105,0.35),0_4px_12px_-4px_rgba(5,150,105,0.5)] hover:brightness-110',
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
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        size === 'sm' ? 'h-8 rounded-lg px-3 text-xs' : 'h-10 px-4 text-sm',
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
        'inline-flex size-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-ink disabled:opacity-40',
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
  'block w-full rounded-xl border-0 bg-surface px-3.5 py-2 text-sm text-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200 transition placeholder:text-slate-400 hover:ring-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';

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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
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
          checked ? 'bg-brand-600' : 'bg-slate-300',
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
              'h-9 min-w-12 rounded-lg px-2 text-sm font-semibold ring-1 transition-colors',
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
    <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-slate-100/80 p-1 ring-1 ring-slate-200/60">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-all',
            o.value === value ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(15,23,42,0.1)] ring-1 ring-slate-200/60' : 'text-slate-500 hover:text-slate-800',
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
          <div className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-[0_8px_20px_-8px_rgba(19,112,143,0.7)] sm:flex">
            <Icon className="size-6" />
          </div>
        )}
        <div className="min-w-0">
          {nav?.group && <div className="mb-0.5 text-xs font-semibold tracking-wider text-brand-600 uppercase">{nav.group}</div>}
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[26px]">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-16px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.06]',
        className,
      )}
    >
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
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-brand-100">{icon}</div>
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
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
    blue: 'bg-brand-50 text-brand-900 ring-brand-200',
  };
  return (
    <div className={clsx('flex gap-2.5 rounded-xl p-3.5 text-sm ring-1', tones[tone])}>
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
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
          size === 'xl' && 'sm:max-w-4xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <IconButton label="Kapat" onClick={onClose} className="-mr-2 -mt-1">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:rounded-b-2xl">{footer}</div>}
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
            className="animate-toast fixed z-[60] w-60 rounded-xl bg-surface p-3 text-left shadow-[0_12px_40px_-8px_rgba(15,23,42,0.35)] ring-1 ring-slate-200"
            style={{ top: pos.top, right: pos.right, transform: pos.above ? 'translateY(-100%)' : undefined }}
          >
            <div className="text-sm font-semibold text-ink">{what ? `${what} silinsin mi?` : 'Silinsin mi?'}</div>
            <div className="mt-0.5 text-xs text-slate-500">Bu işlem geri alınamaz.</div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                ref={cancel}
                type="button"
                onClick={() => setPos(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setPos(null);
                  onConfirm();
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
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
          <tr className="border-b border-slate-100 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
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

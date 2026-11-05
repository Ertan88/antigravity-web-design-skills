import { WEEKDAY_SHORT } from '@okulpano/shared';
import clsx from 'clsx';
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Trash2, X } from './icons.tsx';
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { findNav } from '../lib/nav.ts';
import { confirm } from './confirm.tsx';

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

interface SelectOption {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
  group: string | null;
}

/** <option> ve <optgroup> çocuklarından seçenek listesi (iç içe Fragment ve dizi de olur) */
function collectOptions(children: ReactNode, group: string | null = null, out: SelectOption[] = []): SelectOption[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>;
    if (el.type === Fragment) collectOptions(el.props.children, group, out);
    else if (el.type === 'optgroup') collectOptions(el.props.children, el.props.label ?? null, out);
    else if (el.type === 'option') {
      const text = Children.toArray(el.props.children).filter((c) => typeof c === 'string' || typeof c === 'number').join('');
      out.push({ value: String(el.props.value ?? text), label: el.props.children, text, disabled: Boolean(el.props.disabled), group });
    }
  });
  return out;
}

/**
 * Açılır kutu: tarayıcının kendi listesi yerine her tarayıcıda aynı görünen liste (yuvarlak köşeli kart, gölge, grup
 * başlıkları, seçili seçenekte tik, klavyeyle gezinme: ↑ ↓ Enter Esc ve harfle atlama). Kullanımı <select> ile aynı:
 * value, onChange(e => e.target.value), <option> ve <optgroup> çocukları.
 */
export function Select({
  className,
  invalid,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  id,
  name,
  'aria-label': ariaLabel,
  plain,
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; /** Kutu stili tamamen className'den (ör. tablo içi küçük alanlar) */ plain?: boolean }) {
  const options = collectOptions(children);
  const [inner, setInner] = useState(String(defaultValue ?? options[0]?.value ?? ''));
  const current = value !== undefined ? String(value) : inner;
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; max: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 240 && above > below;
    const width = Math.max(r.width, 200);
    setPos({ left: Math.min(r.left, window.innerWidth - width - 8), top: up ? r.top - 6 : r.bottom + 6, width, up, max: Math.min(352, up ? above : below) });
  };
  const show = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };
  const choose = (o: SelectOption) => {
    if (o.disabled) return;
    setOpen(false);
    button.current?.focus();
    if (o.value === current) return;
    if (value === undefined) setInner(o.value);
    const target = { value: o.value, name: name ?? '' };
    onChange?.({ target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>);
  };
  const move = (from: number, step: number) => {
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = (i + step + options.length) % options.length;
      if (!options[i]!.disabled) return i;
    }
    return from;
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const reflow = () => place();
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open]);
  // Açılınca seçili seçenek görünür alana kayar
  useLayoutEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKey = (e: ReactKeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
    else if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => move(a, 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => move(a, -1)));
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[active]) choose(options[active]!);
    } else if (e.key.length === 1) {
      const k = e.key.toLocaleLowerCase('tr-TR');
      const i = options.findIndex((o, j) => j > active && o.text.toLocaleLowerCase('tr-TR').startsWith(k));
      const j = i >= 0 ? i : options.findIndex((o) => o.text.toLocaleLowerCase('tr-TR').startsWith(k));
      if (j >= 0) setActive(j);
    }
  };

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={clsx(plain ? 'flex cursor-pointer items-center gap-1.5 text-left disabled:cursor-default' : [control, 'flex h-10 cursor-pointer items-center gap-2 text-left disabled:cursor-default'], invalid && 'ring-red-400', className)}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown className={clsx('size-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            style={{ left: pos.left, top: pos.top, minWidth: pos.width, maxHeight: pos.max, transform: pos.up ? 'translateY(-100%)' : undefined }}
            className="fixed z-[70] max-w-[min(32rem,calc(100vw-16px))] overflow-y-auto rounded-2xl border border-slate-200 bg-surface p-1.5 text-ink shadow-[0_18px_40px_-16px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.06)]"
          >
            {options.map((o, i) => (
              <Fragment key={`${o.group ?? ''}|${o.value}|${i}`}>
                {o.group !== null && o.group !== options[i - 1]?.group && (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-extrabold tracking-wide text-slate-500">{o.group.toLocaleUpperCase('tr-TR')}</div>
                )}
                <div
                  data-i={i}
                  role="option"
                  aria-selected={o.value === current}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={clsx(
                    'flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-sm whitespace-nowrap',
                    o.value === current ? 'font-bold' : 'font-medium',
                    i === active && 'bg-slate-100',
                    o.disabled && 'cursor-default opacity-45',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === current && <Check className="size-4 shrink-0" strokeWidth={3} />}
                </div>
              </Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
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
          // Açık: yeşil, kapalı: kırmızı (koyu temada biraz daha yumuşak tonlar; renk ölçeği dönüşümünden etkilenmez)
          checked ? 'bg-[#16a34a] dark:bg-[#22a55a]' : 'bg-[#dc2626] dark:bg-[#c53030]',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-[#ffffff] shadow transition-transform',
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

/**
 * Silme düğmesi: çöp kutusuna basınca ortak onay penceresi açılır ("… silinsin mi?" · Vazgeç · Sil).
 * `hold` verilirse silmek için onay düğmesine basılı tutmak gerekir.
 */
export function DeleteButton({
  onConfirm,
  label = 'Sil',
  disabled,
  what,
  message,
  hold,
  className,
}: {
  onConfirm: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  /** Onay penceresinde ne silineceği (ör. "Bu duyuru") */
  what?: string;
  /** Silmenin sonucu (varsayılan: "Bu işlem geri alınamaz.") */
  message?: ReactNode;
  hold?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <IconButton
      label={label}
      disabled={disabled}
      className={clsx('hover:bg-red-50 hover:text-red-600', open && 'bg-red-50 text-red-600', className)}
      onClick={async () => {
        setOpen(true);
        const ok = await confirm({
          title: what ? `${what} silinsin mi?` : 'Silinsin mi?',
          message: message ?? 'Bu işlem geri alınamaz.',
          tone: 'danger',
          confirmLabel: 'Sil',
          hold,
          holdLabel: 'Silmek için basılı tutun',
        });
        setOpen(false);
        if (ok) onConfirm();
      }}
    >
      <Trash2 className="size-4" />
    </IconButton>
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

/* ---------- Ay seçici (bütün panelde tek tip) ---------- */

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const nowMonth = () => {
  const d = new Date();
  return ym(d.getFullYear(), d.getMonth() + 1);
};
const addMonths = (month: string, n: number) => {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  return ym(y + Math.floor(m / 12), (((m % 12) + 12) % 12) + 1);
};
/** "2026-11" → "Kasım 2026" */
export const monthName = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/**
 * Ay seçici: "‹ Kasım 2026 ›" şeridi; oklar bir önceki / sonraki aya geçer, ay adına tıklayınca yıl ve 12 ayın ızgarası
 * açılır ("Bu ay" ile bugüne döner). min / max (YYYY-AA) dışındaki aylar seçilemez. Bütün sayfalarda aynı görünür.
 */
export function MonthPicker({
  value,
  onChange,
  min,
  max,
  id,
  className,
  'aria-label': ariaLabel = 'Ay',
}: {
  value: string;
  onChange: (month: string) => void;
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const valid = /^\d{4}-\d{2}$/.test(value) ? value : nowMonth();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(valid.slice(0, 4)));
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const label = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const allowed = (m: string) => (!min || m >= min) && (!max || m <= max);
  const go = (m: string) => {
    if (!allowed(m)) return;
    onChange(m);
    setOpen(false);
  };
  const show = () => {
    const r = label.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 300 && r.top > 300;
    setPos({ left: Math.max(8, Math.min(r.left + r.width / 2 - 140, window.innerWidth - 288)), top: up ? r.top - 6 : r.bottom + 6, up });
    setYear(Number(valid.slice(0, 4)));
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!label.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const hide = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open]);
  const prev = addMonths(valid, -1);
  const next = addMonths(valid, 1);
  const today = nowMonth();
  return (
    <div className={clsx('inline-flex h-10 shrink-0 items-center gap-0.5 rounded-xl bg-surface p-1 ring-1 ring-slate-200', className)}>
      <IconButton label="Önceki ay" disabled={!allowed(prev)} onClick={() => go(prev)} className="size-8! disabled:opacity-30">
        <ChevronLeft className="size-4" />
      </IconButton>
      <button
        ref={label}
        id={id}
        type="button"
        aria-label={`${ariaLabel}: ${monthName(valid)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        className="flex h-8 min-w-32 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-bold text-ink hover:bg-slate-100"
      >
        {monthName(valid)}
        <ChevronDown className={clsx('size-3.5 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>
      <IconButton label="Sonraki ay" disabled={!allowed(next)} onClick={() => go(next)} className="size-8! disabled:opacity-30">
        <ChevronRight className="size-4" />
      </IconButton>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Ay seç"
            style={{ left: pos.left, top: pos.top, transform: pos.up ? 'translateY(-100%)' : undefined }}
            className="fixed z-[70] w-[280px] rounded-2xl border border-slate-200 bg-surface p-3 text-ink shadow-[0_18px_40px_-16px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.06)]"
          >
            <div className="mb-2 flex items-center justify-between">
              <IconButton label="Önceki yıl" disabled={Boolean(min) && year - 1 < Number(min!.slice(0, 4))} onClick={() => setYear((y) => y - 1)} className="size-8! disabled:opacity-30">
                <ChevronLeft className="size-4" />
              </IconButton>
              <span className="text-sm font-extrabold tabular-nums">{year}</span>
              <IconButton label="Sonraki yıl" disabled={Boolean(max) && year + 1 > Number(max!.slice(0, 4))} onClick={() => setYear((y) => y + 1)} className="size-8! disabled:opacity-30">
                <ChevronRight className="size-4" />
              </IconButton>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTH_NAMES.map((n, i) => {
                const m = ym(year, i + 1);
                const on = m === valid;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!allowed(m)}
                    onClick={() => go(m)}
                    className={clsx(
                      'h-9 rounded-lg text-sm font-semibold transition disabled:cursor-default disabled:opacity-30',
                      on ? 'bg-ink font-bold text-surface' : 'hover:bg-slate-100',
                      !on && m === today && 'ring-1 ring-slate-300',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            {valid !== today && allowed(today) && (
              <button type="button" onClick={() => go(today)} className="mt-2 w-full rounded-lg py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100">
                Bu aya dön ({monthName(today)})
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

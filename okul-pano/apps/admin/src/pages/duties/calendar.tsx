import { WEEKDAY_NAMES, WEEKDAY_SHORT } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Eraser, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { IconButton } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

/* ---------- Ay yardımcıları ---------- */

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const pad = (n: number) => String(n).padStart(2, '0');

export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export type DayInfo = { iso: string; day: number; weekday: number };

/** Ayın hafta içi günleri */
export function schoolDays(month: string): DayInfo[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(y, m - 1, i + 1);
    return { iso: `${month}-${pad(i + 1)}`, day: i + 1, weekday: ((date.getDay() + 6) % 7) + 1 };
  }).filter((d) => d.weekday <= 5);
}

/* ---------- Ortak parçalar ---------- */

export function MonthNav({ month, onMonth }: { month: string; onMonth: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-surface p-1 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-slate-200">
      <IconButton label="Önceki ay" onClick={() => onMonth(shiftMonth(month, -1))}>
        <ChevronLeft className="size-4" />
      </IconButton>
      <button
        type="button"
        onClick={() => onMonth(currentMonth())}
        title="Bu aya dön"
        className="w-32 rounded-lg py-1 text-center text-sm font-semibold text-slate-800 hover:bg-slate-50"
      >
        {monthLabel(month)}
      </button>
      <IconButton label="Sonraki ay" onClick={() => onMonth(shiftMonth(month, 1))}>
        <ChevronRight className="size-4" />
      </IconButton>
    </div>
  );
}

export interface Holiday {
  id: string | null;
  date: string;
  name: string;
  source: 'official' | 'school';
}

/** Ayın tatilleri: resmi / dini tatiller ve Excel'den tanınan okul tatilleri */
export function useHolidays(month: string) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('holidays');
  const q = useQuery({
    queryKey: [schoolId, 'holidays', month],
    queryFn: () => api<Holiday[]>(`${path}?month=${month}`),
    enabled: Boolean(schoolId),
    staleTime: 60_000,
  });
  return new Map((q.data ?? []).map((h) => [h.date, h]));
}

/** Takvim ızgarası: geniş ekranda her satır bir hafta (Pzt–Cum), dar ekranda gün kartları alt alta */
export function MonthGrid({ month, children }: { month: string; children: (day: DayInfo, isToday: boolean) => ReactNode }) {
  const days = schoolDays(month);
  const lead = days[0] ? days[0].weekday - 1 : 0;
  const today = todayIso();
  return (
    <div className="p-3 sm:p-4">
      <div className="hidden grid-cols-5 gap-2 pb-1.5 lg:grid">
        {[1, 2, 3, 4, 5].map((d) => (
          <span key={d} className="px-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            {WEEKDAY_NAMES[d]}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-2 lg:grid-cols-5">
        {Array.from({ length: lead }, (_, i) => (
          <li key={`b${i}`} className="hidden lg:block" aria-hidden="true" />
        ))}
        {days.map((d) => children(d, d.iso === today))}
      </ol>
    </div>
  );
}

export function DayShell({
  day,
  isToday,
  tone,
  aside,
  holiday,
  holidayCentered = false,
  children,
}: {
  day: DayInfo;
  isToday: boolean;
  tone: 'teal' | 'amber';
  aside?: ReactNode;
  /** O gün tatilse adı gösterilir */
  holiday?: Holiday;
  /** Tatil adı üstteki küçük etiket yerine kartın ortasında (içeriği olmayan tam gün tatil) */
  holidayCentered?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={clsx(
        'relative rounded-2xl p-2.5 ring-1 transition',
        holiday
          ? 'bg-rose-50 ring-rose-100'
          : isToday
            ? tone === 'teal'
              ? 'bg-teal-50 ring-teal-300'
              : 'bg-amber-50 ring-amber-300'
            : 'bg-slate-50/70 ring-slate-200/70 hover:bg-surface',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-sm">
        <span className="font-bold text-ink tabular-nums">{day.day}</span>
        <span className={clsx('text-xs font-medium', isToday ? (tone === 'teal' ? 'text-teal-700' : 'text-amber-700') : 'text-slate-500')}>
          {isToday ? 'Bugün' : WEEKDAY_SHORT[day.weekday]}
        </span>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {holiday &&
        (holidayCentered ? (
          <div className="flex min-h-16 items-center justify-center px-1 py-2 text-center text-sm leading-snug font-bold text-rose-700">{holiday.name}</div>
        ) : (
          <div className="mb-1.5 rounded-lg bg-rose-100 px-2 py-1 text-[11px] leading-tight font-semibold text-rose-700" title={holiday.name}>
            {holiday.name}
          </div>
        ))}
      {children}
    </li>
  );
}

/** Kaydetme göstergesi */
export function useSaveState() {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const run = async (fn: () => Promise<void>) => {
    setState('saving');
    try {
      await fn();
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    } catch {
      setState('idle');
    }
  };
  return [state, run] as const;
}

export function SaveMark({ state }: { state: 'idle' | 'saving' | 'saved' }) {
  return (
    <span className="flex size-4 items-center justify-center text-slate-400">
      {state === 'saving' && <Loader2 className="size-3.5 animate-spin" />}
      {state === 'saved' && <Check className="size-3.5 text-emerald-600" />}
    </span>
  );
}

export const fieldClass =
  'h-9 w-full min-w-0 rounded-xl border-0 bg-surface px-2.5 text-[13px] font-medium text-ink ring-1 ring-slate-200 transition placeholder:text-slate-300 hover:ring-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-transparent disabled:ring-transparent';

/* ---------- Nöbetçi müdür yardımcısı ---------- */

export interface DutySupervisor {
  id: string;
  date: string;
  name: string;
}

function SupervisorCell({
  day,
  isToday,
  current,
  editable,
  holiday,
  onSave,
}: {
  day: DayInfo;
  isToday: boolean;
  current: DutySupervisor | undefined;
  editable: boolean;
  holiday?: Holiday;
  onSave: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(current?.name ?? '');
  const [state, run] = useSaveState();
  useEffect(() => setValue(current?.name ?? ''), [current?.name]);
  const commit = () => {
    const name = value.trim();
    if (name === (current?.name ?? '') || name.length === 1) return;
    void run(() =>
      onSave(name).catch((e: unknown) => {
        setValue(current?.name ?? '');
        throw e;
      }),
    );
  };
  return (
    <DayShell day={day} isToday={isToday} tone="teal" holiday={holiday}>
      <div className="relative">
        <input
          value={value}
          disabled={!editable}
          list="duty-supervisor-names"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder={editable ? 'Müdür yardımcısı' : '—'}
          aria-label={`${day.iso} nöbetçi müdür yardımcısı`}
          className={clsx(fieldClass, 'pr-7')}
        />
        <span className="absolute top-1/2 right-2 -translate-y-1/2">
          <SaveMark state={state} />
        </span>
      </div>
    </DayShell>
  );
}

/**
 * Nöbetçi müdür yardımcısı takvimi: isim yazılıp çıkılınca kaydedilir, silinince kayıt kalkar.
 * Nöbet çizelgesi Excel'indeki "Tarih / Nöbetçi Müdür Yard." bölümüyle aynı veridir.
 */
export function SupervisorCalendar({ month, editable }: { month: string; editable: boolean }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('duty-supervisors');
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: [schoolId, 'duty-supervisors', month],
    queryFn: () => api<DutySupervisor[]>(`${path}?month=${month}`),
    enabled: Boolean(schoolId),
  });
  const byDate = new Map((list.data ?? []).map((x) => [x.date, x]));
  const names = [...new Set((list.data ?? []).map((x) => x.name))];
  const holidays = useHolidays(month);

  const save = async (iso: string, name: string) => {
    const current = byDate.get(iso);
    try {
      if (!name && current) await api(`${path}/${current.id}`, { method: 'DELETE' });
      else if (current) await api(`${path}/${current.id}`, { method: 'PUT', body: { date: iso, name } });
      else if (name) await api(path, { method: 'POST', body: { date: iso, name } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'duty-supervisors'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi');
      throw err;
    }
  };

  if (list.isLoading) {
    return (
      <div className="flex justify-center p-10 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  return (
    <>
      <datalist id="duty-supervisor-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <MonthGrid month={month}>
        {(d, isToday) => (
          <SupervisorCell
            key={d.iso}
            day={d}
            isToday={isToday}
            current={byDate.get(d.iso)}
            editable={editable}
            holiday={holidays.get(d.iso)}
            onSave={(n) => save(d.iso, n)}
          />
        )}
      </MonthGrid>
    </>
  );
}

export const filledCount = (month: string, dates: Iterable<string>) => {
  const set = new Set(dates);
  return schoolDays(month).filter((d) => set.has(d.iso)).length;
};


/** İki adımlı "bu ayı temizle" düğmesi: önce sorar, sonra siler */
export function ClearMonthButton({ month, what, onConfirm }: { month: string; what: string; onConfirm: () => Promise<unknown> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => setAsking(false), [month]);
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-700 hover:ring-red-200"
      >
        <Eraser className="size-3.5" /> Bu ayı temizle
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 p-1 pl-3 text-xs text-red-700 ring-1 ring-red-200">
      {monthLabel(month)} {what} silinsin mi?
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
            setAsking(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Silinemedi');
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {busy ? 'Siliniyor…' : 'Evet, temizle'}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-2 py-1 font-semibold hover:bg-red-100">
        Vazgeç
      </button>
    </span>
  );
}

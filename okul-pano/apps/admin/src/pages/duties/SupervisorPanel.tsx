import { WEEKDAY_NAMES, WEEKDAY_SHORT } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Loader2, UserCog } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Card, IconButton } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

export interface DutySupervisor {
  id: string;
  date: string;
  name: string;
}

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

/** Ayın nöbet tutulan günleri: hafta içi, ayrıca nöbeti olan hafta sonu günleri */
function schoolDays(month: string, weekdays: Set<number>) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(y, m - 1, i + 1);
    return { iso: `${month}-${pad(i + 1)}`, day: i + 1, weekday: ((date.getDay() + 6) % 7) + 1 };
  }).filter((d) => weekdays.has(d.weekday));
}

function Row({
  date,
  current,
  editable,
  isToday,
  onSave,
}: {
  date: { iso: string; day: number; weekday: number };
  current: DutySupervisor | undefined;
  editable: boolean;
  isToday: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(current?.name ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  useEffect(() => setValue(current?.name ?? ''), [current?.name]);

  const commit = async () => {
    const name = value.trim();
    if (name === (current?.name ?? '')) return;
    if (name.length === 1) return;
    setState('saving');
    try {
      await onSave(name);
      setState('saved');
      setTimeout(() => setState('idle'), 1500);
    } catch {
      setState('idle');
      setValue(current?.name ?? '');
    }
  };

  return (
    <li
      className={clsx(
        'relative flex items-center gap-3 rounded-xl px-3 py-1.5 lg:flex-col lg:items-stretch lg:gap-0.5 lg:py-2',
        isToday && 'bg-teal-50 ring-1 ring-teal-200',
      )}
    >
      <span className="w-[4.5rem] shrink-0 text-sm tabular-nums lg:w-auto lg:px-2.5">
        <span className="font-semibold text-slate-900">{date.day}</span>{' '}
        <span className={clsx('text-xs font-medium lg:hidden', isToday ? 'text-teal-700' : 'text-slate-500')}>{WEEKDAY_SHORT[date.weekday]}</span>
        {isToday && <span className="ml-1 hidden text-[11px] font-semibold text-teal-700 lg:inline">Bugün</span>}
      </span>
      <input
        value={value}
        disabled={!editable}
        list="duty-supervisor-names"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder={editable ? 'İsim yazın' : '—'}
        aria-label={`${date.iso} nöbetçi müdür yardımcısı`}
        className="h-9 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2.5 text-sm font-medium text-slate-900 ring-1 ring-transparent transition placeholder:text-slate-300 hover:ring-slate-200 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:hover:ring-transparent"
      />
      <span className="flex w-4 justify-center text-slate-400 lg:absolute lg:top-2.5 lg:right-3">
        {state === 'saving' && <Loader2 className="size-4 animate-spin" />}
        {state === 'saved' && <Check className="size-4 text-emerald-600" />}
      </span>
    </li>
  );
}

/**
 * Nöbetçi müdür yardımcısı tarihe bağlıdır: ay ay listelenir, isim yazılıp çıkılınca kaydedilir,
 * silinince kayıt kalkar. Pano o günün ismini nöbetçi öğretmenler kartının altında gösterir.
 */
export function SupervisorPanel({
  month,
  onMonth,
  editable,
  weekdays,
}: {
  month: string;
  onMonth: (m: string) => void;
  editable: boolean;
  weekdays: Set<number>;
}) {
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
  const days = schoolDays(month, weekdays);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const filled = days.filter((d) => byDate.has(d.iso)).length;
  const columns = [...weekdays].sort();
  const lead = days[0] ? columns.indexOf(days[0].weekday) : 0;

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

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-teal-50/80 to-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-teal-600 text-white">
            <UserCog className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Nöbetçi Müdür Yardımcısı</h2>
            <p className="text-xs text-slate-500">
              {filled} / {days.length} gün dolu · Excel'deki "Tarih / Nöbetçi Müdür Yard." bölümüyle aynı
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
          <IconButton label="Önceki ay" onClick={() => onMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <span className="w-28 text-center text-sm font-semibold text-slate-800">{monthLabel(month)}</span>
          <IconButton label="Sonraki ay" onClick={() => onMonth(shiftMonth(month, 1))}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      </header>
      <datalist id="duty-supervisor-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {list.isLoading ? (
        <div className="flex justify-center p-8 text-slate-400">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="p-3">
          {/* Geniş ekranda takvim: her satır bir hafta, her sütun bir gün */}
          <div className="hidden gap-x-3 px-3 pb-1 lg:grid" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((d) => (
              <span key={d} className="pl-2.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                {WEEKDAY_NAMES[d]}
              </span>
            ))}
          </div>
          <ol className="grid gap-x-3 lg:[grid-template-columns:var(--cols)]" style={{ '--cols': `repeat(${columns.length}, minmax(0, 1fr))` } as CSSProperties}>
            {Array.from({ length: lead }, (_, i) => (
              <li key={`b${i}`} className="hidden lg:block" aria-hidden="true" />
            ))}
            {days.map((d) => (
              <Row
                key={d.iso}
                date={d}
                current={byDate.get(d.iso)}
                editable={editable}
                isToday={d.iso === todayIso}
                onSave={(name) => save(d.iso, name)}
              />
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

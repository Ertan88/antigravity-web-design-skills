import { WEEKDAY_NAMES, WEEKDAY_SHORT } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Loader2, UserCog, Wand2 } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Button, Card, IconButton } from '../../components/ui.tsx';
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

type DayInfo = { iso: string; day: number; weekday: number };
type TransportDay = { date: string; teachers: { id: string; fullName: string }[] };
type TeacherOption = { id: string; fullName: string };

/** Kaydetme göstergesi */
function useSaveState() {
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

function SaveMark({ state }: { state: 'idle' | 'saving' | 'saved' }) {
  return (
    <span className="flex size-4 items-center justify-center text-slate-400">
      {state === 'saving' && <Loader2 className="size-3.5 animate-spin" />}
      {state === 'saved' && <Check className="size-3.5 text-emerald-600" />}
    </span>
  );
}

const fieldClass =
  'h-8 w-full min-w-0 rounded-lg border-0 bg-white px-2 text-[13px] font-medium text-slate-900 ring-1 ring-slate-200 transition placeholder:text-slate-300 hover:ring-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-transparent disabled:ring-transparent';

function DayCell({
  date,
  supervisor,
  transport,
  editable,
  isToday,
  dutyTeachers,
  otherTeachers,
  slots,
  onSaveSupervisor,
  onSaveTransport,
}: {
  date: DayInfo;
  supervisor: DutySupervisor | undefined;
  transport: TeacherOption[];
  editable: boolean;
  isToday: boolean;
  /** O günün nöbetçileri (önce önerilir) */
  dutyTeachers: TeacherOption[];
  otherTeachers: TeacherOption[];
  slots: number;
  onSaveSupervisor: (name: string) => Promise<void>;
  onSaveTransport: (ids: string[]) => Promise<void>;
}) {
  const [value, setValue] = useState(supervisor?.name ?? '');
  const [supState, runSup] = useSaveState();
  const [trState, runTr] = useSaveState();
  useEffect(() => setValue(supervisor?.name ?? ''), [supervisor?.name]);

  const commit = () => {
    const name = value.trim();
    if (name === (supervisor?.name ?? '') || name.length === 1) return;
    void runSup(() => onSaveSupervisor(name).catch((e) => (setValue(supervisor?.name ?? ''), Promise.reject(e))));
  };
  const ids = transport.map((t) => t.id);
  const setSlot = (i: number, id: string) => {
    const next = [...ids];
    next[i] = id;
    void runTr(() => onSaveTransport(next.filter(Boolean)));
  };
  const known = new Set([...dutyTeachers, ...otherTeachers].map((t) => t.id));

  return (
    <li className={clsx('rounded-xl p-2.5 ring-1', isToday ? 'bg-teal-50/70 ring-teal-300' : 'bg-slate-50/60 ring-slate-200/80')}>
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-sm">
        <span className="font-bold text-slate-900 tabular-nums">{date.day}</span>
        <span className={clsx('text-xs font-medium', isToday ? 'text-teal-700' : 'text-slate-500')}>
          {isToday ? 'Bugün' : WEEKDAY_SHORT[date.weekday]}
        </span>
      </div>

      <div className="mb-0.5 flex items-center justify-between px-0.5 text-[10px] font-bold tracking-wider text-teal-700 uppercase">
        Md. Yrd. <SaveMark state={supState} />
      </div>
      <input
        value={value}
        disabled={!editable}
        list="duty-supervisor-names"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder={editable ? 'İsim yazın' : '—'}
        aria-label={`${date.iso} nöbetçi müdür yardımcısı`}
        className={fieldClass}
      />

      <div className="mt-2 mb-0.5 flex items-center justify-between px-0.5 text-[10px] font-bold tracking-wider text-amber-700 uppercase">
        Taşımalı <SaveMark state={trState} />
      </div>
      <div className="space-y-1">
        {Array.from({ length: Math.max(slots, ids.length) }, (_, i) => (
          <select
            key={i}
            value={ids[i] ?? ''}
            disabled={!editable || (i > ids.length)}
            onChange={(e) => setSlot(i, e.target.value)}
            aria-label={`${date.iso} taşımalı öğrenci görevlisi ${i + 1}`}
            className={clsx(fieldClass, !ids[i] && 'text-slate-400')}
          >
            <option value="">{i === 0 ? 'Görevli seçin' : '—'}</option>
            {ids[i] && !known.has(ids[i]) && <option value={ids[i]}>{transport[i]?.fullName}</option>}
            {dutyTeachers.length > 0 && (
              <optgroup label="O günün nöbetçileri">
                {dutyTeachers.map((t) => (
                  <option key={t.id} value={t.id} disabled={ids.includes(t.id) && ids[i] !== t.id}>
                    {t.fullName}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Diğer öğretmenler">
              {otherTeachers.map((t) => (
                <option key={t.id} value={t.id} disabled={ids.includes(t.id) && ids[i] !== t.id}>
                  {t.fullName}
                </option>
              ))}
            </optgroup>
          </select>
        ))}
      </div>
    </li>
  );
}

/**
 * Günlük görevliler takvimi: her gün için nöbetçi müdür yardımcısı ve taşımalı öğrenci görevlileri
 * (servisten indirme, öğle yemeği, servise bindirme). Taşımalı görevliler o günün nöbetçileri
 * arasından seçilir; "Otomatik dağıt" görevleri nöbetçiler arasında eşit paylaştırır.
 * Pano bugünün ikisini de nöbetçi öğretmenler kartının altında gösterir.
 */
export function DailyDutyPanel({
  month,
  onMonth,
  editable,
  weekdays,
  teachers,
  duties,
}: {
  month: string;
  onMonth: (m: string) => void;
  editable: boolean;
  weekdays: Set<number>;
  teachers: { id: string; fullName: string; isActive: boolean }[];
  duties: { weekday: number; teacherId: string; sortOrder: number }[];
}) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('duty-supervisors');
  const transportPath = useSchoolPath('transport-duties');
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: [schoolId, 'duty-supervisors', month],
    queryFn: () => api<DutySupervisor[]>(`${path}?month=${month}`),
    enabled: Boolean(schoolId),
  });
  const transport = useQuery({
    queryKey: [schoolId, 'transport-duties', month],
    queryFn: () => api<TransportDay[]>(`${transportPath}?month=${month}`),
    enabled: Boolean(schoolId),
  });
  const [auto, setAuto] = useState(false);
  const byDate = new Map((list.data ?? []).map((x) => [x.date, x]));
  const transportByDate = new Map((transport.data ?? []).map((x) => [x.date, x.teachers]));
  const names = [...new Set((list.data ?? []).map((x) => x.name))];
  const days = schoolDays(month, weekdays);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const filled = days.filter((d) => byDate.has(d.iso)).length;
  const transportFilled = days.filter((d) => transportByDate.get(d.iso)?.length).length;
  const columns = [...weekdays].sort();
  const lead = days[0] ? columns.indexOf(days[0].weekday) : 0;

  const active = teachers.filter((t) => t.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
  const byId = new Map(teachers.map((t) => [t.id, t]));
  const dutyByWeekday = new Map<number, TeacherOption[]>();
  for (const d of [...duties].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const t = byId.get(d.teacherId);
    const list = dutyByWeekday.get(d.weekday) ?? [];
    if (t && !list.some((x) => x.id === t.id)) list.push(t);
    dutyByWeekday.set(d.weekday, list);
  }

  const saveSupervisor = async (iso: string, name: string) => {
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
  const saveTransport = async (iso: string, teacherIds: string[]) => {
    try {
      await api(`${transportPath}/${iso}`, { method: 'PUT', body: { teacherIds } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'transport-duties'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi');
      throw err;
    }
  };
  const autoFill = async (overwrite: boolean) => {
    if (overwrite && !window.confirm(`${monthLabel(month)} ayının tüm taşımalı görevlendirmeleri silinip yeniden dağıtılacak. Devam edilsin mi?`)) return;
    setAuto(true);
    try {
      const res = await api<{ days: number; skipped: number }>(`${transportPath}/auto`, { method: 'POST', body: { month, perDay: 2, overwrite } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'transport-duties'] });
      toast.success(
        res.days
          ? `${res.days} güne taşımalı görevli atandı${res.skipped ? ` · ${res.skipped} günde uygun nöbetçi yok` : ''}`
          : 'Doldurulacak boş gün yok',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dağıtılamadı');
    } finally {
      setAuto(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-teal-50/80 via-white to-amber-50/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-teal-600 text-white">
            <UserCog className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Günlük Görevliler</h2>
            <p className="text-xs text-slate-500">
              Nöbetçi müdür yardımcısı {filled}/{days.length} gün · Taşımalı öğrenci görevlisi {transportFilled}/{days.length} gün
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <Button size="sm" variant="secondary" icon={<Wand2 className="size-3.5" />} loading={auto} onClick={() => void autoFill(false)}>
                Taşımalıyı otomatik dağıt
              </Button>
              <button
                type="button"
                onClick={() => void autoFill(true)}
                className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                Baştan dağıt
              </button>
            </>
          )}
          <div className="flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
            <IconButton label="Önceki ay" onClick={() => onMonth(shiftMonth(month, -1))}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <span className="w-28 text-center text-sm font-semibold text-slate-800">{monthLabel(month)}</span>
            <IconButton label="Sonraki ay" onClick={() => onMonth(shiftMonth(month, 1))}>
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        </div>
      </header>
      <p className="border-b border-slate-100 bg-amber-50/40 px-5 py-2.5 text-xs text-slate-600">
        <span className="font-semibold text-amber-800">Taşımalı öğrenci görevlisi:</span> sabah servisten inen öğrencileri okula
        alır, öğle yemeği dağıtımını kontrol eder, akşam öğrencileri servise bindirir. Listede önce o günün nöbetçileri gelir;
        otomatik dağıtım izinli öğretmenleri atlar ve görevleri eşit paylaştırır.
      </p>
      <datalist id="duty-supervisor-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {list.isLoading || transport.isLoading ? (
        <div className="flex justify-center p-8 text-slate-400">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="p-3 sm:p-4">
          {/* Geniş ekranda takvim: her satır bir hafta, her sütun bir gün */}
          <div className="hidden gap-2 pb-1.5 lg:grid" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((d) => (
              <span key={d} className="px-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                {WEEKDAY_NAMES[d]}
              </span>
            ))}
          </div>
          <ol
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-2 lg:[grid-template-columns:var(--cols)]"
            style={{ '--cols': `repeat(${columns.length}, minmax(0, 1fr))` } as CSSProperties}
          >
            {Array.from({ length: lead }, (_, i) => (
              <li key={`b${i}`} className="hidden lg:block" aria-hidden="true" />
            ))}
            {days.map((d) => {
              const dutyTeachers = dutyByWeekday.get(d.weekday) ?? [];
              return (
                <DayCell
                  key={d.iso}
                  date={d}
                  supervisor={byDate.get(d.iso)}
                  transport={transportByDate.get(d.iso) ?? []}
                  editable={editable}
                  isToday={d.iso === todayIso}
                  dutyTeachers={dutyTeachers}
                  otherTeachers={active.filter((t) => !dutyTeachers.some((x) => x.id === t.id))}
                  slots={2}
                  onSaveSupervisor={(name) => saveSupervisor(d.iso, name)}
                  onSaveTransport={(ids) => saveTransport(d.iso, ids)}
                />
              );
            })}
          </ol>
        </div>
      )}
    </Card>
  );
}

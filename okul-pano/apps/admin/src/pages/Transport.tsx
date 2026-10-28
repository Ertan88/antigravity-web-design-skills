import { holidayFullName, isHalfDayHoliday } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bus, Sunrise, Sunset, Utensils, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { ExcelImportDialog, NewTeachersOption, type ImportPreview } from '../components/ExcelImportDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchool, useSchoolPath, type Duty, type Teacher } from '../lib/data.ts';
import {
  ClearMonthButton,
  DayShell,
  fieldClass,
  filledCount,
  MonthGrid,
  monthLabel,
  SaveMark,
  useHolidays,
  useSaveState,
  type DayInfo,
  type Holiday,
} from './duties/calendar.tsx';
import { MonthChoice, type MonthResolution } from './duties/MonthChoice.tsx';
import { TransportSwitch } from './duties/TransportToggle.tsx';
import { AutoFillDialog, BalanceCard, useTransportStats } from './transport/Balance.tsx';

type TeacherOption = { id: string; fullName: string };
type TransportDay = { date: string; teachers: TeacherOption[] };

const SLOTS = 2;

function TransportCell({
  day,
  isToday,
  assigned,
  editable,
  dutyTeachers,
  otherTeachers,
  counts,
  holiday,
  onSave,
}: {
  day: DayInfo;
  isToday: boolean;
  assigned: TeacherOption[];
  editable: boolean;
  /** O günün nöbetçileri; listede önce bunlar gelir */
  dutyTeachers: TeacherOption[];
  otherTeachers: TeacherOption[];
  /** Eğitim yılında tutulan servis nöbeti sayısı: adil dağıtım için listede adın yanında */
  counts: Map<string, number>;
  holiday?: Holiday;
  onSave: (ids: string[]) => Promise<void>;
}) {
  const [state, run] = useSaveState();
  const ids = assigned.map((t) => t.id);
  const known = new Set([...dutyTeachers, ...otherTeachers].map((t) => t.id));
  const setSlot = (i: number, id: string) => {
    const next = [...ids];
    next[i] = id;
    void run(() => onSave(next.filter(Boolean)));
  };
  // Resmî / dini tatilde görevli olmaz: kartın ortasında yalnızca tatilin tam adı (arife yarım gün, normal gün)
  if (holiday && !isHalfDayHoliday(holiday.name)) {
    return <DayShell day={day} isToday={isToday} tone="amber" holiday={holiday} holidayCentered>{null}</DayShell>;
  }
  return (
    <DayShell day={day} isToday={isToday} tone="amber" aside={<SaveMark state={state} />} holiday={holiday}>
      <div className="space-y-1">
        {Array.from({ length: Math.max(SLOTS, ids.length) }, (_, i) => (
          <select
            key={i}
            value={ids[i] ?? ''}
            disabled={!editable || i > ids.length}
            onChange={(e) => setSlot(i, e.target.value)}
            aria-label={`${day.iso} servis nöbetçisi ${i + 1}`}
            className={clsx(fieldClass, !ids[i] && 'text-slate-400')}
          >
            <option value="">{i === 0 ? 'Görevli seçin' : i > ids.length ? '—' : '2. görevli'}</option>
            {ids[i] && !known.has(ids[i]) && <option value={ids[i]}>{assigned[i]?.fullName}</option>}
            {dutyTeachers.length > 0 && (
              <optgroup label="O günün nöbetçileri">
                {dutyTeachers.map((t) => (
                  <option key={t.id} value={t.id} disabled={ids.includes(t.id) && ids[i] !== t.id}>
                    {t.fullName} · {counts.get(t.id) ?? 0}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Diğer öğretmenler · yıl içinde en az tutan üstte">
              {otherTeachers.map((t) => (
                <option key={t.id} value={t.id} disabled={ids.includes(t.id) && ids[i] !== t.id}>
                  {t.fullName} · {counts.get(t.id) ?? 0}
                </option>
              ))}
            </optgroup>
          </select>
        ))}
      </div>
    </DayShell>
  );
}

type ImportRow = {
  date: string;
  from: string | null;
  day: string;
  teachers: (TeacherOption & { written: string })[];
  /** Kadroda olmayan, kaydederken kadroya eklenebilecek öğretmenler (position: dosyadaki sırası) */
  newTeachers: { name: string; position: number }[];
  cleared: boolean;
  holiday: string | null;
  /** Dosyada yoktu: ayın listesi dosyadan ibaret olduğu için silinecek */
  missing?: boolean;
};
type Preview = ImportPreview<ImportRow> & { month: MonthResolution; holidays: { date: string; name: string }[]; newTeachers: string[] };
type ImportOptions = { month: string | null; addTeachers: boolean };
/** Yalnızca kadroya eklenmeyecek öğretmenleri olan gün atlanır (günü boşaltmamak için) */
const transportRowSkipped = (r: ImportRow, o: ImportOptions) => !o.addTeachers && !r.teachers.length && r.newTeachers.length > 0;
const transportDaysToSave = (p: Preview, o: ImportOptions) => p.rows.filter((r) => r.status !== 'unchanged' && !transportRowSkipped(r, o));

const trDate = (iso: string) => iso.split('-').reverse().join('.');

export function TransportImport({ file, onClose, onSaved }: { file: File | null; onClose: () => void; onSaved: (month: string) => void }) {
  const basePath = useSchoolPath('transport-duties');
  return (
    <ExcelImportDialog<ImportRow, Preview, ImportOptions>
      file={file}
      onClose={onClose}
      basePath={basePath}
      invalidate={['transport-duties', 'holidays', 'teachers']}
      initialOptions={{ month: null, addTeachers: true }}
      rowStatus={(r, o) => (transportRowSkipped(r, o) ? 'skip' : r.status)}
      previewQuery={(o) => (o.month ? `?month=${o.month}` : '')}
      renderOptions={(p, o, set) => (
        <div className="space-y-3">
          <MonthChoice resolution={p.month} onChoose={(month) => set({ ...o, month })} movedCount={p.rows.filter((r) => r.from).length} />
          <NewTeachersOption names={p.newTeachers} checked={o.addTeachers} onChange={(addTeachers) => set({ ...o, addTeachers })} />
        </div>
      )}
      renderExtra={(p) =>
        p.holidays.length > 0 && (
          <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-100">
            <div className="font-semibold">Tatil olarak tanınanlar</div>
            <ul className="mt-1.5 space-y-0.5">
              {p.holidays.map((h) => (
                <li key={h.date}>
                  <span className="tabular-nums">{trDate(h.date)}</span> · {holidayFullName(h.date, h.name)}
                </li>
              ))}
            </ul>
          </div>
        )
      }
      columns={[
        {
          header: 'Tarih',
          cell: (r) => (
            <span className="tabular-nums">
              {trDate(r.date)}
              {r.from && <span className="ml-1.5 text-xs text-slate-400 line-through">{trDate(r.from)}</span>}
            </span>
          ),
        },
        { header: 'Gün', cell: (r) => r.day },
        {
          header: 'Görevliler',
          cell: (r) =>
            r.holiday ? (
              <span className="font-medium text-rose-600">
                {holidayFullName(r.date, r.holiday)}
                {r.cleared && r.status !== 'unchanged' && <span className="ml-2 text-xs font-normal text-slate-400">· kayıtlı görevli silinecek</span>}
              </span>
            ) : r.missing ? (
              <span className="text-slate-400">Dosyada yok · kayıtlı görevli silinecek</span>
            ) : r.cleared ? (
              <span className="text-slate-400">Görevlendirme kaldırılacak</span>
            ) : (
              <span className="font-medium text-ink">
                {r.teachers.map((t) => (
                  <span key={t.id} className="mr-3 inline-block" title={t.written !== t.fullName ? `Dosyada: ${t.written}` : undefined}>
                    {t.fullName}
                    {t.written.toLocaleLowerCase('tr-TR') !== t.fullName.toLocaleLowerCase('tr-TR') && <span className="ml-1 text-[11px] text-slate-400">({t.written})</span>}
                  </span>
                ))}
                {r.newTeachers.map((n) => (
                  <span key={n.name} className="mr-3 inline-flex items-center gap-1.5">
                    {n.name} <Badge tone="blue">kadroda yok</Badge>
                  </span>
                ))}
              </span>
            ),
        },
      ]}
      stats={(p, o) => {
        const save = transportDaysToSave(p, o);
        const skipped = p.totals.skipped + p.rows.filter((r) => transportRowSkipped(r, o)).length;
        return [
          { label: 'Yeni gün', value: save.filter((r) => r.status === 'new').length, tone: 'green' },
          { label: 'Güncellenecek', value: save.filter((r) => r.status === 'update').length, tone: 'blue' },
          { label: 'Değişiklik yok', value: p.totals.unchanged, tone: 'slate' },
          { label: 'Atlanacak', value: skipped, tone: skipped ? 'amber' : 'slate' },
        ];
      }}
      commitCount={(p, o) => transportDaysToSave(p, o).length + p.holidays.length}
      commitLabel={() => 'Çizelgeyi kaydet'}
      commitBody={(p, o) => ({
        days: transportDaysToSave(p, o).map((r) => ({
          date: r.date,
          teacherIds: r.teachers.map((t) => t.id),
          newTeachers: o.addTeachers ? r.newTeachers : [],
        })),
        holidays: p.holidays,
      })}
      successMessage={(res: { days: number; teachersAdded: number }, p) => {
        onSaved(p.month.month);
        return `${monthLabel(p.month.month)} servis nöbet çizelgesi kaydedildi: ${res.days} gün` + (res.teachersAdded ? ` · kadroya ${res.teachersAdded} öğretmen eklendi` : '');
      }}
    />
  );
}

/** Ayın dolu gün sayısı için (Nöbet Çizelgesi sekmesinde de kullanılır) */
export function useTransportMonth(month: string) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('transport-duties');
  const school = useSchool();
  return useQuery({
    queryKey: [schoolId, 'transport-duties', month],
    queryFn: () => api<TransportDay[]>(`${path}?month=${month}`),
    enabled: Boolean(schoolId) && Boolean(school.data?.settings.hasTransport),
  });
}

const SHIFTS = [
  { icon: Sunrise, title: 'Sabah', text: 'servisten inenleri karşılar' },
  { icon: Utensils, title: 'Öğle', text: 'yemeği kontrol eder' },
  { icon: Sunset, title: 'Akşam', text: 'servise bindirir' },
];

/**
 * Taşımalı eğitim (Nöbet Çizelgesi'nin sekmesi): servisle gelen öğrencileri sabah karşılayan, öğle yemeğini
 * kontrol eden ve akşam servise bindiren görevli öğretmenler. Modül bu sekmeden açılıp kapanır.
 */
export function TransportView({ month }: { month: string }) {
  const { can, schoolId } = useAuth();
  const editable = can('duties.manage');
  const school = useSchool();
  const path = useSchoolPath('transport-duties');
  const qc = useQueryClient();
  const toast = useToast();
  const teachers = useList<Teacher>('teachers');
  const duties = useList<Duty>('duties');
  const holidays = useHolidays(month);
  const stats = useTransportStats(month);
  const [autoFill, setAutoFill] = useState(false);
  const list = useTransportMonth(month);

  if (school.isLoading) return <Spinner />;
  if (!school.data?.settings.hasTransport) {
    return (
      <Card>
        <EmptyState
          icon={<Bus className="size-6" />}
          title="Okulunuzda taşımalı eğitim var mı?"
          description="Açarsanız servisle gelen öğrenciler için sabah, öğle ve akşam görevlilerini gün gün belirlersiniz; görevliler panoda o günün nöbet kartında görünür."
          action={can('settings.manage') ? <TransportSwitch label="Taşımalı eğitimi aç" /> : undefined}
        />
      </Card>
    );
  }

  const byDate = new Map((list.data ?? []).map((d) => [d.date, d.teachers]));
  const active = (teachers.data ?? []).filter((t) => t.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
  const byId = new Map((teachers.data ?? []).map((t) => [t.id, t]));
  const counts = new Map((stats.data?.teachers ?? []).map((t) => [t.id, t.total]));
  const byCount = [...active].sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) || a.fullName.localeCompare(b.fullName, 'tr'));
  const dutyByWeekday = new Map<number, TeacherOption[]>();
  for (const d of [...(duties.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const t = byId.get(d.teacherId);
    const l = dutyByWeekday.get(d.weekday) ?? [];
    if (t && !l.some((x) => x.id === t.id)) l.push(t);
    dutyByWeekday.set(d.weekday, l);
  }

  const save = async (iso: string, teacherIds: string[]) => {
    try {
      await api(`${path}/${iso}`, { method: 'PUT', body: { teacherIds } });
      await qc.invalidateQueries({ queryKey: [schoolId, 'transport-duties'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kaydedilemedi');
      throw err;
    }
  };

  return (
    <>
      {!editable && (
        <div className="mb-4">
          <Alert tone="blue">Bu bölümü görüntüleyebilirsiniz; değişiklik yapma yetkiniz yok.</Alert>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/70 bg-amber-50/60 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
              <Bus className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">{monthLabel(month)} · Servis nöbetçileri</h2>
              <p className="text-xs text-slate-500">
                {filledCount(month, byDate.keys())} gün dolu · listede önce o günün nöbetçileri, sonra yıl içinde en az nöbet tutanlar gelir
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SHIFTS.map((x) => (
              <span key={x.title} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
                <x.icon className="size-3.5 text-amber-600" />
                <strong className="font-semibold">{x.title}</strong> {x.text}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can('settings.manage') && <TransportSwitch label="Açık" compact />}
            {editable && (
              <Button size="sm" variant="secondary" icon={<Wand2 className="size-4" />} onClick={() => setAutoFill(true)}>
                Adil dağıt
              </Button>
            )}
            {editable && byDate.size > 0 && (
              <ClearMonthButton
                month={month}
                what="servis nöbetleri"
                onConfirm={async () => {
                  const res = await api<{ removed: number }>(`${path}/clear`, { method: 'POST', body: { month } });
                  await qc.invalidateQueries({ queryKey: [schoolId, 'transport-duties'] });
                  toast.success(`${res.removed} kayıt silindi`);
                }}
              />
            )}
          </div>
        </div>
        {list.isLoading ? (
          <Spinner />
        ) : (
          <MonthGrid month={month}>
            {(d, isToday) => {
              const dutyTeachers = dutyByWeekday.get(d.weekday) ?? [];
              return (
                <TransportCell
                  key={d.iso}
                  day={d}
                  isToday={isToday}
                  assigned={byDate.get(d.iso) ?? []}
                  editable={editable}
                  dutyTeachers={dutyTeachers}
                  otherTeachers={byCount.filter((t) => !dutyTeachers.some((x) => x.id === t.id))}
                  counts={counts}
                  holiday={holidays.get(d.iso)}
                  onSave={(ids) => save(d.iso, ids)}
                />
              );
            }}
          </MonthGrid>
        )}
      </Card>
      <BalanceCard month={month} stats={stats.data} />
      <AutoFillDialog
        open={autoFill}
        onClose={() => setAutoFill(false)}
        month={month}
        stats={stats.data}
        teachers={active}
        assigned={new Map([...byDate].map(([d, l]) => [d, l.length]))}
        holidays={holidays}
      />
    </>
  );
}

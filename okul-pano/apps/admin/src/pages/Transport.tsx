import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bus, Settings2, Sunrise, Sunset, Utensils } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExcelButtons } from '../components/ExcelButtons.tsx';
import { ExcelImportDialog, type ImportPreview } from '../components/ExcelImportDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useSchool, useSchoolPath, type Duty, type Teacher } from '../lib/data.ts';
import {
  ClearMonthButton,
  currentMonth,
  DayShell,
  fieldClass,
  filledCount,
  MonthGrid,
  MonthNav,
  monthLabel,
  SaveMark,
  useHolidays,
  useSaveState,
  type DayInfo,
  type Holiday,
} from './duties/calendar.tsx';
import { MonthChoice, type MonthResolution } from './duties/MonthChoice.tsx';

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
    </DayShell>
  );
}

type ImportRow = {
  date: string;
  from: string | null;
  day: string;
  teachers: (TeacherOption & { written: string })[];
  cleared: boolean;
  holiday: string | null;
};
type Preview = ImportPreview<ImportRow> & { month: MonthResolution; holidays: { date: string; name: string }[] };

const trDate = (iso: string) => iso.split('-').reverse().join('.');

function TransportImport({ file, onClose, onSaved }: { file: File | null; onClose: () => void; onSaved: (month: string) => void }) {
  const basePath = useSchoolPath('transport-duties');
  return (
    <ExcelImportDialog<ImportRow, Preview, { month: string | null }>
      file={file}
      onClose={onClose}
      basePath={basePath}
      invalidate={['transport-duties', 'holidays']}
      initialOptions={{ month: null }}
      previewQuery={(o) => (o.month ? `?month=${o.month}` : '')}
      renderOptions={(p, o, set) => (
        <MonthChoice resolution={p.month} onChoose={(month) => set({ ...o, month })} movedCount={p.rows.filter((r) => r.from).length} />
      )}
      renderExtra={(p) =>
        p.holidays.length > 0 && (
          <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-100">
            <div className="font-semibold">Tatil olarak tanınanlar</div>
            <ul className="mt-1.5 space-y-0.5">
              {p.holidays.map((h) => (
                <li key={h.date}>
                  <span className="tabular-nums">{trDate(h.date)}</span> · {h.name}
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
              <span className="font-medium text-rose-600">{r.holiday}</span>
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
              </span>
            ),
        },
      ]}
      stats={(p) => [
        { label: 'Yeni gün', value: p.totals.new, tone: 'green' },
        { label: 'Güncellenecek', value: p.totals.update, tone: 'blue' },
        { label: 'Değişiklik yok', value: p.totals.unchanged, tone: 'slate' },
        { label: 'Atlanacak', value: p.totals.skipped, tone: p.totals.skipped ? 'amber' : 'slate' },
      ]}
      commitCount={(p) => p.totals.new + p.totals.update + p.holidays.length}
      commitLabel={() => 'Çizelgeyi kaydet'}
      commitBody={(p) => ({
        days: p.rows.filter((r) => r.status !== 'unchanged').map((r) => ({ date: r.date, teacherIds: r.teachers.map((t) => t.id) })),
        holidays: p.holidays,
      })}
      successMessage={(res: { days: number }, p) => {
        onSaved(p.month.month);
        return `${monthLabel(p.month.month)} servis nöbet çizelgesi kaydedildi: ${res.days} gün`;
      }}
    />
  );
}

/**
 * Taşımalı eğitim: servisle gelen öğrencileri sabah karşılayan, öğle yemeğini kontrol eden ve
 * akşam servise bindiren görevli öğretmenler. Okul ayarlarında "taşımalı eğitim" açıksa görünür.
 */
export function Transport() {
  const { can, schoolId } = useAuth();
  const editable = can('duties.manage');
  const school = useSchool();
  const path = useSchoolPath('transport-duties');
  const qc = useQueryClient();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth);
  const [file, setFile] = useState<File | null>(null);
  const teachers = useList<Teacher>('teachers');
  const duties = useList<Duty>('duties');
  const holidays = useHolidays(month);
  const list = useQuery({
    queryKey: [schoolId, 'transport-duties', month],
    queryFn: () => api<TransportDay[]>(`${path}?month=${month}`),
    enabled: Boolean(schoolId),
  });

  if (school.isLoading) return <Spinner />;
  if (!school.data?.settings.hasTransport) {
    return (
      <>
        <PageHeader title="Taşımalı Eğitim" />
        <Card>
          <EmptyState
            icon={<Bus className="size-6" />}
            title="Taşımalı eğitim kapalı"
            description="Okulunuzda servisle gelen öğrenciler varsa Okul Ayarları'ndan taşımalı eğitimi açın; bu sayfa ve panodaki görevli bilgisi görünür olur."
            action={
              can('settings.manage') && (
                <Link to="/ayarlar">
                  <Button icon={<Settings2 className="size-4" />}>Okul Ayarları</Button>
                </Link>
              )
            }
          />
        </Card>
      </>
    );
  }

  const byDate = new Map((list.data ?? []).map((d) => [d.date, d.teachers]));
  const active = (teachers.data ?? []).filter((t) => t.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
  const byId = new Map((teachers.data ?? []).map((t) => [t.id, t]));
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
      <PageHeader
        title="Taşımalı Eğitim"
        description="Servisle gelen öğrenciler için her gün görevlendirilen nöbetçi öğretmenler. Okulunuzun aylık servis nöbet çizelgesini Excel'den yükleyin ya da gün gün seçin; pano o günün görevlilerini nöbet kartında gösterir."
        actions={
          <ExcelButtons
            basePath={path}
            module="Servis Nöbet Çizelgesi"
            period={monthLabel(month)}
            canImport={editable}
            onFile={setFile}
            query={`month=${month}`}
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Sunrise, title: 'Sabah', text: 'Servisten inen öğrencileri karşılar, okula alır.' },
          { icon: Utensils, title: 'Öğle', text: 'Yemek dağıtımını ve öğrencileri kontrol eder.' },
          { icon: Sunset, title: 'Akşam', text: 'Öğrencileri servislere bindirip gönderir.' },
        ].map((x) => (
          <div key={x.title} className="flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-900/[0.06]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <x.icon className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">{x.title}</div>
              <div className="text-xs text-slate-500">{x.text}</div>
            </div>
          </div>
        ))}
      </div>

      {!editable && (
        <div className="mb-4">
          <Alert tone="blue">Bu bölümü görüntüleyebilirsiniz; değişiklik yapma yetkiniz yok.</Alert>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-amber-50/80 to-surface px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500 text-white">
              <Bus className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">{monthLabel(month)} · Servis nöbetçileri</h2>
              <p className="text-xs text-slate-500">
                {filledCount(month, byDate.keys())} gün dolu · listede önce o günün nöbetçi öğretmenleri gelir
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <MonthNav month={month} onMonth={setMonth} />
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
                  otherTeachers={active.filter((t) => !dutyTeachers.some((x) => x.id === t.id))}
                  holiday={holidays.get(d.iso)}
                  onSave={(ids) => save(d.iso, ids)}
                />
              );
            }}
          </MonthGrid>
        )}
      </Card>
      <TransportImport file={file} onClose={() => setFile(null)} onSaved={setMonth} />
    </>
  );
}

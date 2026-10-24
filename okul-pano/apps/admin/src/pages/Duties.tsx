import { dutySchema, WEEKDAY_NAMES, WEEKDAY_SHORT } from '@okulpano/shared';
import clsx from 'clsx';
import { CalendarDays, CopyPlus, ShieldCheck, UserCog } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CrudPage } from '../components/CrudPage.tsx';
import { ExcelButtons } from '../components/ExcelButtons.tsx';
import { ExcelImportDialog, type ImportPreview } from '../components/ExcelImportDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Card, Field, Input, Select } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { nameMap, useList, useSchoolPath, type Duty, type Teacher } from '../lib/data.ts';
import { ClearMonthButton, currentMonth, filledCount, MonthNav, monthLabel, SupervisorCalendar, type DutySupervisor } from './duties/calendar.tsx';
import { MonthChoice, type MonthResolution } from './duties/MonthChoice.tsx';

type Form = { month: string; weekday: number; area: string; teacherId: string; sortOrder: number };

const todayWeekday = () => ((new Date().getDay() + 6) % 7) + 1;
const WEEKDAYS = [1, 2, 3, 4, 5];

/** Gün seçici: her gün bir kart; nöbetçi sayısı ve bugünün işareti */
function DayBar({ value, onChange, counts }: { value: number; onChange: (d: number) => void; counts: Record<number, number> }) {
  const today = todayWeekday();
  const max = Math.max(1, ...WEEKDAYS.map((d) => counts[d] ?? 0));
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="tablist" aria-label="Gün">
      {WEEKDAYS.map((d) => {
        const active = d === value;
        const n = counts[d] ?? 0;
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(d)}
            className={clsx(
              'group relative overflow-hidden rounded-2xl px-2 py-2.5 text-left transition-all sm:px-3.5 sm:py-3',
              active
                ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-[0_10px_24px_-12px_rgba(19,112,143,0.8)]'
                : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200/80 hover:bg-surface hover:ring-brand-200',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold sm:text-sm">
                <span className="sm:hidden">{WEEKDAY_SHORT[d]}</span>
                <span className="hidden sm:inline">{WEEKDAY_NAMES[d]}</span>
              </span>
              {d === today && (
                <span className={clsx('size-1.5 shrink-0 rounded-full', active ? 'bg-surface' : 'bg-emerald-500')} title="Bugün" />
              )}
            </div>
            <div className={clsx('mt-0.5 text-xs tabular-nums', active ? 'text-white/80' : 'text-slate-500')}>
              <span className="sm:hidden">{n || '—'}</span>
              <span className="hidden sm:inline">{n ? `${n} nöbetçi` : 'Nöbet yok'}</span>
            </div>
            <div className={clsx('mt-2 h-1 overflow-hidden rounded-full', active ? 'bg-white/25' : 'bg-slate-200/80')}>
              <div className={clsx('h-full rounded-full', active ? 'bg-surface' : 'bg-brand-400')} style={{ width: `${(n / max) * 100}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

type View = 'duties' | 'supervisor';

function ViewTabs({ view, onView, counts }: { view: View; onView: (v: View) => void; counts: { duties: number; supervisor: string } }) {
  const tabs: { value: View; label: string; hint: string; icon: typeof ShieldCheck }[] = [
    { value: 'duties', label: 'Nöbet yerleri ve öğretmenler', hint: `${counts.duties} nöbet`, icon: ShieldCheck },
    { value: 'supervisor', label: 'Nöbetçi müdür yardımcısı', hint: counts.supervisor, icon: UserCog },
  ];
  return (
    <div className="inline-flex w-full flex-wrap gap-1 rounded-2xl bg-surface p-1 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-slate-200 sm:w-auto">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onView(t.value)}
          className={clsx(
            'flex flex-1 items-center gap-2.5 rounded-xl px-3.5 py-2 text-left transition sm:flex-none',
            view === t.value ? 'bg-slate-900 text-white shadow-sm dark:bg-brand-600' : 'text-slate-600 hover:bg-slate-50',
          )}
        >
          <t.icon className={clsx('size-4 shrink-0', view === t.value ? 'text-brand-300' : 'text-slate-400')} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{t.label}</span>
            <span className={clsx('block text-[11px]', view === t.value ? 'text-white/70' : 'text-slate-400')}>{t.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

type Mode = 'replace' | 'merge';
type DutyRow = { weekday: number; day: string; area: string; teacherName: string; teacherInactive: boolean };
type SupervisorRow = { date: string; name: string; from: string | null; status: 'new' | 'update' | 'unchanged' };
type DutyPreview = ImportPreview<DutyRow> & {
  month: MonthResolution;
  holidays: { date: string; name: string }[];
  undatedHolidays: { name: string; day: string | null }[];
  weekdays: number[];
  supervisors: SupervisorRow[];
  removed: { day: string; area: string; teacherName: string }[];
  additions: { label: string; values: string[] }[];
};

const MODES: { value: Mode; title: string; text: (p: DutyPreview) => string }[] = [
  {
    value: 'replace',
    title: 'Çizelgeyi değiştir',
    text: (p) =>
      `${p.weekdays.map((d) => WEEKDAY_NAMES[d]).join(', ')} günlerinin mevcut nöbetleri dosyadakiyle değişir.` +
      (p.removed.length ? ` Dosyada olmayan ${p.removed.length} nöbet kaldırılır.` : ''),
  },
  { value: 'merge', title: 'Mevcut çizelgeye ekle', text: () => 'Yalnızca dosyadaki yeni nöbetler eklenir; hiçbir nöbet silinmez.' },
];

const trDate = (iso: string) => iso.split('-').reverse().join('.');

/** Excel'den nöbet çizelgesi: ay başlıktan bulunur (tarihlerle çelişirse sorulur), o ayın listesi yenilenir ya da eksikler eklenir. */
function DutyExcelImport({ file, onClose, onSaved }: { file: File | null; onClose: () => void; onSaved: (month: string) => void }) {
  const basePath = useSchoolPath('duties');
  return (
    <ExcelImportDialog<DutyRow, DutyPreview, { mode: Mode; month: string | null }>
      file={file}
      onClose={onClose}
      basePath={basePath}
      invalidate={['duties', 'duty-supervisors', 'holidays']}
      initialOptions={{ mode: 'replace', month: null }}
      previewQuery={(o) => (o.month ? `?month=${o.month}` : '')}
      columns={[
        { header: 'Gün', cell: (r) => r.day },
        { header: 'Nöbet yeri', cell: (r) => r.area },
        {
          header: 'Öğretmen',
          cell: (r) => (
            <span className="flex items-center gap-1.5 font-medium whitespace-nowrap text-ink">
              {r.teacherName}
              {r.teacherInactive && <Badge tone="amber">pasif</Badge>}
            </span>
          ),
        },
      ]}
      stats={(p, o) => [
        { label: 'Yeni nöbet', value: p.totals.new, tone: 'green' },
        { label: 'Değişiklik yok', value: p.totals.unchanged, tone: 'slate' },
        { label: 'Kaldırılacak', value: o.mode === 'replace' ? p.removed.length : 0, tone: o.mode === 'replace' && p.removed.length ? 'red' : 'slate' },
        { label: 'Müdür yrd. (tarih)', value: p.supervisors.filter((x) => x.status !== 'unchanged').length, tone: 'blue' },
        { label: 'Atlanacak satır', value: p.totals.skipped, tone: p.totals.skipped ? 'amber' : 'slate' },
      ]}
      additions={(p) => p.additions}
      renderOptions={(p, o, set) => (
        <div className="space-y-3">
        <MonthChoice resolution={p.month} onChoose={(month) => set({ ...o, month })} movedCount={p.supervisors.filter((x) => x.from).length} />
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => set({ ...o, mode: m.value })}
              className={clsx(
                'rounded-xl p-3.5 text-left ring-1 transition-colors',
                o.mode === m.value ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:bg-slate-50',
              )}
            >
              <div className="text-sm font-semibold">{m.title}</div>
              <div className="mt-0.5 text-xs text-slate-500">{m.text(p)}</div>
            </button>
          ))}
        </div>
        </div>
      )}
      renderExtra={(p, o) => (
        <>
          {(p.holidays.length > 0 || p.undatedHolidays.length > 0) && (
            <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-100">
              <div className="font-semibold">Tatil olarak tanınanlar</div>
              <ul className="mt-1.5 space-y-0.5">
                {p.holidays.map((h) => (
                  <li key={h.date}>
                    <span className="tabular-nums">{trDate(h.date)}</span> · {h.name}
                  </li>
                ))}
                {p.undatedHolidays.map((h) => (
                  <li key={h.name} className="text-slate-500">
                    {h.day ? `${h.day} · ` : ''}
                    {h.name} <span className="text-xs">(bu ayda tarihi bulunamadı, kaydedilmeyecek)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.supervisors.length > 0 && (
            <details className="rounded-xl bg-teal-50 p-4 text-sm text-teal-950 ring-1 ring-teal-200">
              <summary className="cursor-pointer font-semibold">Nöbetçi müdür yardımcısı · {p.supervisors.length} tarih</summary>
              <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                {p.supervisors.map((x) => (
                  <li key={x.date} className="flex items-center gap-2">
                    <span className="tabular-nums">{trDate(x.date)}</span>
                    {x.from && <span className="text-xs text-slate-500 line-through">{trDate(x.from)}</span>}
                    <span className="font-medium">{x.name}</span>
                    {x.status !== 'unchanged' && <Badge tone={x.status === 'new' ? 'green' : 'blue'}>{x.status === 'new' ? 'yeni' : 'güncellenecek'}</Badge>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {o.mode === 'replace' && p.removed.length > 0 && (
            <details className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
              <summary className="cursor-pointer font-semibold">Kaldırılacak {p.removed.length} nöbet</summary>
              <ul className="mt-2 space-y-0.5">
                {p.removed.map((r, i) => (
                  <li key={i}>
                    {r.day} · {r.area} · {r.teacherName}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      commitCount={(p, o) =>
        (o.mode === 'replace' ? p.totals.new + p.removed.length : p.totals.new) +
        p.supervisors.filter((x) => x.status !== 'unchanged').length +
        p.holidays.length
      }
      commitLabel={(_, o) => (o.mode === 'replace' ? 'Çizelgeyi kaydet' : 'Yeni nöbetleri ekle')}
      commitBody={(p, o) => ({
        month: p.month.month,
        mode: o.mode,
        weekdays: p.weekdays,
        rows: p.rows.map(({ weekday, area, teacherName }) => ({ weekday, area, teacherName })),
        supervisors: p.supervisors.map(({ date, name }) => ({ date, name })),
        holidays: p.holidays,
      })}
      successMessage={(res: { created: number; supervisors: number }, p, o) => {
        onSaved(p.month.month);
        return `${monthLabel(p.month.month)} · ` + (o.mode === 'replace'
          ? `Nöbet çizelgesi güncellendi: ${p.totals.new} yeni nöbet${p.removed.length ? `, ${p.removed.length} nöbet kaldırıldı` : ''}`
          : `${res.created} nöbet eklendi`) + (res.supervisors ? ` · ${res.supervisors} tarihin müdür yardımcısı kaydedildi` : '');
      }}
    />
  );
}

export function Duties() {
  const [day, setDay] = useState(() => Math.min(todayWeekday(), 5));
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [view, setView] = useState<View>('duties');
  const { can, schoolId } = useAuth();
  const supervisorsPath = useSchoolPath('duty-supervisors');
  const supervisors = useQuery({
    queryKey: [schoolId, 'duty-supervisors', month],
    queryFn: () => api<DutySupervisor[]>(`${supervisorsPath}?month=${month}`),
    enabled: Boolean(schoolId),
  });
  const dutiesPath = useSchoolPath('duties');
  const teachers = useList<Teacher>('teachers');
  const duties = useList<Duty>('duties');
  const qc = useQueryClient();
  const toast = useToast();
  const names = nameMap(teachers.data, (t) => t.fullName);
  const areas = [...new Set((duties.data ?? []).map((d) => d.area))].sort((a, b) => a.localeCompare(b, 'tr'));
  // Nöbet listesi aya bağlıdır: seçili ayın listesi gösterilir
  const monthDuties = (duties.data ?? []).filter((d) => d.month === month);
  const counts = monthDuties.reduce<Record<number, number>>((acc, d) => ({ ...acc, [d.weekday]: (acc[d.weekday] ?? 0) + 1 }), {});
  const otherMonths = [...new Set((duties.data ?? []).map((d) => d.month))].filter((m) => m !== month).sort();
  // Kopyalamak için en yakın ay: önceki aylardan en sonuncusu, yoksa sonraki ilk ay
  const copySource = otherMonths.filter((m) => m < month).pop() ?? otherMonths[0] ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: [schoolId, 'duties'] });
  const copyFrom = async (from: string) => {
    try {
      const res = await api<{ copied: number }>(`${dutiesPath}/copy`, { method: 'POST', body: { from, to: month } });
      await refresh();
      toast.success(`${monthLabel(from)} listesi ${monthLabel(month)} ayına kopyalandı (${res.copied} nöbet)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kopyalanamadı');
    }
  };

  return (
    <>
      <CrudPage<Duty, Form>
        resource="duties"
        label="Nöbet"
        title="Nöbet Çizelgesi"
        description="Haftanın her günü için nöbet yerleri ve nöbetçi öğretmenler, tarih tarih nöbetçi müdür yardımcısı. Excel şablonu ve dışa aktarma okulunuzun aylık çizelge düzenindedir; ayı sağdan seçin."
        tabs={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ViewTabs
              view={view}
              onView={setView}
              counts={{
                duties: monthDuties.filter((d) => d.weekday <= 5).length,
                supervisor: `${monthLabel(month)} · ${filledCount(month, (supervisors.data ?? []).map((x) => x.date))} gün dolu`,
              }}
            />
            <MonthNav month={month} onMonth={setMonth} />
          </div>
        }
        replaceContent={
          view === 'supervisor' ? (
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-teal-50/80 to-surface px-5 py-3.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-teal-600 text-white">
                  <CalendarDays className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-ink">{monthLabel(month)} · Nöbetçi müdür yardımcısı</h2>
                  <p className="text-xs text-slate-500">İsmi yazıp çıkın, kendiliğinden kaydedilir. Panoda o günün ismi nöbetçi öğretmenler kartında görünür.</p>
                </div>
                {can('duties.manage') && (supervisors.data?.length ?? 0) > 0 && (
                  <div className="ml-auto">
                    <ClearMonthButton
                      month={month}
                      what="nöbetçi müdür yardımcıları"
                      onConfirm={async () => {
                        const res = await api<{ removed: number }>(`${supervisorsPath}/clear`, { method: 'POST', body: { month } });
                        await qc.invalidateQueries({ queryKey: [schoolId, 'duty-supervisors'] });
                        toast.success(`${res.removed} kayıt silindi`);
                      }}
                    />
                  </div>
                )}
              </div>
              <SupervisorCalendar month={month} editable={can('duties.manage')} />
            </Card>
          ) : undefined
        }
        permission="duties.manage"
        icon={<ShieldCheck className="size-6" />}
        emptyTitle={monthDuties.length ? `${WEEKDAY_NAMES[day]} için nöbet girilmemiş` : `${monthLabel(month)} için nöbet listesi yok`}
        emptyText={
          monthDuties.length
            ? 'Nöbet yerlerini (Zemin Kat, Bahçe, Kantin…) ve öğretmenleri ekleyin.'
            : "Bu ayın çizelgesini Excel'den yükleyin, başka bir aydan kopyalayın ya da tek tek ekleyin. Pano, bu ayın listesi gelene kadar en son ayın listesini gösterir."
        }
        addLabel="Nöbet ekle"
        reorderable
        headerActions={
          <ExcelButtons
            basePath={dutiesPath}
            module="Nöbet Çizelgesi"
            period={monthLabel(month)}
            canImport={can('duties.manage')}
            onFile={setExcelFile}
            query={`month=${month}`}
          />
        }
        schema={dutySchema}
        toolbar={
          <div className="space-y-3">
            <DayBar value={day} onChange={setDay} counts={counts} />
            {can('duties.manage') && (monthDuties.length > 0 || copySource) && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {copySource ? (
                  <button
                    type="button"
                    onClick={() => void copyFrom(copySource)}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50"
                  >
                    <CopyPlus className="size-3.5" />
                    {monthLabel(copySource)} listesini {monthDuties.length ? 'bu ayın yerine ' : ''}kopyala
                  </button>
                ) : (
                  <span />
                )}
                {monthDuties.length > 0 && (
                  <ClearMonthButton
                    month={month}
                    what="nöbet listesi"
                    onConfirm={async () => {
                      const res = await api<{ removed: number }>(`${dutiesPath}/clear`, { method: 'POST', body: { month } });
                      await refresh();
                      toast.success(`${res.removed} nöbet silindi`);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        }
        select={(rows) => rows.filter((r) => r.month === month && r.weekday === day)}
        columns={[
          { header: 'Nöbet yeri', cell: (r) => <span className="font-medium text-slate-600">{r.area}</span> },
          { header: 'Öğretmen', cell: (r) => <span className="font-semibold text-ink">{names.get(r.teacherId) ?? '—'}</span> },
        ]}
        emptyForm={() => ({ month, weekday: day, area: '', teacherId: '', sortOrder: (counts[day] ?? 0) + 1 })}
        toForm={(r) => ({ month: r.month, weekday: r.weekday, area: r.area, teacherId: r.teacherId, sortOrder: r.sortOrder })}
        toPayload={(f) => f}
        renderForm={({ values: v, set, errors }) => (
          <>
            <Field label="Gün" error={errors.weekday}>
              {(id) => (
                <Select id={id} value={v.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {WEEKDAY_NAMES[d]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Nöbet yeri" error={errors.area}>
              {(id) => (
                <>
                  <Input id={id} list="duty-areas" value={v.area} onChange={(e) => set('area', e.target.value)} placeholder="ör. 1. Kat" invalid={Boolean(errors.area)} />
                  <datalist id="duty-areas">
                    {areas.map((a) => (
                      <option key={a} value={a} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Öğretmen" error={errors.teacherId ? 'Bir öğretmen seçin' : undefined} help={teachers.data?.length === 0 ? 'Önce Öğretmenler bölümünden öğretmen ekleyin.' : undefined}>
              {(id) => (
                <Select id={id} value={v.teacherId} onChange={(e) => set('teacherId', e.target.value)} invalid={Boolean(errors.teacherId)}>
                  <option value="">Seçin…</option>
                  {(teachers.data ?? [])
                    .filter((t) => t.isActive || t.id === v.teacherId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName}
                        {t.branch ? ` · ${t.branch}` : ''}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </>
        )}
      />
      <DutyExcelImport file={excelFile} onClose={() => setExcelFile(null)} onSaved={setMonth} />
    </>
  );
}

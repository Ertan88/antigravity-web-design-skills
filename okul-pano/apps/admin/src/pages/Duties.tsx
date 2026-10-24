import { dutySchema, WEEKDAY_NAMES, WEEKDAY_SHORT } from '@okulpano/shared';
import clsx from 'clsx';
import { CalendarDays, ShieldCheck, UserCog } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CrudPage } from '../components/CrudPage.tsx';
import { ExcelButtons } from '../components/ExcelButtons.tsx';
import { ExcelImportDialog, type ImportPreview } from '../components/ExcelImportDialog.tsx';
import { Badge, Card, Field, Input, Select } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { nameMap, useList, useSchoolPath, type Duty, type Teacher } from '../lib/data.ts';
import { currentMonth, filledCount, MonthNav, monthLabel, SupervisorCalendar, type DutySupervisor } from './duties/calendar.tsx';

type Form = { weekday: number; area: string; teacherId: string; sortOrder: number };

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
                ? 'bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-[0_10px_24px_-12px_rgba(37,99,235,0.8)]'
                : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200/80 hover:bg-white hover:ring-brand-200',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold sm:text-sm">
                <span className="sm:hidden">{WEEKDAY_SHORT[d]}</span>
                <span className="hidden sm:inline">{WEEKDAY_NAMES[d]}</span>
              </span>
              {d === today && (
                <span className={clsx('size-1.5 shrink-0 rounded-full', active ? 'bg-white' : 'bg-emerald-500')} title="Bugün" />
              )}
            </div>
            <div className={clsx('mt-0.5 text-xs tabular-nums', active ? 'text-white/80' : 'text-slate-500')}>
              <span className="sm:hidden">{n || '—'}</span>
              <span className="hidden sm:inline">{n ? `${n} nöbetçi` : 'Nöbet yok'}</span>
            </div>
            <div className={clsx('mt-2 h-1 overflow-hidden rounded-full', active ? 'bg-white/25' : 'bg-slate-200/80')}>
              <div className={clsx('h-full rounded-full', active ? 'bg-white' : 'bg-brand-400')} style={{ width: `${(n / max) * 100}%` }} />
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
    <div className="inline-flex w-full flex-wrap gap-1 rounded-2xl bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-slate-200 sm:w-auto">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onView(t.value)}
          className={clsx(
            'flex flex-1 items-center gap-2.5 rounded-xl px-3.5 py-2 text-left transition sm:flex-none',
            view === t.value ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
          )}
        >
          <t.icon className={clsx('size-4 shrink-0', view === t.value ? 'text-brand-300' : 'text-slate-400')} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{t.label}</span>
            <span className={clsx('block text-[11px]', view === t.value ? 'text-slate-400' : 'text-slate-400')}>{t.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

type Mode = 'replace' | 'merge';
type DutyRow = { weekday: number; day: string; area: string; teacherName: string; teacherInactive: boolean };
type SupervisorRow = { date: string; name: string; status: 'new' | 'update' | 'unchanged' };
type DutyPreview = ImportPreview<DutyRow> & {
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

/** Excel'den nöbet çizelgesi: dosyadaki günler yenilenir ya da eksikler eklenir. */
function DutyExcelImport({ file, onClose }: { file: File | null; onClose: () => void }) {
  const basePath = useSchoolPath('duties');
  return (
    <ExcelImportDialog<DutyRow, DutyPreview, { mode: Mode }>
      file={file}
      onClose={onClose}
      basePath={basePath}
      invalidate={['duties', 'duty-supervisors']}
      initialOptions={{ mode: 'replace' }}
      columns={[
        { header: 'Gün', cell: (r) => r.day },
        { header: 'Nöbet yeri', cell: (r) => r.area },
        {
          header: 'Öğretmen',
          cell: (r) => (
            <span className="flex items-center gap-1.5 font-medium whitespace-nowrap text-slate-900">
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
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => set({ mode: m.value })}
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
      )}
      renderExtra={(p, o) => (
        <>
          {p.supervisors.length > 0 && (
            <details className="rounded-xl bg-teal-50 p-4 text-sm text-teal-950 ring-1 ring-teal-200">
              <summary className="cursor-pointer font-semibold">Nöbetçi müdür yardımcısı · {p.supervisors.length} tarih</summary>
              <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                {p.supervisors.map((x) => (
                  <li key={x.date} className="flex items-center gap-2">
                    <span className="tabular-nums">{x.date.split('-').reverse().join('.')}</span>
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
        (o.mode === 'replace' ? p.totals.new + p.removed.length : p.totals.new) + p.supervisors.filter((x) => x.status !== 'unchanged').length
      }
      commitLabel={(_, o) => (o.mode === 'replace' ? 'Çizelgeyi kaydet' : 'Yeni nöbetleri ekle')}
      commitBody={(p, o) => ({
        mode: o.mode,
        weekdays: p.weekdays,
        rows: p.rows.map(({ weekday, area, teacherName }) => ({ weekday, area, teacherName })),
        supervisors: p.supervisors.map(({ date, name }) => ({ date, name })),
      })}
      successMessage={(res: { created: number; supervisors: number }, p, o) =>
        (o.mode === 'replace'
          ? `Nöbet çizelgesi güncellendi: ${p.totals.new} yeni nöbet${p.removed.length ? `, ${p.removed.length} nöbet kaldırıldı` : ''}`
          : `${res.created} nöbet eklendi`) + (res.supervisors ? ` · ${res.supervisors} tarihin müdür yardımcısı kaydedildi` : '')
      }
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
  const names = nameMap(teachers.data, (t) => t.fullName);
  const areas = [...new Set((duties.data ?? []).map((d) => d.area))].sort((a, b) => a.localeCompare(b, 'tr'));
  const counts = (duties.data ?? []).reduce<Record<number, number>>((acc, d) => ({ ...acc, [d.weekday]: (acc[d.weekday] ?? 0) + 1 }), {});

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
                duties: (duties.data ?? []).filter((d) => d.weekday <= 5).length,
                supervisor: `${monthLabel(month)} · ${filledCount(month, (supervisors.data ?? []).map((x) => x.date))} gün dolu`,
              }}
            />
            <MonthNav month={month} onMonth={setMonth} />
          </div>
        }
        replaceContent={
          view === 'supervisor' ? (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-teal-50/80 to-white px-5 py-3.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-teal-600 text-white">
                  <CalendarDays className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{monthLabel(month)} · Nöbetçi müdür yardımcısı</h2>
                  <p className="text-xs text-slate-500">İsmi yazıp çıkın, kendiliğinden kaydedilir. Panoda o günün ismi nöbetçi öğretmenler kartında görünür.</p>
                </div>
              </div>
              <SupervisorCalendar month={month} editable={can('duties.manage')} />
            </Card>
          ) : undefined
        }
        permission="duties.manage"
        icon={<ShieldCheck className="size-6" />}
        emptyTitle={`${WEEKDAY_NAMES[day]} için nöbet girilmemiş`}
        emptyText="Nöbet yerlerini (Zemin Kat, Bahçe, Kantin…) ve öğretmenleri ekleyin."
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
          <DayBar value={day} onChange={setDay} counts={counts} />
        }
        select={(rows) => rows.filter((r) => r.weekday === day)}
        columns={[
          { header: 'Nöbet yeri', cell: (r) => <span className="font-medium text-slate-600">{r.area}</span> },
          { header: 'Öğretmen', cell: (r) => <span className="font-semibold text-slate-900">{names.get(r.teacherId) ?? '—'}</span> },
        ]}
        emptyForm={() => ({ weekday: day, area: '', teacherId: '', sortOrder: (counts[day] ?? 0) + 1 })}
        toForm={(r) => ({ weekday: r.weekday, area: r.area, teacherId: r.teacherId, sortOrder: r.sortOrder })}
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
      <DutyExcelImport file={excelFile} onClose={() => setExcelFile(null)} />
    </>
  );
}

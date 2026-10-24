import { dutySchema, WEEKDAY_NAMES } from '@okulpano/shared';
import clsx from 'clsx';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { CrudPage } from '../components/CrudPage.tsx';
import { ExcelButtons } from '../components/ExcelButtons.tsx';
import { ExcelImportDialog, type ImportPreview } from '../components/ExcelImportDialog.tsx';
import { Badge, Field, Input, Segmented, Select } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { nameMap, useList, useSchoolPath, type Duty, type Teacher } from '../lib/data.ts';

type Form = { weekday: number; area: string; teacherId: string; sortOrder: number };

const todayWeekday = () => ((new Date().getDay() + 6) % 7) + 1;

type Mode = 'replace' | 'merge';
type DutyRow = { weekday: number; day: string; area: string; teacherName: string; teacherInactive: boolean };
type DutyPreview = ImportPreview<DutyRow> & {
  weekdays: number[];
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
      invalidate={['duties']}
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
      renderExtra={(p, o) =>
        o.mode === 'replace' &&
        p.removed.length > 0 && (
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
        )
      }
      commitCount={(p, o) => (o.mode === 'replace' ? p.totals.new + p.removed.length : p.totals.new)}
      commitLabel={(_, o) => (o.mode === 'replace' ? 'Çizelgeyi kaydet' : 'Yeni nöbetleri ekle')}
      commitBody={(p, o) => ({
        mode: o.mode,
        weekdays: p.weekdays,
        rows: p.rows.map(({ weekday, area, teacherName }) => ({ weekday, area, teacherName })),
      })}
      successMessage={(res: { created: number }, p, o) =>
        o.mode === 'replace'
          ? `Nöbet çizelgesi güncellendi: ${p.totals.new} yeni nöbet${p.removed.length ? `, ${p.removed.length} nöbet kaldırıldı` : ''}`
          : `${res.created} nöbet eklendi`
      }
    />
  );
}

export function Duties() {
  const [day, setDay] = useState(() => Math.min(todayWeekday(), 5));
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const { can } = useAuth();
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
        description="Her gün için nöbet yeri ve nöbetçi öğretmen. Pano bugünün nöbetçilerini kendiliğinden gösterir."
        permission="duties.manage"
        icon={<ShieldCheck className="size-6" />}
        emptyTitle={`${WEEKDAY_NAMES[day]} için nöbet girilmemiş`}
        emptyText="Nöbet yerlerini (Zemin Kat, Bahçe, Kantin…) ve öğretmenleri ekleyin."
        addLabel="Nöbet ekle"
        reorderable
        headerActions={
          <ExcelButtons
            basePath={dutiesPath}
            templateName="nobet-cizelgesi-sablonu.xlsx"
            exportName="nobet-cizelgesi.xlsx"
            canImport={can('duties.manage')}
            onFile={setExcelFile}
          />
        }
        schema={dutySchema}
        toolbar={
          <Segmented
            value={day}
            onChange={setDay}
            options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
              value: d,
              label: (
                <span>
                  {WEEKDAY_NAMES[d]}
                  {counts[d] ? <span className="ml-1.5 text-xs text-slate-400">{counts[d]}</span> : null}
                </span>
              ),
            }))}
          />
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
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
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

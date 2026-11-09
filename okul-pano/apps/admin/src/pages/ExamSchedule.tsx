import { compareClassNames, EXAM_KINDS, gradeOf, type ExamKind, type ScheduledExam, errorText } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { confirm } from '../components/confirm.tsx';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  Plus,
  Trash2,
  Upload,
  X,
} from '../components/icons.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner } from '../components/ui.tsx';
import { api, downloadFile } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchoolPath } from '../lib/data.ts';

/*
 * Sınav Takvimi: sınıf + gün + ders saati. Saat yazılmaz; o günkü zilden hesaplanır. Gözetmen boşsa ders
 * programından bulunur. Liste (tarihe göre) ve haftalık ızgara (sınıf × gün) görünümü; Excel şablonu ve yükleme.
 */

type View = 'list' | 'grid';
interface Options {
  classes: { id: string; name: string }[];
  teachers: { id: string; fullName: string }[];
  subjects: string[];
  subjectsByClass: Record<string, string[]>;
}

const KIND_TONE: Record<ExamKind, string> = {
  written: 'bg-violet-100 text-violet-800 dark:bg-[#2b2240] dark:text-[#ddd6fe]',
  common: 'bg-sky-100 text-sky-800 dark:bg-[#0d2c3f] dark:text-[#bae6fd]',
  practical: 'bg-amber-100 text-amber-800 dark:bg-[#3a2a0c] dark:text-[#fde68a]',
};

const DAY = 86400_000;
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoOf(new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY));
const mondayOf = (iso: string) => {
  const wd = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso, -wd);
};
const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat('tr-TR', { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

function KindPill({ kind }: { kind: ExamKind }) {
  return <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', KIND_TONE[kind])}>{EXAM_KINDS[kind]}</span>;
}

function WarnIcon({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <span title={warnings.join('\n')} className="inline-flex text-amber-600">
      <AlertTriangle className="size-4" />
    </span>
  );
}

export function ExamSchedule() {
  const { schoolId, can } = useAuth();
  const path = useSchoolPath('exam-schedule');
  const editable = can('exams.manage');
  const toast = useToast();
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem('exam-view') as View) || 'list';
    } catch {
      return 'list';
    }
  });
  const [showPast, setShowPast] = useState(false);
  const [week, setWeek] = useState<string | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<ScheduledExam> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const switchView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem('exam-view', v);
    } catch {
      /* gizli pencere */
    }
  };

  const options = useQuery({ queryKey: [schoolId, 'exam-schedule', 'options'], queryFn: () => api<Options>(`${path}/options`) });
  // Liste: bugünden 120 gün (geçmiş açıksa 120 gün öncesinden); ızgara: seçili hafta
  const today = isoOf(new Date());
  const monday = week ?? mondayOf(today);
  const range = view === 'grid' ? { from: monday, to: addDays(monday, 6) } : { from: showPast ? addDays(today, -120) : today, to: addDays(today, 120) };
  const list = useQuery({
    queryKey: [schoolId, 'exam-schedule', range.from, range.to],
    queryFn: () => api<{ today: string; exams: ScheduledExam[] }>(`${path}?from=${range.from}&to=${range.to}`),
  });
  const exams = list.data?.exams ?? [];
  const classes = useMemo(() => [...(options.data?.classes ?? [])].sort((a, b) => compareClassNames(a.name, b.name)), [options.data]);
  const grades = [...new Set(classes.map((c) => gradeOf(c.name)).filter((g): g is number => g != null))].sort((a, b) => a - b);
  const warnCount = exams.filter((e) => e.warnings.length).length;

  const downloadTemplate = async () => {
    try {
      await downloadFile(`${path}/template`, 'Sınav Takvimi Şablonu.xlsx');
    } catch (err) {
      toast.error(errorText(err, 'İndirilemedi'));
    }
  };

  return (
    <div>
      <PageHeader
        title="Sınav Takvimi"
        description="Yazılı, uygulama ve ortak sınavlar. Saat yazılmaz: ders saati numarası girilir, saat o sınıfın zilinden hesaplanır. Panoda bugünkü sınavlar görünür; gözetmene ve dersin öğretmenine sınavdan önceki teneffüste (1. dersse ilk zilden 15 dk önce) bildirim gider."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => void downloadTemplate()}>
              Şablonu indir
            </Button>
            {editable && (
              <>
                <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()}>
                  Excel'den yükle
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setFile(f);
                    e.target.value = '';
                  }}
                />
                <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ date: today, periodNo: 1, kind: 'written' })}>
                  Sınav ekle
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={view}
          onChange={switchView}
          options={[
            { value: 'list', label: <span className="inline-flex items-center gap-1.5"><ListChecks className="size-4" /> Liste</span> },
            { value: 'grid', label: <span className="inline-flex items-center gap-1.5"><LayoutDashboard className="size-4" /> Haftalık ızgara</span> },
          ]}
        />
        {view === 'grid' ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" aria-label="Önceki hafta" onClick={() => setWeek(addDays(monday, -7))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setWeek(null)}>
              Bu hafta
            </Button>
            <Button size="sm" variant="secondary" aria-label="Sonraki hafta" onClick={() => setWeek(addDays(monday, 7))}>
              <ChevronRight className="size-4" />
            </Button>
            <span className="ml-2 text-sm font-semibold text-slate-600">
              {fmtDay(monday, { day: 'numeric', month: 'long' })} – {fmtDay(addDays(monday, 4), { day: 'numeric', month: 'long' })}
            </span>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
            <input type="checkbox" className="size-4 accent-brand-600" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            Geçmiş sınavları da göster
          </label>
        )}
        {grades.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {[null, ...grades].map((g) => (
              <button
                key={String(g)}
                type="button"
                onClick={() => setGrade(g)}
                className={clsx('rounded-full px-3 py-1 text-xs font-bold ring-1', grade === g ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50')}
              >
                {g == null ? 'Tümü' : `${g}. sınıf`}
              </button>
            ))}
          </div>
        )}
      </div>

      {warnCount > 0 && (
        <div className="mb-4">
          <Alert tone="amber">
            {warnCount} sınavda kontrol edilmesi gereken bir durum var (tatil, o gün olmayan ders saati, izinli gözetmen…). Sarı simgenin üzerine gelince nedeni görünür.
          </Alert>
        </div>
      )}

      {list.isLoading || options.isLoading ? (
        <Spinner />
      ) : view === 'list' ? (
        <ExamList exams={exams.filter((e) => grade == null || gradeOf(e.className) === grade)} today={list.data?.today ?? today} onOpen={editable ? setEditing : undefined} />
      ) : (
        <ExamGrid
          exams={exams}
          classes={classes.filter((c) => grade == null || gradeOf(c.name) === grade)}
          monday={monday}
          onOpen={editable ? setEditing : undefined}
          onAdd={editable ? (classGroupId, date) => setEditing({ classGroupId, date, periodNo: 1, kind: 'written' }) : undefined}
        />
      )}

      {editing && options.data && <ExamDialog exam={editing} options={options.data} onClose={() => setEditing(null)} />}
      <ExamImportDialog file={file} onClose={() => setFile(null)} />
    </div>
  );
}

function ExamList({ exams, today, onOpen }: { exams: ScheduledExam[]; today: string; onOpen?: (e: ScheduledExam) => void }) {
  if (!exams.length)
    return (
      <EmptyState
        icon={<ClipboardCheck className="size-6" />}
        title="Sınav eklenmemiş"
        description="Şablonu indirip doldurun ve Excel'den yükleyin ya da Sınav ekle ile tek tek girin."
      />
    );
  const days = [...new Set(exams.map((e) => e.date))];
  return (
    <div className="space-y-4">
      {days.map((d) => (
        <section key={d} className={clsx('overflow-hidden rounded-3xl bg-surface ring-1 ring-slate-200/70', d < today && 'opacity-70')}>
          <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm font-extrabold text-ink">
            {fmtDay(d)}
            {d === today && <Badge tone="blue">Bugün</Badge>}
          </h2>
          <table className="min-w-full text-sm">
            <thead className="text-left text-[11px] font-bold tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="w-28 px-5 py-2">Ders saati</th>
                <th className="w-24 px-3 py-2">Sınıf</th>
                <th className="px-3 py-2">Ders</th>
                <th className="w-24 px-3 py-2">Tür</th>
                <th className="px-3 py-2">Gözetmen</th>
                <th className="px-3 py-2">Dersin öğretmeni</th>
                <th className="w-28 px-3 py-2">Bildirim</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exams
                .filter((e) => e.date === d)
                .map((e) => (
                  <tr key={e.id} className={clsx(onOpen && 'cursor-pointer hover:bg-slate-50')} onClick={() => onOpen?.(e)}>
                    <td className="px-5 py-2.5 font-bold text-ink">
                      {e.periodNo}. ders <span className="font-medium text-slate-400">{e.start ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-ink">{e.className}</td>
                    <td className="px-3 py-2.5 text-ink">
                      {e.subject}
                      {e.note && <span className="ml-2 text-xs text-slate-400">{e.note}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <KindPill kind={e.kind} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {e.proctors.length
                        ? e.proctors.map((p) => (
                            <span key={p.teacherId} className={clsx('mr-2', p.onLeave && 'text-rose-600 line-through')}>
                              {p.fullName}
                            </span>
                          ))
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{e.subjectTeachers.map((t) => t.fullName).join(', ') || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {e.notifyAt ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(e.notifyAt)) : '—'}
                    </td>
                    <td className="pr-4">
                      <WarnIcon warnings={e.warnings} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function ExamGrid({
  exams,
  classes,
  monday,
  onOpen,
  onAdd,
}: {
  exams: ScheduledExam[];
  classes: { id: string; name: string }[];
  monday: string;
  onOpen?: (e: ScheduledExam) => void;
  onAdd?: (classGroupId: string, date: string) => void;
}) {
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  // Hafta sonu sınavı varsa sütun eklenir
  for (const extra of [5, 6]) if (exams.some((e) => e.date === addDays(monday, extra))) days.push(addDays(monday, extra));
  if (!classes.length) return <EmptyState icon={<ClipboardCheck className="size-6" />} title="Sınıf yok" description="Önce Öğretmenler ve Sınıflar sayfasından sınıf ekleyin." />;
  return (
    <div className="overflow-x-auto rounded-3xl bg-surface p-3 ring-1 ring-slate-200/70">
      <table className="w-full min-w-[720px] border-separate border-spacing-1.5 text-xs">
        <thead>
          <tr>
            <th className="w-20" />
            {days.map((d) => (
              <th key={d} className="px-1 pb-1 text-left text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                {fmtDay(d, { weekday: 'short', day: 'numeric' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id}>
              <th className="pr-2 text-left text-sm font-extrabold text-ink">{c.name}</th>
              {days.map((d) => {
                const cell = exams.filter((e) => e.classGroupId === c.id && e.date === d).sort((a, b) => a.periodNo - b.periodNo);
                return (
                  <td
                    key={d}
                    className={clsx('h-14 rounded-xl bg-slate-50 p-1 align-top', onAdd && !cell.length && 'cursor-pointer hover:bg-slate-100', cell.length > 1 && 'ring-2 ring-amber-300')}
                    onClick={() => !cell.length && onAdd?.(c.id, d)}
                    title={cell.length > 1 ? 'Bu sınıfın aynı gün birden çok sınavı var' : undefined}
                  >
                    <div className="space-y-1">
                      {cell.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onOpen?.(e);
                          }}
                          className={clsx('block w-full rounded-lg px-2 py-1 text-left leading-tight font-bold', KIND_TONE[e.kind])}
                        >
                          <span className="flex items-center justify-between gap-1">
                            {e.periodNo}. ders · {e.subject}
                            <WarnIcon warnings={e.warnings} />
                          </span>
                          <span className="block text-[10.5px] font-semibold opacity-75">
                            {EXAM_KINDS[e.kind]}
                            {e.start ? ` · ${e.start}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Sınav ekle / düzenle: kaydedilince saat, gözetmen ve uyarılar sunucudan hesaplanmış döner */
function ExamDialog({ exam, options, onClose }: { exam: Partial<ScheduledExam>; options: Options; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('exam-schedule');
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({
    date: exam.date ?? '',
    periodNo: exam.periodNo ?? 1,
    classGroupId: exam.classGroupId ?? '',
    subject: exam.subject ?? '',
    kind: (exam.kind ?? 'written') as ExamKind,
    proctorTeacherId: exam.proctorTeacherId ?? '',
    note: exam.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subjects = (v.classGroupId && options.subjectsByClass[v.classGroupId]) || options.subjects;
  const refresh = () => qc.invalidateQueries({ queryKey: [schoolId, 'exam-schedule'] });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { ...v, proctorTeacherId: v.proctorTeacherId || null, note: v.note || null };
      const saved = await api<ScheduledExam>(exam.id ? `${path}/${exam.id}` : path, { method: exam.id ? 'PUT' : 'POST', body });
      await refresh();
      if (saved.warnings.length) toast.error(`Kaydedildi, ama kontrol edin: ${saved.warnings[0]}`);
      else toast.success(`Kaydedildi · ${saved.className} ${saved.subject}, ${saved.periodNo}. ders${saved.start ? ` (${saved.start})` : ''}`);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Kaydedilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!exam.id) return;
    const ok = await confirm({
      title: 'Sınav silinsin mi?',
      subtitle: `${exam.className} · ${exam.subject}`,
      message: 'Sınav takviminden ve panodan kalkar; gözetmene ve dersin öğretmenine bildirilir.',
      confirmLabel: 'Sil',
    });
    if (!ok) return;
    try {
      await api(`${path}/${exam.id}`, { method: 'DELETE' });
      await refresh();
      toast.success('Sınav silindi');
      onClose();
    } catch (err) {
      setError(errorText(err, 'Silinemedi.'));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={exam.id ? 'Sınavı düzenle' : 'Sınav ekle'}
      description="Saat yazılmaz: ders saati seçilir, saat o sınıfın o günkü zilinden hesaplanır."
      footer={
        <>
          {exam.id && (
            <Button
              variant="secondary"
              className="mr-auto text-rose-600! ring-rose-300! hover:bg-rose-50! dark:text-[#fb7185]! dark:ring-[#5c1d31]! dark:hover:bg-[#3e1422]!"
              icon={<Trash2 className="size-4" />}
              onClick={() => void remove()}
            >
              Sınavı sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} disabled={!v.date || !v.classGroupId || !v.subject.trim()} onClick={() => void save()}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarih">{(id) => <Input id={id} type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />}</Field>
        <Field label="Ders saati">
          {(id) => (
            <Select id={id} value={String(v.periodNo)} onChange={(e) => setV({ ...v, periodNo: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}. ders
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Sınıf">
          {(id) => (
            <Select id={id} value={v.classGroupId} onChange={(e) => setV({ ...v, classGroupId: e.target.value })}>
              <option value="">Sınıf seçin</option>
              {[...options.classes]
                .sort((a, b) => compareClassNames(a.name, b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Ders" help={v.classGroupId && options.subjectsByClass[v.classGroupId] ? 'Öneriler sınıfın ders programından' : undefined}>
          {(id) => (
            <>
              <Input id={id} list="exam-subjects" value={v.subject} maxLength={80} onChange={(e) => setV({ ...v, subject: e.target.value })} placeholder="ör. Matematik" />
              <datalist id="exam-subjects">
                {subjects.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Tür">
          {() => (
            // Dar sütunda alt satıra kaymasın: üç eşit parça, tam genişlik
            <div role="radiogroup" aria-label="Sınav türü" className="grid h-10 grid-cols-3 gap-1 rounded-full bg-slate-200/70 p-1">
              {(Object.keys(EXAM_KINDS) as ExamKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={v.kind === k}
                  onClick={() => setV({ ...v, kind: k })}
                  className={clsx(
                    'truncate rounded-full px-2 text-sm font-bold transition-colors',
                    v.kind === k ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(28,25,23,0.12)]' : 'text-slate-500 hover:text-ink',
                  )}
                >
                  {EXAM_KINDS[k]}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label="Gözetmen" help="Boş bırakılırsa o saatte o sınıfta dersi olan öğretmen gözetmen olur.">
          {(id) => (
            <Select id={id} value={v.proctorTeacherId} onChange={(e) => setV({ ...v, proctorTeacherId: e.target.value })}>
              <option value="">Ders programından (otomatik)</option>
              {options.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Not (isteğe bağlı)">{(id) => <Input id={id} value={v.note} maxLength={120} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="ör. 1. yazılı, laboratuvarda" />}</Field>
        </div>
      </div>
      {exam.warnings && exam.warnings.length > 0 && (
        <div className="mt-4">
          <Alert tone="amber">
            <ul className="list-disc pl-4">
              {exam.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}
    </Modal>
  );
}

interface PreviewRow {
  row: number;
  date: string;
  periodNo: number;
  classGroupId: string;
  classLabel: string;
  subject: string;
  kind: ExamKind;
  proctorTeacherId: string | null;
  note: string | null;
  exists: boolean;
  start: string | null;
  proctors: string[];
  subjectTeachers: string[];
  status: 'ok' | 'warn';
  messages: string[];
}
interface Preview {
  rows: PreviewRow[];
  errors: { row: number; message: string }[];
  totals: { ok: number; warn: number; error: number; update: number };
}

/** Excel yükleme: dosya → önizleme (hazır / kontrol edin / kaydedilmeyecek) → kaydet */
function ExamImportDialog({ file, onClose }: { file: File | null; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('exam-schedule');
  const qc = useQueryClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ['exam-import', file?.name, file?.lastModified, file?.size],
    enabled: Boolean(file),
    retry: false,
    gcTime: 0,
    queryFn: () => {
      const form = new FormData();
      form.append('file', file!);
      return api<Preview>(`${path}/import/preview`, { method: 'POST', form });
    },
  });
  const p = preview.data;

  const save = async () => {
    if (!p) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ created: number; updated: number }>(`${path}/import`, {
        method: 'POST',
        body: { rows: p.rows.map((r) => ({ date: r.date, periodNo: r.periodNo, classGroupId: r.classGroupId, subject: r.subject, kind: r.kind, proctorTeacherId: r.proctorTeacherId, note: r.note })) },
      });
      await qc.invalidateQueries({ queryKey: [schoolId, 'exam-schedule'] });
      toast.success(`${res.created} sınav eklendi${res.updated ? `, ${res.updated} sınav güncellendi` : ''}`);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Kaydedilemedi.'));
    } finally {
      setSaving(false);
    }
  };

  const step = (n: number, label: string, state: 'done' | 'on' | 'off') => (
    <span className={clsx('flex items-center gap-1.5 text-xs font-bold', state === 'off' ? 'text-slate-400' : 'text-ink')}>
      <span className={clsx('grid size-5 place-items-center rounded-full text-[10px]', state === 'done' ? 'bg-emerald-600 text-white' : state === 'on' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500')}>
        {state === 'done' ? <CheckCircle2 className="size-3.5" /> : n}
      </span>
      {label}
    </span>
  );

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      size="xl"
      title="Excel'den sınav takvimi yükle"
      description={file?.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={saving} disabled={!p?.rows.length} onClick={() => void save()}>
            {p?.rows.length ? `${p.rows.length} sınavı kaydet` : 'Kaydedilecek sınav yok'}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {step(1, 'Dosya', 'done')}
        <span className="text-slate-300">—</span>
        {step(2, 'Önizleme', p ? 'on' : 'off')}
        <span className="text-slate-300">—</span>
        {step(3, 'Kaydet', 'off')}
      </div>
      {preview.isLoading && <Spinner label="Dosya okunuyor…" />}
      {preview.error && <Alert tone="red">{(preview.error as Error).message}</Alert>}
      {error && <Alert tone="red">{error}</Alert>}
      {p && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-800 dark:bg-[#123d2c] dark:text-[#bbf7d0]">
              <div className="text-2xl font-extrabold">{p.totals.ok}</div>
              <div className="text-xs font-bold">hazır</div>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-800 dark:bg-[#3a2a0c] dark:text-[#fde68a]">
              <div className="text-2xl font-extrabold">{p.totals.warn}</div>
              <div className="text-xs font-bold">kaydedilir, kontrol edin</div>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-800 dark:bg-[#3e1422] dark:text-[#fecdd3]">
              <div className="text-2xl font-extrabold">{p.totals.error}</div>
              <div className="text-xs font-bold">kaydedilmeyecek</div>
            </div>
          </div>
          {p.totals.update > 0 && <Alert tone="blue">{p.totals.update} satır var olan bir sınavın yerini alacak (aynı gün, ders saati ve sınıf).</Alert>}
          {p.errors.length > 0 && (
            <details className="rounded-xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200 dark:bg-[#3e1422] dark:text-[#fecdd3]" open>
              <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                <X className="size-4" /> {p.errors.length} satır kaydedilmeyecek
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                {p.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono text-xs">{e.row}. satır:</span> {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {p.rows.length > 0 && (
            <div className="max-h-96 overflow-auto rounded-xl ring-1 ring-slate-200">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2">Tarih</th>
                    <th className="px-3 py-2">Saat</th>
                    <th className="px-3 py-2">Sınıf</th>
                    <th className="px-3 py-2">Ders</th>
                    <th className="px-3 py-2">Tür</th>
                    <th className="px-3 py-2">O saatte sınıfta</th>
                    <th className="px-3 py-2">Not</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {p.rows.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-2">
                        {r.status === 'ok' ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-amber-600" />}
                      </td>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap text-ink">{fmtDay(r.date, { day: 'numeric', month: 'short', weekday: 'short' })}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.periodNo}. ders <span className="text-slate-400">{r.start ?? ''}</span>
                      </td>
                      <td className="px-3 py-2 font-bold whitespace-nowrap text-ink">{r.classLabel}</td>
                      <td className="px-3 py-2">{r.subject}</td>
                      <td className="px-3 py-2">
                        <KindPill kind={r.kind} />
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.proctors.join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {r.exists && <Badge tone="blue">güncellenecek</Badge>} {r.messages.join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

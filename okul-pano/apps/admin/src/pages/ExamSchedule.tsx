import { classDisplayName, compareClassNames, EXAM_KINDS, mainClassProgram, examGroupClasses, examGroupPeriods, gradeOf, groupExams, parseClassName, type ExamKind, type ScheduledExam, errorText } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useMemo, useRef, useState } from 'react';
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
  const [editing, setEditing] = useState<(Partial<ScheduledExam> & { classGroupIds?: string[] }) | null>(null);
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
          onAdd={editable ? (classGroupIds, date) => setEditing({ classGroupId: classGroupIds[0], classGroupIds, date, periodNo: 1, kind: 'written' }) : undefined}
        />
      )}

      {editing && options.data && <ExamDialog exam={editing} options={options.data} onClose={() => setEditing(null)} />}
      <ExamImportDialog file={file} onClose={() => setFile(null)} />
    </div>
  );
}

const clock = (iso: string) => new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Tek sınavın satırı; gruptaki şube satırı (sub) girintili ve dersi tekrar yazmadan */
function ExamRow({ e, onOpen, sub }: { e: ScheduledExam; onOpen?: (e: ScheduledExam) => void; sub?: boolean }) {
  return (
    <tr className={clsx(onOpen && 'cursor-pointer hover:bg-slate-50', sub && 'bg-slate-50/70')} onClick={() => onOpen?.(e)}>
      <td className={clsx('px-5 py-2.5 font-bold text-ink', sub && 'pl-9 font-semibold whitespace-nowrap text-slate-500')}>
        {sub && <span className="mr-1 text-slate-400">↳</span>}
        {e.periodNo}. ders <span className="font-medium text-slate-400">{e.start ?? '—'}</span>
      </td>
      <td className="px-3 py-2.5 font-bold text-ink">{e.classLabel}</td>
      <td className="px-3 py-2.5 text-ink">
        {sub ? <span className="text-slate-400">aynı sınav</span> : e.subject}
        {e.note && <span className="ml-2 text-xs text-slate-400">{e.note}</span>}
      </td>
      <td className="px-3 py-2.5">{!sub && <KindPill kind={e.kind} />}</td>
      <td className="px-3 py-2.5 text-slate-600">
        {e.proctors.length
          ? e.proctors.map((p) => (
              <span key={p.teacherId} className={clsx('block', p.onLeave && 'text-rose-600 line-through')}>
                {p.fullName}
              </span>
            ))
          : '—'}
      </td>
      <td className="px-3 py-2.5 text-slate-600">{e.subjectTeachers.map((t) => t.fullName).join(', ') || '—'}</td>
      <td className="px-3 py-2.5 text-xs text-slate-500">{e.notifyAt ? clock(e.notifyAt) : '—'}</td>
      <td className="pr-4">
        <WarnIcon warnings={e.warnings} />
      </td>
    </tr>
  );
}

function ExamList({ exams, today, onOpen }: { exams: ScheduledExam[]; today: string; onOpen?: (e: ScheduledExam) => void }) {
  // Açık gruplar (şube ayrıntıları görünür)
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
          <table className="rt-cards min-w-full text-sm">
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
              {groupExams(exams.filter((e) => e.date === d)).map((g) => {
                if (g.items.length === 1) return <ExamRow key={g.key} e={g.items[0]!} onOpen={onOpen} />;
                const isOpen = open.has(g.key);
                const first = g.items[0]!;
                const proctors = new Set(g.items.flatMap((e) => e.proctors.map((p) => p.teacherId)));
                const teachers = [...new Set(g.items.flatMap((e) => e.subjectTeachers.map((t) => t.fullName)))];
                const notify = [...new Set(g.items.map((e) => (e.notifyAt ? clock(e.notifyAt) : '—')))];
                const starts = [...new Set(g.items.map((e) => e.start ?? '—'))];
                const notes = [...new Set(g.items.map((e) => e.note ?? ''))];
                const warnings = g.items.flatMap((e) => e.warnings.map((w) => `${e.classLabel}: ${w}`));
                return (
                  <Fragment key={g.key}>
                    <tr className={clsx('cursor-pointer hover:bg-slate-50', isOpen && 'bg-slate-50')} onClick={() => toggle(g.key)}>
                      <td className="px-5 py-2.5 font-bold text-ink">
                        {g.samePeriod ? (
                          <>
                            {first.periodNo}. ders <span className="font-medium text-slate-400">{starts.length === 1 ? starts[0] : 'şubeye göre'}</span>
                          </>
                        ) : (
                          <>
                            Şubeye göre <span className="block text-xs font-medium text-slate-400">{examGroupPeriods(g)}</span>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block font-extrabold whitespace-nowrap text-ink">{g.label}</span>
                        <span className="block text-xs font-semibold whitespace-nowrap text-slate-500">{examGroupClasses(g, 6)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-ink">
                        {first.subject}
                        {notes.length === 1 && notes[0] && <span className="ml-2 text-xs text-slate-400">{notes[0]}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <KindPill kind={first.kind} />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {g.items.length} şube · {proctors.size} gözetmen
                        <button type="button" aria-expanded={isOpen} className="ml-2 font-bold text-ink hover:underline">
                          {isOpen ? 'Gizle ▴' : 'Ayrıntı ▾'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{teachers.join(', ') || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{notify.length === 1 ? notify[0] : 'şubeye göre'}</td>
                      <td className="pr-4">
                        <WarnIcon warnings={warnings} />
                      </td>
                    </tr>
                    {isOpen && g.items.map((e) => <ExamRow key={e.id} e={e} onOpen={onOpen} sub />)}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

/** Derse göre renk: o haftanın dersleri sırayla renk alır (haftada 6 derse kadar çakışma olmaz; okula özel liste yok) */
const SUBJECT_TONES = [
  'bg-tile-sky text-tile-sky-ink',
  'bg-tile-mint text-tile-mint-ink',
  'bg-tile-peach text-tile-peach-ink',
  'bg-tile-lilac text-tile-lilac-ink',
  'bg-tile-sun text-tile-sun-ink',
  'bg-tile-rose text-tile-rose-ink',
];
const subjectKeyOf = (subject: string) => subject.trim().toLocaleLowerCase('tr-TR');

/**
 * Haftalık ızgara: satırlar kademe ("9. sınıflar"), hücrede o günün sınavları tek düğme (ders + hangi şubeler).
 * "Şubeleri aç" ile kademenin şube satırları açılır; tek tek düzenleme oradan. Sütunlar eşit genişlikte.
 */
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
  onAdd?: (classGroupIds: string[], date: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Haftanın dersleri alfabetik sırayla renk alır: aynı hafta içinde aynı ders hep aynı renkte
  const subjectTone = useMemo(() => {
    const list = [...new Set(exams.map((e) => subjectKeyOf(e.subject)))].sort((a, b) => a.localeCompare(b, 'tr'));
    return (subject: string) => SUBJECT_TONES[Math.max(0, list.indexOf(subjectKeyOf(subject))) % SUBJECT_TONES.length]!;
  }, [exams]);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  // Hafta sonu sınavı varsa sütun eklenir
  for (const extra of [5, 6]) if (exams.some((e) => e.date === addDays(monday, extra))) days.push(addDays(monday, extra));
  const levels = useMemo(() => {
    const main = mainClassProgram(classes.map((c) => c.name));
    const map = new Map<string, { key: string; label: string; classes: { id: string; name: string }[] }>();
    for (const raw of [...classes].sort((a, b) => compareClassNames(a.name, b.name))) {
      // Okulun ana programının öneki yazılmaz (ör. AMP), diğerleri kalır (ör. ATP)
      const c = { id: raw.id, name: classDisplayName(raw.name, main) };
      const p = parseClassName(c.name);
      const key = p ? `${p.program ? `${p.program} ` : ''}${p.grade}` : `#${c.name}`;
      const g = map.get(key) ?? { key, label: p ? `${key}. Sınıflar` : c.name, classes: [] };
      g.classes.push(c);
      map.set(key, g);
    }
    return [...map.values()];
  }, [classes]);
  if (!classes.length) return <EmptyState icon={<ClipboardCheck className="size-6" />} title="Sınıf yok" description="Önce Öğretmenler ve Sınıflar sayfasından sınıf ekleyin." />;
  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const cellClass = (empty: boolean, many: boolean) =>
    clsx('h-16 rounded-xl bg-slate-50 p-1 align-top', onAdd && empty && 'cursor-pointer hover:bg-slate-100', many && 'ring-2 ring-amber-300');

  return (
    <div className="overflow-x-auto rounded-3xl bg-surface p-3 ring-1 ring-slate-200/70">
      <table className="rt-scroll w-full min-w-[720px] table-fixed border-separate border-spacing-1.5 text-xs">
        <thead>
          <tr>
            <th className="w-32" />
            {days.map((d) => (
              <th key={d} className="px-1 pb-1 text-left text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                {fmtDay(d, { weekday: 'short', day: 'numeric' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map((lv) => {
            const ids = new Set(lv.classes.map((c) => c.id));
            const isOpen = open.has(lv.key);
            const single = lv.classes.length === 1;
            return (
              <Fragment key={lv.key}>
                <tr>
                  <th className="pr-2 text-left align-middle">
                    <span className="block truncate text-sm font-extrabold text-ink">{single ? lv.classes[0]!.name : lv.label}</span>
                    {!single && (
                      <button type="button" aria-expanded={isOpen} onClick={() => toggle(lv.key)} className="text-[11px] font-semibold text-slate-400 hover:text-ink">
                        {isOpen ? 'şubeleri kapat ▴' : 'şubeleri aç ▾'}
                      </button>
                    )}
                  </th>
                  {days.map((d) => {
                    const dayExams = exams.filter((e) => ids.has(e.classGroupId) && e.date === d).sort((a, b) => a.periodNo - b.periodNo);
                    const groups = groupExams(dayExams);
                    // Aynı şubenin aynı gün birden çok sınavı varsa uyarı çerçevesi
                    const perClass = new Map<string, number>();
                    for (const e of dayExams) perClass.set(e.classGroupId, (perClass.get(e.classGroupId) ?? 0) + 1);
                    const many = [...perClass.values()].some((n) => n > 1);
                    return (
                      <td
                        key={d}
                        className={cellClass(!dayExams.length, many)}
                        onClick={() => !dayExams.length && onAdd?.([...ids], d)}
                        title={many ? 'Bir şubenin aynı gün birden çok sınavı var' : undefined}
                      >
                        <div className={groups.length > 1 ? 'space-y-0.5' : 'space-y-1'}>
                          {groups.map((g) => {
                            const first = g.items[0]!;
                            const multi = g.items.length > 1;
                            const sections = g.classNames.map((n) => parseClassName(n)?.section ?? n);
                            const sub = single
                              ? `${EXAM_KINDS[first.kind]}${first.start ? ` · ${first.start}` : ''}`
                              : multi
                                ? `Şube ${sections.join(', ')}`
                                : `Yalnız ${first.classLabel}`;
                            const warnings = g.items.flatMap((e) => e.warnings.map((w) => (multi ? `${e.classLabel}: ${w}` : w)));
                            return (
                              <button
                                key={g.key}
                                type="button"
                                title={`${g.samePeriod ? `${first.periodNo}. ders` : examGroupPeriods(g)} · ${first.subject} · ${EXAM_KINDS[first.kind]}${first.start && g.samePeriod ? ` · ${first.start}` : ''}\n${g.classNames.join(', ')}`}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (multi) toggle(lv.key);
                                  else onOpen?.(first);
                                }}
                                className={clsx('block w-full min-w-0 rounded-lg text-left leading-tight font-bold', groups.length > 1 ? 'px-2 py-0.5' : 'px-2 py-1', subjectTone(first.subject))}
                              >
                                <span className="flex min-w-0 items-center justify-between gap-1">
                                  <span className="truncate">
                                    {g.samePeriod ? `${first.periodNo}. ders` : examGroupPeriods(g)} · {first.subject}
                                  </span>
                                  <WarnIcon warnings={warnings} />
                                </span>
                                <span className="block truncate text-[10.5px] font-semibold opacity-80">{sub}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {isOpen &&
                  lv.classes.map((c) => (
                    <tr key={c.id}>
                      <th className="pr-2 pl-3 text-left text-[13px] font-bold text-slate-500">
                        <span className="mr-1 text-slate-400">↳</span>
                        {c.name}
                      </th>
                      {days.map((d) => {
                        const cell = exams.filter((e) => e.classGroupId === c.id && e.date === d).sort((a, b) => a.periodNo - b.periodNo);
                        return (
                          <td key={d} className={clsx(cellClass(!cell.length, cell.length > 1), 'h-12 bg-slate-50/60')} onClick={() => !cell.length && onAdd?.([c.id], d)}>
                            <div className="space-y-0.5">
                              {cell.map((e) => (
                                <button
                                  key={e.id}
                                  type="button"
                                  title={`${e.periodNo}. ders · ${e.subject} · ${EXAM_KINDS[e.kind]}${e.start ? ` · ${e.start}` : ''}`}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    onOpen?.(e);
                                  }}
                                  className={clsx('block w-full min-w-0 rounded-lg px-2 py-0.5 text-left leading-tight font-bold', subjectTone(e.subject))}
                                >
                                  <span className="flex min-w-0 items-center justify-between gap-1">
                                    <span className="truncate">
                                      {e.periodNo}. ders · {e.subject}
                                    </span>
                                    <WarnIcon warnings={e.warnings} />
                                  </span>
                                </button>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Sınav ekle / düzenle: kaydedilince saat, gözetmen ve uyarılar sunucudan hesaplanmış döner */
const chip = 'h-8 rounded-full px-3 text-[13px] font-bold transition-colors';
const chipOn = 'bg-ink text-surface';
const chipOff = 'bg-surface text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100';

function ExamDialog({ exam, options, onClose }: { exam: Partial<ScheduledExam> & { classGroupIds?: string[] }; options: Options; onClose: () => void }) {
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
  // Eklerken birden çok şube seçilebilir (kademe ya da tek tek); düzenlemede tek şube
  const adding = !exam.id;
  const [classIds, setClassIds] = useState<string[]>(exam.classGroupIds ?? (exam.classGroupId ? [exam.classGroupId] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = adding ? classIds : v.classGroupId ? [v.classGroupId] : [];
  const multi = chosen.length > 1;
  const subjects = chosen.length
    ? [...new Set(chosen.flatMap((id) => options.subjectsByClass[id] ?? []))].sort((a, b) => a.localeCompare(b, 'tr'))
    : options.subjects;
  const sortedClasses = useMemo(() => {
    const main = mainClassProgram(options.classes.map((c) => c.name));
    return [...options.classes].sort((a, b) => compareClassNames(a.name, b.name)).map((c) => ({ id: c.id, name: classDisplayName(c.name, main) }));
  }, [options.classes]);
  // Kademeler: "9. sınıflar", "AMP 10. sınıflar" (sınıf adlarından; okula özel sabit yok)
  const levels = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of sortedClasses) {
      const p = parseClassName(c.name);
      if (!p) continue;
      const label = `${p.program ? `${p.program} ` : ''}${p.grade}. Sınıflar`;
      map.set(label, [...(map.get(label) ?? []), c.id]);
    }
    return [...map].filter(([, ids]) => ids.length > 1);
  }, [sortedClasses]);
  const toggleClass = (id: string) => setClassIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleLevel = (ids: string[]) => setClassIds((cur) => (ids.every((id) => cur.includes(id)) ? cur.filter((x) => !ids.includes(x)) : [...new Set([...cur, ...ids])]));
  const refresh = () => qc.invalidateQueries({ queryKey: [schoolId, 'exam-schedule'] });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const base = { ...v, proctorTeacherId: multi ? null : v.proctorTeacherId || null, note: v.note || null };
      const body = adding ? { ...base, classGroupId: multi ? undefined : chosen[0], classGroupIds: multi ? chosen : undefined } : base;
      const res = await api<ScheduledExam | { exams: ScheduledExam[] }>(exam.id ? `${path}/${exam.id}` : path, { method: exam.id ? 'PUT' : 'POST', body });
      await refresh();
      const saved = 'exams' in res ? res.exams : [res];
      const warn = saved.find((e) => e.warnings.length);
      const first = saved[0]!;
      if (warn) toast.error(`Kaydedildi, ama kontrol edin: ${saved.length > 1 ? `${warn.classLabel}: ` : ''}${warn.warnings[0]}`);
      else
        toast.success(
          saved.length > 1
            ? `Kaydedildi · ${saved.length} şube (${saved.map((e) => e.classLabel).join(', ')}) ${first.subject}, ${first.periodNo}. ders`
            : `Kaydedildi · ${first.classLabel} ${first.subject}, ${first.periodNo}. ders${first.start ? ` (${first.start})` : ''}`,
        );
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
      subtitle: `${exam.classLabel} · ${exam.subject}`,
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
              variant="delete"
              className="mr-auto"
              icon={<Trash2 className="size-4" />}
              onClick={() => void remove()}
            >
              Sınavı sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} disabled={!v.date || !chosen.length || !v.subject.trim()} onClick={() => void save()}>
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
        {adding ? (
          <div className="sm:col-span-2">
            <Field
              label="Sınıflar"
              help={
                multi
                  ? `${chosen.length} şube seçildi: her şube için ayrı kayıt açılır, gözetmen o saatte o şubede dersi olan öğretmenden bulunur. Listede tek satır görünür.`
                  : 'Bir kademenin bütün şubeleri ya da birkaç şube seçilebilir.'
              }
            >
              {() => (
                <div className="space-y-2">
                  {levels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {levels.map(([label, ids]) => {
                        const on = ids.every((id) => classIds.includes(id));
                        return (
                          <button key={label} type="button" aria-pressed={on} onClick={() => toggleLevel(ids)} className={clsx(chip, on ? chipOn : chipOff)}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {sortedClasses.map((c) => {
                      const on = classIds.includes(c.id);
                      return (
                        <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleClass(c.id)} className={clsx(chip, on ? chipOn : chipOff)}>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Field>
          </div>
        ) : (
          <Field label="Sınıf">
            {(id) => (
              <Select id={id} value={v.classGroupId} onChange={(e) => setV({ ...v, classGroupId: e.target.value })}>
                <option value="">Sınıf seçin</option>
                {sortedClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Ders" help={chosen.some((id) => options.subjectsByClass[id]) ? 'Öneriler seçilen sınıfların ders programından' : undefined}>
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
        <Field
          label="Gözetmen"
          help={multi ? 'Birden çok şubede her şubenin gözetmeni o saatteki dersinden bulunur; gerekirse eklendikten sonra şube şube değiştirin.' : 'Boş bırakılırsa o saatte o sınıfta dersi olan öğretmen gözetmen olur.'}
        >
          {(id) => (
            <Select id={id} value={multi ? '' : v.proctorTeacherId} disabled={multi} onChange={(e) => setV({ ...v, proctorTeacherId: e.target.value })}>
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
        <span className="text-slate-400">—</span>
        {step(2, 'Önizleme', p ? 'on' : 'off')}
        <span className="text-slate-400">—</span>
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
              <table className="rt-scroll min-w-full text-sm">
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
                      <td className="px-3 py-2 text-slate-600">
                        {r.proctors.length ? r.proctors.map((p) => <span key={p} className="block">{p}</span>) : '—'}
                      </td>
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

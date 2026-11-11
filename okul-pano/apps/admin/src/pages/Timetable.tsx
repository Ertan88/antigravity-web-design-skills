import { classLongName, compareClassNames, gradeOf, timetableEntrySchema, WEEKDAY_NAMES, WEEKDAY_SHORT, type Period } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarClock, FileUp, Pencil, Plus, Trash2, Users } from '../components/icons.tsx';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast.tsx';
import { ClassesPanel } from './timetable/ClassesPanel.tsx';
import { ClearDialog, type ClearScope } from './timetable/ClearDialog.tsx';
import { EokulImport } from './timetable/EokulImport.tsx';
import { Alert, Button, Card, DeleteButton, EmptyState, Field, IconButton, Input, Modal, PageHeader, Segmented, Select, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { nameMap, useList, useSchoolPath, type BellSchedule, type ClassGroup, type Teacher, type TimetableEntry } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';

type CellForm = { subject: string; teacherId: string; teacherId2: string };

export function Timetable() {
  const { can, schoolId } = useAuth();
  const editable = can('schedule.manage');
  const path = useSchoolPath('timetable');
  const qc = useQueryClient();
  const toast = useToast();

  const classes = useList<ClassGroup>('classes');
  const teachers = useList<Teacher>('teachers');
  const schedules = useList<BellSchedule>('bell-schedules');
  const entries = useList<TimetableEntry>('timetable');

  const [mode, setMode] = useState<'class' | 'teacher'>('class');
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [cell, setCell] = useState<{ weekday: number; period: Period; entries: TimetableEntry[] } | null>(null);
  const form = useForm<CellForm>({ subject: '', teacherId: '', teacherId2: '' });
  const [pdf, setPdf] = useState<File | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [classesOpen, setClassesOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<ClearScope | null>(null);

  // e-Okul adları birebir ("AMP 9-A", "ATP 9-A"); açılır kutuda düzeye göre gruplanır
  const sortedClasses = useMemo(() => [...(classes.data ?? [])].sort((a, b) => compareClassNames(a.name, b.name)), [classes.data]);
  const classGroupsByGrade = useMemo(() => {
    const groups = new Map<string, ClassGroup[]>();
    for (const c of sortedClasses) {
      const g = gradeOf(c.name);
      const label = g === null ? 'Diğer' : `${g}. sınıflar`;
      groups.set(label, [...(groups.get(label) ?? []), c]);
    }
    return [...groups];
  }, [sortedClasses]);
  const sortedTeachers = useMemo(() => [...(teachers.data ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr')), [teachers.data]);
  // Varsayılan: programı olan ilk sınıf
  const withLessons = new Set((entries.data ?? []).map((e) => e.classGroupId));
  const activeClass = (classId && classes.data?.some((c) => c.id === classId) ? classId : '') || sortedClasses.find((c) => withLessons.has(c.id))?.id || sortedClasses[0]?.id || '';
  const activeTeacher = (teacherId && teachers.data?.some((t) => t.id === teacherId) ? teacherId : '') || sortedTeachers[0]?.id || '';
  const teacherNames = nameMap(teachers.data, (t) => t.fullName);
  const classNames = nameMap(classes.data, (c) => c.name);

  // Satırlar: zil düzenlerindeki ders numaralarının birleşimi (saatler en uzun otomatik düzenden);
  // sütunlar: hafta içi her zaman, hafta sonu yalnızca programda dersi ya da sabit zili varsa
  const { periods, weekdays } = useMemo(() => {
    const byNo = new Map<number, Period>();
    const days = new Set([1, 2, 3, 4, 5]);
    const ordered = [...(schedules.data ?? [])].sort(
      (a, b) => Number(a.shift === 'afternoon') - Number(b.shift === 'afternoon') || Number(a.weekdays.length > 0) - Number(b.weekdays.length > 0) || b.periods.length - a.periods.length,
    );
    for (const s of ordered) {
      s.weekdays.forEach((d) => days.add(d));
      for (const p of s.periods) if (!byNo.has(p.no)) byNo.set(p.no, p);
    }
    for (const e of entries.data ?? []) days.add(e.weekday);
    // Zil çizelgesinde olmayan ama programda dersi bulunan saatler de gösterilir (silinip düzeltilebilsin)
    if (byNo.size) for (const e of entries.data ?? []) if (!byNo.has(e.periodNo)) byNo.set(e.periodNo, { no: e.periodNo, start: '', end: '' } as Period);
    return {
      periods: [...byNo.values()].sort((a, b) => a.no - b.no),
      weekdays: [...days].sort(),
    };
  }, [schedules.data, entries.data]);

  const lookup = useMemo(() => {
    const m = new Map<string, TimetableEntry[]>();
    for (const e of entries.data ?? []) {
      const key = mode === 'class' ? (e.classGroupId === activeClass ? `${e.weekday}-${e.periodNo}` : null) : e.teacherId === activeTeacher ? `${e.weekday}-${e.periodNo}` : null;
      if (key) m.set(key, [...(m.get(key) ?? []), e]);
    }
    return m;
  }, [entries.data, mode, activeClass, activeTeacher]);

  const subjects = useMemo(() => [...new Set((entries.data ?? []).map((e) => e.subject))].sort((a, b) => a.localeCompare(b, 'tr')), [entries.data]);

  const save = useMutation({
    mutationFn: (body: unknown) => api(`${path}/cell`, { method: 'PUT', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'timetable'] });
      setCell(null);
    },
  });
  // Hücredeki bütün kayıtlar (bölünmüş sınıf, dallar) birlikte kaldırılır
  const clear = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api(`${path}/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'timetable'] });
      setCell(null);
      toast.success('Ders kaldırıldı');
    },
    onError: (e) => toast.error(e.message),
  });

  const openCell = (weekday: number, period: Period) => {
    const entries = lookup.get(`${weekday}-${period.no}`) ?? [];
    const teacherIds = [...new Set(entries.map((e) => e.teacherId).filter((x): x is string => Boolean(x)))];
    form.reset({ subject: entries[0]?.subject ?? '', teacherId: teacherIds[0] ?? '', teacherId2: teacherIds[1] ?? '' });
    setCell({ weekday, period, entries });
  };

  const submit = async () => {
    if (!cell) return;
    const payload = form.validate(timetableEntrySchema, {
      weekday: cell.weekday,
      periodNo: cell.period.no,
      classGroupId: activeClass,
      subject: form.values.subject,
      teacherId: form.values.teacherId || null,
      extraTeacherIds: form.values.teacherId2 && form.values.teacherId2 !== form.values.teacherId ? [form.values.teacherId2] : [],
    });
    if (!payload) return;
    try {
      await save.mutateAsync(payload);
    } catch (err) {
      form.fail(err);
    }
  };

  const loading = classes.isLoading || schedules.isLoading || entries.isLoading;
  const lessonCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries.data ?? []) m.set(e.classGroupId, (m.get(e.classGroupId) ?? 0) + 1);
    return m;
  }, [entries.data]);
  // Ders saati sayısı: bölünmüş derste aynı hücrenin iki kaydı tek saat sayılır
  const hourCount = useMemo(() => new Set([...lookup.keys()]).size, [lookup]);
  const clearCount = !clearTarget
    ? 0
    : clearTarget.scope === 'all'
      ? (entries.data ?? []).length
      : (entries.data ?? []).filter((e) => (clearTarget.scope === 'class' ? e.classGroupId : e.teacherId) === clearTarget.id).length;
  const activeClassName = classNames.get(activeClass) ?? '';
  const activeTeacherName = teacherNames.get(activeTeacher) ?? '';

  return (
    <>
      <PageHeader
        title="Ders Programı ve Sınıflar"
        description="Sınıf seçip programını düzenleyin ya da e-Okul'dan indirdiğiniz ders programı PDF'ini yükleyin. Pano, zil saatine göre o anda hangi sınıfta hangi dersin ve öğretmenin olduğunu gösterir; teneffüste sıradaki dersi gösterir."
        actions={
          (editable || can('directory.manage')) && (
            <>
              {can('directory.manage') && (
                <Button variant="secondary" icon={<Users className="size-4" />} onClick={() => setClassesOpen(true)}>
                  Sınıflar
                </Button>
              )}
              {editable && (
                <>
              <input
                ref={pdfInput}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  setPdf(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              <Button variant="secondary" icon={<FileUp className="size-4" />} onClick={() => pdfInput.current?.click()}>
                e-Okul PDF'i yükle
              </Button>
              <Button
                variant="delete"
                icon={<Trash2 className="size-4" />}
                disabled={!entries.data?.length}
                onClick={() => setClearTarget({ scope: 'all' })}
              >
                Bütün programı sil
              </Button>
                </>
              )}
            </>
          )
        }
      />
      <EokulImport file={pdf} onClose={() => setPdf(null)} />
      <ClearDialog target={clearTarget} count={clearCount} onClose={() => setClearTarget(null)} />
      <Modal open={classesOpen} onClose={() => setClassesOpen(false)} title="Sınıflar" description="Şubeleri ekleyin, yeniden adlandırın ya da silin. Bir sınıfa tıklayınca programı açılır.">
        <ClassesPanel
          classes={classes.data ?? []}
          activeId={activeClass}
          onSelect={(id) => {
            setClassId(id);
            setMode('class');
            setClassesOpen(false);
          }}
          editable={can('directory.manage')}
          lessonCounts={lessonCounts}
        />
      </Modal>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {!periods.length ? (
            <Card>
              <EmptyState
                icon={<CalendarClock className="size-6" />}
                title="Önce zil saatlerini tanımlayın"
                description="Ders programı tablosunun satırları zil çizelgesindeki ders saatlerinden oluşur."
                action={
                  <Link to="/zil-saatleri">
                    <Button variant="secondary">Zil saatleri</Button>
                  </Link>
                }
              />
            </Card>
          ) : !classes.data?.length ? (
            <Card>
              <EmptyState
                icon={<CalendarClock className="size-6" />}
                title="Sınıf ekleyin"
                description="e-Okul ders programı PDF'ini yükleyin; sınıflar e-Okul'daki adlarıyla eklenir. Ya da Sınıflar düğmesinden şubeleri elle ekleyin."
                action={
                  can('directory.manage') ? (
                    <Button variant="secondary" icon={<Users className="size-4" />} onClick={() => setClassesOpen(true)}>
                      Sınıflar
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
        <Card>
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center [&>*:first-child]:shrink-0">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'class', label: 'Sınıfa Göre' },
                { value: 'teacher', label: 'Öğretmene Göre' },
              ]}
            />
            {mode === 'class' ? (
              <Select value={activeClass} onChange={(e) => setClassId(e.target.value)} className="sm:w-60" aria-label="Sınıf">
                {classGroupsByGrade.map(([label, list]) => (
                  <optgroup key={label} label={label}>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {lessonCounts.get(c.id) ? '' : ' · program yok'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            ) : (
              <Select value={activeTeacher} onChange={(e) => setTeacherId(e.target.value)} className="sm:w-64" aria-label="Öğretmen">
                {sortedTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </Select>
            )}
            {mode === 'class' && activeClass && (
              <AdvisorSelect
                classGroup={(classes.data ?? []).find((c) => c.id === activeClass)}
                teachers={sortedTeachers}
                editable={editable}
              />
            )}
            <span className="text-xs whitespace-nowrap text-slate-500 tabular-nums">{hourCount} ders saati</span>
            {editable && hourCount > 0 && (
              <Button
                variant="delete"
                size="sm"
                className="sm:ml-auto"
                icon={<Trash2 className="size-4" />}
                onClick={() =>
                  setClearTarget(mode === 'class' ? { scope: 'class', id: activeClass, name: activeClassName } : { scope: 'teacher', id: activeTeacher, name: activeTeacherName })
                }
              >
                {mode === 'class' ? 'Bu sınıfın programını sil' : 'Bu öğretmenin derslerini sil'}
              </Button>
            )}
          </div>
          <div className="overflow-x-auto p-3 sm:p-5">
            <table className="rt-scroll w-full min-w-[760px] table-fixed border-separate border-spacing-1.5 text-sm">
              <thead>
                <tr>
                  <th className="w-20" />
                  {weekdays.map((d) => (
                    <th key={d} className="pb-1 text-center text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      <span className="hidden md:inline">{WEEKDAY_NAMES[d]}</span>
                      <span className="md:hidden">{WEEKDAY_SHORT[d]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.no}>
                    <td className="pr-2 align-middle">
                      <div className="font-semibold">{p.no}. ders</div>
                      {p.start && (
                        <div className="text-xs text-slate-500 tabular-nums">
                          {p.start}–{p.end}
                        </div>
                      )}
                    </td>
                    {weekdays.map((d) => {
                      const list = lookup.get(`${d}-${p.no}`) ?? [];
                      const e = list[0];
                      const lines = cellLines(list, teacherNames);
                      return (
                        <td key={d} className="p-0 align-top">
                          <div
                            className={clsx(
                              'group relative flex h-full min-h-16 w-full flex-col justify-center gap-1 rounded-lg px-2.5 py-1.5 text-left',
                              e ? 'bg-brand-50 ring-1 ring-brand-100' : 'items-center bg-slate-50 ring-1 ring-slate-100',
                            )}
                          >
                            {e ? (
                              mode === 'class' ? (
                                <>
                                  {lines.map((l) => (
                                    <div key={l.key} className={clsx('min-w-0', editable && 'pr-6')}>
                                      {l.group && <div className="line-clamp-1 text-[10.5px] font-bold tracking-wide text-slate-400 uppercase">{l.group}</div>}
                                      <div className="line-clamp-3 leading-snug font-semibold break-words text-ink" title={l.subject}>
                                        {l.subject}
                                      </div>
                                      <div className="line-clamp-2 text-xs leading-snug break-words text-slate-500" title={l.teachers || undefined}>
                                        {l.teachers || 'Öğretmen yok'}
                                      </div>
                                    </div>
                                  ))}
                                  {editable && (
                                    <div className="absolute top-0.5 right-0.5 flex flex-col">
                                      <IconButton label="Düzenle" className="size-7 hover:bg-surface" onClick={() => openCell(d, p)}>
                                        <Pencil className="size-3.5" />
                                      </IconButton>
                                      <DeleteButton className="size-7" label="Dersi sil" what="Bu ders" onConfirm={() => clear.mutate(list.map((x) => x.id))} />
                                    </div>
                                  )}
                                </>
                              ) : (
                                teacherLines(list, classNames).map((l) => (
                                  <div key={l.key} className="min-w-0">
                                    <div className="line-clamp-3 leading-snug font-semibold break-words text-ink" title={l.subject}>
                                      {l.group ? `${l.group}: ` : ''}
                                      {l.subject}
                                    </div>
                                    <div className="line-clamp-2 text-xs leading-snug break-words text-slate-500" title={l.className}>
                                      {l.className}
                                    </div>
                                  </div>
                                ))
                              )
                            ) : (
                              editable &&
                              mode === 'class' && (
                                <IconButton label="Ders ekle" className="size-8 text-slate-300 hover:bg-surface hover:text-brand-600" onClick={() => openCell(d, p)}>
                                  <Plus className="size-4" />
                                </IconButton>
                              )
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
          )}
        </>
      )}

      <Modal
        open={Boolean(cell)}
        onClose={() => setCell(null)}
        title={cell ? `${classNames.get(activeClass)} · ${WEEKDAY_NAMES[cell.weekday]} · ${cell.period.no}. ders` : ''}
        description={cell?.period.start ? `${cell.period.start} – ${cell.period.end}` : undefined}
        footer={
          <>
            {cell && cell.entries.length > 0 && (
              <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => clear.mutate(cell.entries.map((x) => x.id))}>
                Dersi kaldır
              </Button>
            )}
            <Button variant="secondary" onClick={() => setCell(null)}>
              Vazgeç
            </Button>
            <Button loading={save.isPending} onClick={() => void submit()}>
              Kaydet
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {form.errors._form && <Alert tone="red">{form.errors._form}</Alert>}
          {cell && new Set(cell.entries.map((x) => `${x.groupLabel ?? ''}|${x.subject}`)).size > 1 && (
            <Alert tone="amber">
              Bu saatte sınıfın bölümleri farklı ders görüyor ({cellLines(cell.entries, teacherNames).map((l) => `${l.group ? `${l.group}: ` : ''}${l.subject}`).join(' · ')}). Kaydederseniz
              hepsinin yerine tek ders yazılır.
            </Alert>
          )}
          <Field label="Ders" error={form.errors.subject}>
            {(id) => (
              <>
                <Input id={id} list="tt-subjects" value={form.values.subject} onChange={(e) => form.set('subject', e.target.value)} placeholder="ör. Matematik" autoFocus />
                <datalist id="tt-subjects">
                  {subjects.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Öğretmen" error={form.errors.teacherId} help="Aynı öğretmen aynı saatte iki sınıfa yazılamaz; sistem çakışmayı uyarır.">
            {(id) => (
              <Select id={id} value={form.values.teacherId} onChange={(e) => form.set('teacherId', e.target.value)}>
                <option value="">Seçilmedi</option>
                {(teachers.data ?? [])
                  .filter((t) => t.isActive || t.id === form.values.teacherId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                      {t.branch ? ` · ${t.branch}` : ''}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="2. öğretmen (bölünmüş sınıf)" help="Öğrenci sayısı fazla olduğu için ikiye bölünen derslerde ikinci öğretmen.">
            {(id) => (
              <Select id={id} value={form.values.teacherId2} onChange={(e) => form.set('teacherId2', e.target.value)}>
                <option value="">Yok</option>
                {(teachers.data ?? [])
                  .filter((t) => (t.isActive || t.id === form.values.teacherId2) && t.id !== form.values.teacherId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                      {t.branch ? ` · ${t.branch}` : ''}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </>
  );
}

/**
 * Hücrenin satırları: aynı ders (ve dal) bir satır, öğretmenleri virgülle; dallara ayrılan saatte her dalın dersi
 * ayrı satır.
 */
function cellLines(list: TimetableEntry[], teacherNames: Map<string, string>) {
  const lines = new Map<string, { key: string; group: string | null; subject: string; names: string[] }>();
  for (const e of list) {
    const key = `${e.groupLabel ?? ''}|${e.subject}`;
    let line = lines.get(key);
    if (!line) lines.set(key, (line = { key, group: e.groupLabel, subject: e.subject, names: [] }));
    const name = e.teacherId ? teacherNames.get(e.teacherId) : null;
    if (name && !line.names.includes(name)) line.names.push(name);
  }
  return [...lines.values()].map((l) => ({ ...l, teachers: l.names.join(', ') }));
}

/**
 * Öğretmene göre görünümde hücre: aynı saatte birleştirilmiş sınıflar tek satırda ("AMP 11-ACM"), ders adı bir kez.
 */
function teacherLines(list: TimetableEntry[], classNames: Map<string, string>) {
  const lines = new Map<string, { key: string; group: string | null; subject: string; names: string[] }>();
  for (const e of list) {
    const key = `${e.groupLabel ?? ''}|${e.subject}`;
    let line = lines.get(key);
    if (!line) lines.set(key, (line = { key, group: e.groupLabel, subject: e.subject, names: [] }));
    line.names.push(classNames.get(e.classGroupId) ?? '');
  }
  // "AMP 10. Sınıf / C Şubesi"; birleştirilmiş sınıflar "AMP 11. Sınıf / A, C, M Şubeleri"
  return [...lines.values()].map((l) => ({ ...l, className: classLongName(l.names.filter(Boolean)) }));
}

/** Sınıfın rehber öğretmeni: değişince öğretmeni boş rehberlik dersleri ona yazılır */
function AdvisorSelect({ classGroup, teachers, editable }: { classGroup: ClassGroup | undefined; teachers: Teacher[]; editable: boolean }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('classes');
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (teacherId: string | null) => api(`${path}/${classGroup!.id}/advisor`, { method: 'PUT', body: { teacherId } }),
    onSuccess: (_d, teacherId) => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'classes'] });
      void qc.invalidateQueries({ queryKey: [schoolId, 'timetable'] });
      toast.success(teacherId ? 'Rehber öğretmen kaydedildi' : 'Rehber öğretmen kaldırıldı');
    },
    onError: (e) => toast.error(e.message),
  });
  if (!classGroup) return null;
  return (
    <label className="flex items-center gap-2 text-xs font-semibold whitespace-nowrap text-slate-500">
      Rehber öğretmeni
      <Select
        value={classGroup.advisorTeacherId ?? ''}
        disabled={!editable || save.isPending}
        onChange={(e) => save.mutate(e.target.value || null)}
        className="h-9 w-48 text-sm font-medium"
        aria-label="Rehber öğretmeni"
      >
        <option value="">Seçilmedi</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.fullName}
          </option>
        ))}
      </Select>
    </label>
  );
}

import { timetableEntrySchema, WEEKDAY_NAMES, WEEKDAY_SHORT, type Period } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarClock, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast.tsx';
import { Alert, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { nameMap, useList, useSchoolPath, type BellSchedule, type ClassGroup, type Teacher, type TimetableEntry } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';

type CellForm = { subject: string; teacherId: string };

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
  const [cell, setCell] = useState<{ weekday: number; period: Period; entry: TimetableEntry | null } | null>(null);
  const form = useForm<CellForm>({ subject: '', teacherId: '' });

  const activeClass = classId || classes.data?.[0]?.id || '';
  const activeTeacher = teacherId || teachers.data?.[0]?.id || '';
  const teacherNames = nameMap(teachers.data, (t) => t.fullName);
  const classNames = nameMap(classes.data, (c) => c.name);

  // Satırlar: tüm çizelgelerdeki ders numaralarının birleşimi; sütunlar: çizelgelerin kapsadığı günler
  const { periods, weekdays } = useMemo(() => {
    const byNo = new Map<number, Period>();
    const days = new Set<number>();
    for (const s of schedules.data ?? []) {
      s.weekdays.forEach((d) => days.add(d));
      for (const p of s.periods) if (!byNo.has(p.no)) byNo.set(p.no, p);
    }
    return {
      periods: [...byNo.values()].sort((a, b) => a.no - b.no),
      weekdays: days.size ? [...days].sort() : [1, 2, 3, 4, 5],
    };
  }, [schedules.data]);

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
  const clear = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [schoolId, 'timetable'] });
      setCell(null);
      toast.success('Ders kaldırıldı');
    },
    onError: (e) => toast.error(e.message),
  });

  const openCell = (weekday: number, period: Period) => {
    if (!editable || mode !== 'class') return;
    const entry = lookup.get(`${weekday}-${period.no}`)?.[0] ?? null;
    form.reset({ subject: entry?.subject ?? '', teacherId: entry?.teacherId ?? '' });
    setCell({ weekday, period, entry });
  };

  const submit = async () => {
    if (!cell) return;
    const payload = form.validate(timetableEntrySchema, {
      weekday: cell.weekday,
      periodNo: cell.period.no,
      classGroupId: activeClass,
      subject: form.values.subject,
      teacherId: form.values.teacherId || null,
    });
    if (!payload) return;
    try {
      await save.mutateAsync(payload);
    } catch (err) {
      form.fail(err);
    }
  };

  const loading = classes.isLoading || schedules.isLoading || entries.isLoading;
  const missing = !loading && (!classes.data?.length || !periods.length);

  return (
    <>
      <PageHeader
        title="Ders Programı"
        description="Pano, zil saatine göre o anda hangi sınıfta hangi dersin ve öğretmenin olduğunu sağ sütunda gösterir. Teneffüste sıradaki dersi gösterir."
      />

      {loading ? (
        <Spinner />
      ) : missing ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="size-6" />}
            title="Önce sınıfları ve zil saatlerini tanımlayın"
            description="Ders programı tablosu, sınıflar ve zil çizelgesindeki ders saatlerinden oluşur."
            action={
              <div className="flex gap-2">
                <Link to="/siniflar">
                  <Button variant="secondary">Sınıflar</Button>
                </Link>
                <Link to="/zil-saatleri">
                  <Button variant="secondary">Zil saatleri</Button>
                </Link>
              </div>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'class', label: 'Sınıfa göre' },
                { value: 'teacher', label: 'Öğretmene göre' },
              ]}
            />
            {mode === 'class' ? (
              <Select value={activeClass} onChange={(e) => setClassId(e.target.value)} className="sm:w-48" aria-label="Sınıf">
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Select value={activeTeacher} onChange={(e) => setTeacherId(e.target.value)} className="sm:w-64" aria-label="Öğretmen">
                {(teachers.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </Select>
            )}
            {mode === 'class' && editable && <span className="text-xs text-slate-500 sm:ml-auto">Düzenlemek için bir hücreye tıklayın</span>}
          </div>
          <div className="overflow-x-auto p-3 sm:p-5">
            <table className="w-full min-w-[640px] border-separate border-spacing-1.5 text-sm">
              <thead>
                <tr>
                  <th className="w-24" />
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
                      <div className="text-xs text-slate-500 tabular-nums">
                        {p.start}–{p.end}
                      </div>
                    </td>
                    {weekdays.map((d) => {
                      const list = lookup.get(`${d}-${p.no}`) ?? [];
                      const e = list[0];
                      return (
                        <td key={d} className="p-0">
                          <button
                            type="button"
                            disabled={!editable || mode !== 'class'}
                            onClick={() => openCell(d, p)}
                            className={clsx(
                              'flex h-16 w-full flex-col items-start justify-center rounded-lg px-2.5 text-left transition-colors',
                              e ? 'bg-brand-50 ring-1 ring-brand-100' : 'bg-slate-50 ring-1 ring-slate-100',
                              editable && mode === 'class' && 'hover:ring-brand-300',
                            )}
                          >
                            {e ? (
                              <>
                                <span className="w-full truncate font-semibold text-slate-900">{mode === 'class' ? e.subject : classNames.get(e.classGroupId)}</span>
                                <span className="w-full truncate text-xs text-slate-500">
                                  {mode === 'class' ? (e.teacherId ? teacherNames.get(e.teacherId) : 'Öğretmen yok') : e.subject}
                                </span>
                              </>
                            ) : (
                              editable && mode === 'class' && <Plus className="size-4 text-slate-300" />
                            )}
                          </button>
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

      <Modal
        open={Boolean(cell)}
        onClose={() => setCell(null)}
        title={cell ? `${classNames.get(activeClass)} · ${WEEKDAY_NAMES[cell.weekday]} · ${cell.period.no}. ders` : ''}
        description={cell ? `${cell.period.start} – ${cell.period.end}` : undefined}
        footer={
          <>
            {cell?.entry && (
              <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => clear.mutate(cell.entry!.id)}>
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
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </>
  );
}

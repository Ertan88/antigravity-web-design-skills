import {
  addIsoDays,
  bellScheduleSchema,
  generatePeriods,
  lessonCounts,
  missingLessonCounts,
  pickSchedule,
  scheduleLessonCount,
  schoolDay,
  WEEKDAY_NAMES,
  type Period,
  type Shift,
} from '@okulpano/shared';
import { BellRing, Plus, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Segmented, Spinner } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { useList, useResource, useSchool, type BellSchedule, type ClassGroup, type TimetableEntry } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';
import { BellClassSettings, ProfileCard, WeekDays, type WeekDay } from './bell/BellPlan.tsx';
import { useUpcomingHolidays, useWeekHolidays } from './bell/HolidaysCard.tsx';
import { ScheduleView, useNow } from './bell/ScheduleView.tsx';

type Form = { name: string; lessonCount: number | ''; periods: Period[] };

const defaultGen = { firstStart: '08:30', lessonMin: 40, breakMin: 10, count: 8, lunchAfter: 5, lunchMin: 45, afternoonBreakMin: '' as number | '' };

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Bir düzenin kuralı (ilk ders, ders süresi, teneffüsler, öğle arası) saatlerinden çıkarılır */
export function deriveRule(periods: readonly Period[]) {
  const ps = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const first = ps[0];
  if (!first) return defaultGen;
  const gaps = ps.slice(1).map((p, i) => toMin(p.start) - toMin(ps[i]!.end));
  const longest = Math.max(0, ...gaps);
  const lunchIdx = longest >= 20 ? gaps.indexOf(longest) : -1;
  const before = gaps.filter((_, i) => lunchIdx < 0 || i < lunchIdx);
  const after = lunchIdx < 0 ? [] : gaps.filter((_, i) => i > lunchIdx);
  const breakMin = before[0] ?? 10;
  return {
    firstStart: first.start,
    lessonMin: toMin(first.end) - toMin(first.start),
    breakMin,
    count: ps.length,
    lunchAfter: lunchIdx < 0 ? 0 : lunchIdx + 1,
    lunchMin: lunchIdx < 0 ? 45 : longest,
    afternoonBreakMin: (after[0] !== undefined && after[0] !== breakMin ? after[0] : '') as number | '',
  };
}

function addMinutes(clock: string, minutes: number): string {
  const [h, m] = clock.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h! * 60 + m! + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function minutesBetween(a: string, b: string) {
  return toMin(b) - toMin(a);
}

function Editor({ form }: { form: ReturnType<typeof useForm<Form>> }) {
  const { values: v, set, errors } = form;
  const [gen, setGen] = useState(() => ({ ...(v.periods.length ? deriveRule(v.periods) : defaultGen), count: Number(v.lessonCount) || v.periods.length || defaultGen.count }));
  const [showGen, setShowGen] = useState(v.periods.length === 0);

  /** i. dersten itibaren tüm derslerin başlangıç ve bitişini kaydırır */
  const shiftFrom = (i: number, minutes: number) =>
    set(
      'periods',
      v.periods.map((p, j) => (j >= i ? { ...p, start: addMinutes(p.start, minutes), end: addMinutes(p.end, minutes) } : p)),
    );
  const updatePeriod = (i: number, patch: Partial<Period>) => set('periods', v.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPeriod = () => {
    const last = v.periods[v.periods.length - 1];
    const no = (last?.no ?? 0) + 1;
    set('periods', [...v.periods, { no, start: last?.end ?? '08:30', end: last?.end ?? '09:10', label: null }]);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <Field label="Düzen adı" error={errors.name}>
          {(id) => <Input id={id} value={v.name} onChange={(ev) => set('name', ev.target.value)} placeholder="ör. 9 derslik gün, Cuma" invalid={Boolean(errors.name)} />}
        </Field>
        <Field label="Kaç derslik gün" error={errors.lessonCount} help="Günün ders sayısı bu olunca seçilir">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={30}
              value={v.lessonCount}
              onChange={(ev) => set('lessonCount', ev.target.value === '' ? '' : Number(ev.target.value))}
              placeholder={String(v.periods.length || '')}
            />
          )}
        </Field>
      </div>

      <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
        <button type="button" onClick={() => setShowGen((s) => !s)} className="flex items-center gap-2 text-sm font-semibold text-brand-700">
          <Wand2 className="size-4" /> Kurala göre otomatik oluştur
        </button>
        {showGen && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="İlk ders">{(id) => <Input id={id} type="time" value={gen.firstStart} onChange={(e) => setGen({ ...gen, firstStart: e.target.value })} />}</Field>
              <Field label="Ders süresi (dk)">{(id) => <Input id={id} type="number" min={10} max={120} value={gen.lessonMin} onChange={(e) => setGen({ ...gen, lessonMin: Number(e.target.value) })} />}</Field>
              <Field label="Teneffüs (dk)">{(id) => <Input id={id} type="number" min={0} max={60} value={gen.breakMin} onChange={(e) => setGen({ ...gen, breakMin: Number(e.target.value) })} />}</Field>
              <Field label="Ders sayısı">{(id) => <Input id={id} type="number" min={1} max={16} value={gen.count} onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })} />}</Field>
              <Field label="Öğle arası şu dersten sonra">{(id) => <Input id={id} type="number" min={0} max={15} value={gen.lunchAfter} onChange={(e) => setGen({ ...gen, lunchAfter: Number(e.target.value) })} />}</Field>
              <Field label="Öğle arası (dk)">{(id) => <Input id={id} type="number" min={0} max={120} value={gen.lunchMin} onChange={(e) => setGen({ ...gen, lunchMin: Number(e.target.value) })} />}</Field>
              <Field label="Öğleden sonra teneffüs (dk)" help="Boşsa sabahki teneffüs süresi">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={60}
                    value={gen.afternoonBreakMin}
                    placeholder={String(gen.breakMin)}
                    onChange={(e) => setGen({ ...gen, afternoonBreakMin: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                )}
              </Field>
            </div>
            <Button
              variant="success"
              icon={<Wand2 className="size-4" />}
              onClick={() => {
                set('periods', generatePeriods({ ...gen, lunchAfter: gen.lunchAfter || null, afternoonBreakMin: gen.afternoonBreakMin === '' ? null : gen.afternoonBreakMin }));
                if (v.lessonCount === '') set('lessonCount', gen.count);
                setShowGen(false);
              }}
            >
              Ders saatlerini oluştur
            </Button>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Ders saatleri</span>
          <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={addPeriod}>
            Ders ekle
          </Button>
        </div>
        {errors.periods && (
          <div className="mb-2">
            <Alert tone="red">{errors.periods}</Alert>
          </div>
        )}
        <div className="space-y-1.5">
          {v.periods.map((p, i) => {
            const next = v.periods[i + 1];
            const gap = next ? minutesBetween(p.end, next.start) : null;
            return (
              <div key={i}>
                <div className="grid grid-cols-[3.5rem_1fr_1fr_1.4fr_auto] items-center gap-2">
                  <Input type="number" min={1} max={30} value={p.no} onChange={(e) => updatePeriod(i, { no: Number(e.target.value) })} aria-label="Ders no" />
                  <Input type="time" value={p.start} onChange={(e) => updatePeriod(i, { start: e.target.value })} aria-label="Başlangıç" />
                  <Input type="time" value={p.end} onChange={(e) => updatePeriod(i, { end: e.target.value })} aria-label="Bitiş" />
                  <Input value={p.label ?? ''} onChange={(e) => updatePeriod(i, { label: e.target.value || null })} placeholder={`${p.no}. Ders`} aria-label="Etiket" />
                  <IconButton label="Sil" onClick={() => set('periods', v.periods.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
                {gap !== null && (
                  <div className="flex items-center gap-2 py-1 pl-16 text-xs text-slate-500">
                    <span className="min-w-28">
                      {gap >= 30 ? 'Öğle arası' : 'Teneffüs'} · <span className="font-semibold text-slate-700 tabular-nums">{gap} dk</span>
                    </span>
                    {/* Arayı uzatıp kısaltır; sonraki tüm dersler birlikte kayar (ör. cuma namazı) */}
                    <button
                      type="button"
                      disabled={gap < 5}
                      onClick={() => shiftFrom(i + 1, -5)}
                      className="rounded-md px-1.5 py-0.5 font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-40"
                      aria-label="Arayı 5 dakika kısalt"
                    >
                      −5
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftFrom(i + 1, 5)}
                      className="rounded-md px-1.5 py-0.5 font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                      aria-label="Arayı 5 dakika uzat"
                    >
                      +5
                    </button>
                    <span className="hidden text-[11px] text-slate-400 sm:inline">sonraki dersler kayar</span>
                  </div>
                )}
              </div>
            );
          })}
          {v.periods.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Henüz ders saati yok. Otomatik oluşturun ya da tek tek ekleyin.</p>}
        </div>
      </div>
    </div>
  );
}

export function BellSchedules() {
  const { can } = useAuth();
  const editable = can('schedule.manage');
  const list = useList<BellSchedule>('bell-schedules');
  const school = useSchool();
  const ops = useResource<BellSchedule>('bell-schedules', 'Zil düzeni');
  const classes = useList<ClassGroup>('classes');
  const timetable = useList<TimetableEntry>('timetable');
  const form = useForm<Form>({ name: '', lessonCount: '', periods: [] });
  const [editing, setEditing] = useState<BellSchedule | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tz = school.data?.timezone ?? 'Europe/Istanbul';
  const now = useNow(tz);
  const settings = school.data?.settings;
  const dual = Boolean(settings?.dualShift);
  const [shiftTab, setShiftTab] = useState<Shift>('morning');
  const shift: Shift = dual ? shiftTab : 'morning';
  const schedules = list.data ?? [];
  const inShift = schedules.filter((s) => (s.shift === 'afternoon' ? 'afternoon' : 'morning') === shift);
  const counts = useMemo(
    () => (timetable.data?.length ? lessonCounts(timetable.data, classes.data ?? [], dual) : null),
    [timetable.data, classes.data, dual],
  );

  // Bu hafta (hafta sonu ders yoksa gelecek hafta); tatil ve arifeler Tatil Takvimi'nden
  const todayIso = now.iso;
  const upcoming = useUpcomingHolidays();
  const weekendNoLessons = now.weekday >= 6 && !counts?.[`${shift}:${now.weekday}`];
  const monday = addIsoDays(todayIso, weekendNoLessons ? 8 - now.weekday : 1 - now.weekday);
  const week = useWeekHolidays(monday);
  const halfDayEnd = settings?.halfDayEnd ?? '13:00';
  const weekdays = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => counts?.[`${shift}:${d}`] || inShift.some((s) => s.weekdays.includes(d)))];
  const cal = { schedules, holidays: week.data?.holidays ?? [], halfDays: week.data?.halfDays ?? [], halfDayEnd, lessonCounts: counts };
  const days: WeekDay[] = weekdays.map((d) => {
    const date = addIsoDays(monday, d - 1);
    const count = counts ? (counts[`${shift}:${d}`] ?? 0) : null;
    const schedule = pickSchedule(schedules, d, { shift, lessonCount: count });
    const sd = schoolDay(date, cal, shift);
    return { weekday: d, date, count, schedule, periods: sd.periods, holiday: sd.holiday, halfDay: sd.halfDay, fixed: Boolean(schedule?.weekdays.includes(d)) };
  });
  const missing = counts ? missingLessonCounts(schedules, counts, shift) : [];

  const todayInfo = days.find((d) => d.date === todayIso);
  const selected = inShift.find((s) => s.id === selectedId) ?? todayInfo?.schedule ?? days.find((d) => d.schedule)?.schedule ?? inShift[0] ?? null;
  const selectedDay = days.find((d) => d.schedule?.id === selected?.id && d.date >= todayIso) ?? days.find((d) => d.schedule?.id === selected?.id);
  const dayContext = {
    date: selectedDay?.date ?? todayIso,
    holiday: selectedDay?.holiday ?? null,
    halfDay: selectedDay?.halfDay ?? null,
    endsAt: halfDayEnd,
    live: Boolean(todayInfo && selected && todayInfo.schedule?.id === selected.id),
  };

  const halfToday = upcoming.data?.halfDays.find((h) => h.date === todayIso);
  const holidayToday = upcoming.data?.holidays.find((h) => h.date === todayIso);
  const todayNote = holidayToday
    ? `Bugün ${holidayToday.name}: panoda zil çalmaz, sıradaki ders olarak tatilden sonraki ilk ders günü görünür.`
    : halfToday
      ? `Bugün ${halfToday.name} (yarım gün): panoda son zil ${halfDayEnd}. Bu saatten sonra başlayan dersler yapılmaz, taşan ders son zilde biter.`
      : null;

  const shiftName = dual ? (shift === 'afternoon' ? ' · Öğlenci' : ' · Sabahçı') : '';
  /** Yeni düzen: ders sayısı verilirse ilk düzenin kuralıyla (e-Okul saatleri) o kadar ders saati hazırlanır */
  const openNew = (count?: number) => {
    setEditing(null);
    const base = [...inShift].filter((s) => !s.weekdays.length).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
    const periods = count && base ? generatePeriods({ ...deriveRule(base.periods), count, lunchAfter: deriveRule(base.periods).lunchAfter || null, afternoonBreakMin: null }) : [];
    form.reset({ name: count ? `${count} derslik gün${shiftName}` : '', lessonCount: count ?? '', periods });
    setOpen(true);
  };
  const openEditor = (s: BellSchedule) => {
    setEditing(s);
    form.reset({ name: s.name, lessonCount: s.lessonCount ?? '', periods: s.periods });
    setOpen(true);
  };
  /** Kopya: aynı saatlerle elle sabitlenecek bir gün için (ör. cuma namazı düzeni) */
  const openCopy = (s: BellSchedule) => {
    setEditing(null);
    form.reset({ name: `${s.name} (kopya)`, lessonCount: s.lessonCount ?? '', periods: s.periods });
    setOpen(true);
  };

  const submit = async () => {
    const payload = form.validate(bellScheduleSchema, {
      name: form.values.name,
      periods: form.values.periods,
      lessonCount: form.values.lessonCount === '' ? null : form.values.lessonCount,
      weekdays: editing?.weekdays ?? [],
      shift: editing ? editing.shift : shift === 'afternoon' ? 'afternoon' : null,
      sortOrder: editing?.sortOrder ?? schedules.length,
    });
    if (!payload) return;
    try {
      if (editing) await ops.update.mutateAsync({ id: editing.id, body: payload });
      else await ops.create.mutateAsync(payload);
      setOpen(false);
    } catch (err) {
      form.fail(err);
    }
  };

  /** Bir günü bir düzene sabitler ya da otomatiğe döndürür (vardiyadaki düzenlerin günleri güncellenir) */
  const setDay = async (weekday: number, scheduleId: string | null) => {
    for (const s of inShift) {
      const has = s.weekdays.includes(weekday);
      const want = s.id === scheduleId;
      if (has === want) continue;
      const weekdaysNext = want ? [...s.weekdays, weekday].sort() : s.weekdays.filter((d) => d !== weekday);
      await ops.update.mutateAsync({ id: s.id, body: { name: s.name, periods: s.periods, lessonCount: s.lessonCount, shift: s.shift, sortOrder: s.sortOrder, weekdays: weekdaysNext } });
    }
  };

  const loading = list.isLoading || timetable.isLoading || classes.isLoading;

  return (
    <>
      <PageHeader
        title="Zil Saatleri"
        description="Okulda tek zil çalar ve zil o günün ders sayısına göre değişir: her gün o gün en geç biten sınıfın son dersine bakılır, ona uyan zil düzeni kendiliğinden seçilir. Ders sayısı farklı günler (ör. 10 ya da 11 dersli günler) için ayrı düzen tanımlayın."
        actions={
          editable && (
            <Button icon={<Plus className="size-4" />} onClick={() => openNew()}>
              Yeni zil düzeni
            </Button>
          )
        }
      />
      {todayNote && (
        <div className="mb-4">
          <Alert tone="amber">{todayNote}</Alert>
        </div>
      )}
      {dual && (
        <div className="mb-4">
          <Segmented
            value={shiftTab}
            onChange={setShiftTab}
            options={[
              { value: 'morning', label: 'Sabahçı' },
              { value: 'afternoon', label: 'Öğlenci' },
            ]}
          />
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : !inShift.length ? (
        <Card>
          <EmptyState
            icon={<BellRing className="size-6" />}
            title={`${dual ? (shift === 'afternoon' ? 'Öğlenci' : 'Sabahçı') + ' için z' : 'Z'}il düzeni yok`}
            description="e-Okul ders programı PDF'ini yüklediğinizde zil saatleri oradan alınır. Ya da ilk ders saati, ders ve teneffüs sürelerini girip düzeni kendiniz oluşturun."
            action={editable && <Button onClick={() => openNew(missing[0])}>Zil düzeni oluştur</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <WeekDays days={days} todayIso={todayIso} schedules={inShift} classes={classes.data ?? []} timetable={timetable.data ?? []} dual={dual} shift={shift} editable={editable} onSet={setDay} />

          <Card>
            <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-ink">Zil düzenleri</h2>
              <p className="text-sm text-slate-500">Her düzen bir kuraldan hesaplanır; saatleri satır satır da düzeltebilirsiniz. Ders sayısı tam uyan düzen yoksa bir büyüğü kullanılır.</p>
            </div>
            <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
              {[...inShift]
                .sort((a, b) => Number(Boolean(a.weekdays.length)) - Number(Boolean(b.weekdays.length)) || scheduleLessonCount(a) - scheduleLessonCount(b))
                .map((s) => (
                  <ProfileCard
                    key={s.id}
                    schedule={s}
                    usedOn={days.filter((d) => d.schedule?.id === s.id).map((d) => d.weekday)}
                    active={selected?.id === s.id}
                    onSelect={() => setSelectedId(s.id)}
                  />
                ))}
            </div>
            {editable && missing.length > 0 && (
              <div className="mx-4 mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 sm:mx-5">
                <span className="font-semibold">Programda {missing.map((n) => `${n} dersli`).join(', ')} gün var ama düzeni yok.</span>
                <span className="text-amber-800">Şimdilik bir büyük düzen kullanılıyor.</span>
                {missing.map((n) => (
                  <Button key={n} size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => openNew(n)}>
                    {n} derslik gün oluştur
                  </Button>
                ))}
              </div>
            )}
          </Card>

          {selected && (
            <ScheduleView
              key={selected.id}
              schedule={selected}
              scopeLabel={selected.weekdays.length ? `sabit gün${shiftName}` : `${scheduleLessonCount(selected)} dersli günler${shiftName}`}
              editable={editable}
              lunchThresholdMin={settings?.lunchThresholdMin ?? 30}
              day={dayContext}
              now={now}
              onEdit={() => openEditor(selected)}
              onCopy={() => openCopy(selected)}
              onDelete={() => {
                ops.remove.mutate(selected.id);
                setSelectedId(null);
              }}
            />
          )}
        </div>
      )}

      {!loading && <BellClassSettings classes={classes.data ?? []} dual={dual} editable={editable} />}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Zil düzenini düzenle' : 'Yeni zil düzeni'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button loading={ops.create.isPending || ops.update.isPending} onClick={() => void submit()}>
              Kaydet
            </Button>
          </>
        }
      >
        {form.errors._form && (
          <div className="mb-4">
            <Alert tone="red">{form.errors._form}</Alert>
          </div>
        )}
        <Editor form={form} />
      </Modal>
    </>
  );
}

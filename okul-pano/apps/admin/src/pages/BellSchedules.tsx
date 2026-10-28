import { bellScheduleSchema, generatePeriods, pickSchedule, WEEKDAY_NAMES, addIsoDays, type Period } from '@okulpano/shared';
import { BellRing, Plus, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Segmented, Spinner, WeekdayPicker } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { useList, useResource, useSchool, type BellSchedule } from '../lib/data.ts';
import { HolidaysCard, useUpcomingHolidays, useWeekHolidays } from './bell/HolidaysCard.tsx';
import { ScheduleView, useNow, WeekCoverage } from './bell/ScheduleView.tsx';
import { useForm } from '../lib/form.ts';

type Form = { name: string; weekdays: number[]; periods: Period[] };

const defaultGen = { firstStart: '08:30', lessonMin: 40, breakMin: 10, count: 8, lunchAfter: 5, lunchMin: 45 };

function addMinutes(clock: string, minutes: number): string {
  const [h, m] = clock.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h! * 60 + m! + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return (bh! * 60 + bm!) - (ah! * 60 + am!);
}

function Editor({ form }: { form: ReturnType<typeof useForm<Form>> }) {
  const { values: v, set, errors } = form;
  const [gen, setGen] = useState(defaultGen);
  const [showGen, setShowGen] = useState(v.periods.length === 0);
  // Hafta sonu günleri varsayılan olarak gizli; çizelgede seçiliyse ya da istenirse görünür
  const [showWeekend, setShowWeekend] = useState(() => v.weekdays.some((d) => d > 5));

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
      <Field label="Çizelge adı" error={errors.name}>
        {(id) => <Input id={id} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="ör. Hafta içi, Cuma, Sınav haftası" invalid={Boolean(errors.name)} />}
      </Field>
      <Field label="Geçerli günler" error={errors.weekdays}>
        {() => (
          <div className="flex flex-wrap items-center gap-3">
            <WeekdayPicker value={v.weekdays} onChange={(d) => set('weekdays', d)} days={showWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]} />
            {!showWeekend && (
              <button type="button" onClick={() => setShowWeekend(true)} className="text-xs font-semibold text-brand-600 hover:underline">
                + Hafta sonu
              </button>
            )}
          </div>
        )}
      </Field>

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
            </div>
            <Button
              variant="success"
              icon={<Wand2 className="size-4" />}
              onClick={() => {
                set('periods', generatePeriods({ ...gen, lunchAfter: gen.lunchAfter || null }));
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
  const ops = useResource<BellSchedule>('bell-schedules', 'Zil çizelgesi');
  const form = useForm<Form>({ name: '', weekdays: [1, 2, 3, 4, 5], periods: [] });
  const [editing, setEditing] = useState<BellSchedule | null>(null);
  const [open, setOpen] = useState(false);
  const tz = school.data?.timezone ?? 'Europe/Istanbul';
  const now = useNow(tz);
  // Seçili gün: o gün geçerli olan çizelge gösterilir (varsayılan bugün, hafta sonuysa pazartesi)
  const [day, setDay] = useState(() => (now.weekday <= 5 ? now.weekday : 1));
  // Belirli bir çizelge sekmesinden seçilmişse o gösterilir
  const [forcedId, setForcedId] = useState<string | null>(null);
  const schedules = list.data ?? [];
  const selected = schedules.find((x) => x.id === forcedId) ?? pickSchedule(schedules, day) ?? null;

  // Bugün arife ya da tatilse çizelgenin üstünde not: panoda zil buna göre çalar
  const upcoming = useUpcomingHolidays();
  const todayIso = now.iso;

  // Hafta şeridi: bu hafta (hafta sonu ders yoksa gelecek hafta). Tatil ve arifeler Tatiller ve arifeler listesinden gelir
  const weekendClass = now.weekday >= 6 && !pickSchedule(schedules, now.weekday);
  const monday = addIsoDays(todayIso, weekendClass ? 8 - now.weekday : 1 - now.weekday);
  const week = useWeekHolidays(monday);
  const halfEndSetting = school.data?.settings.halfDayEnd ?? '13:00';
  const weekInfo = Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const date = addIsoDays(monday, d - 1);
      return [
        d,
        {
          date,
          holiday: week.data?.holidays.find((h) => h.date === date)?.name ?? null,
          halfDay: week.data?.halfDays.find((h) => h.date === date)?.name ?? null,
          endsAt: halfEndSetting,
        },
      ];
    }),
  );
  const selectedDay = weekInfo[day]!;
  const dayContext = {
    ...selectedDay,
    // Canlı vurgu yalnızca bugün ve bugün gerçekten bu çizelge geçerliyse (ör. cuma günü "Cuma" çizelgesi varken "Hafta içi" değil)
    live: selectedDay.date === todayIso && Boolean(selected) && pickSchedule(schedules, now.weekday)?.id === selected?.id,
  };
  const halfToday = upcoming.data?.halfDays.find((h) => h.date === todayIso);
  const holidayToday = upcoming.data?.holidays.find((h) => h.date === todayIso);
  const halfEnd = school.data?.settings.halfDayEnd ?? '13:00';
  const todayNote = holidayToday
    ? `Bugün ${holidayToday.name}: panoda zil çalmaz, sıradaki ders olarak tatilden sonraki ilk ders günü görünür.`
    : halfToday
      ? `Bugün ${halfToday.name} (yarım gün): panoda son zil ${halfEnd}. Bu saatten sonra başlayan dersler yapılmaz, taşan ders son zilde biter.`
      : null;

  const covered = new Set((list.data ?? []).flatMap((s) => s.weekdays));
  // Aynı günü kapsayan çizelgeler: daha özel olan (az günlü) o gün geçerlidir
  const overrides = [1, 2, 3, 4, 5, 6, 7].flatMap((d) => {
    const all = schedules.filter((x) => x.weekdays.includes(d) && x.periods.length);
    const winner = pickSchedule(schedules, d);
    return all.length > 1 && winner ? [{ day: d, name: winner.name }] : [];
  });

  /** Seçili çizelgenin kopyası: aynı ders saatleriyle başka gün(ler) için (ör. cuma namazı düzeni) */
  const openCopy = (s: BellSchedule) => {
    setEditing(null);
    form.reset({ name: `${s.name} (kopya)`, weekdays: [], periods: s.periods });
    setOpen(true);
  };

  const openEditor = (s: BellSchedule | null) => {
    setEditing(s);
    form.reset(s ? { name: s.name, weekdays: s.weekdays, periods: s.periods } : { name: list.data?.length ? '' : 'Hafta içi', weekdays: [1, 2, 3, 4, 5].filter((d) => !covered.has(d)), periods: [] });
    setOpen(true);
  };

  const submit = async () => {
    const payload = form.validate(bellScheduleSchema, { ...form.values, sortOrder: editing?.sortOrder ?? list.data?.length ?? 0 });
    if (!payload) return;
    try {
      if (editing) await ops.update.mutateAsync({ id: editing.id, body: payload });
      else await ops.create.mutateAsync(payload);
      setOpen(false);
    } catch (err) {
      form.fail(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Zil Saatleri"
        description="Panonun sağ üstündeki zil sayacı bu çizelgelere göre ders ve teneffüsün bitmesine kalan süreyi hesaplar. Cuma namazı gibi farklı saatler gereken günler için çizelgeyi kopyalayıp o güne özel düzenleyin; o gün özel çizelge geçerli olur."
        actions={
          editable && (
            <Button icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
              Yeni çizelge
            </Button>
          )
        }
      />
      {todayNote && (
        <div className="mb-4">
          <Alert tone="amber">{todayNote}</Alert>
        </div>
      )}
      {overrides.length > 0 && (
        <div className="mb-4">
          <Alert tone="blue">
            {overrides.map((o) => `${WEEKDAY_NAMES[o.day]} günü "${o.name}"`).join(', ')} çizelgesi geçerli (o güne özel çizelge genel olanın yerine geçer).
          </Alert>
        </div>
      )}
      {list.isLoading ? (
        <Spinner />
      ) : !list.data?.length ? (
        <Card>
          <EmptyState
            icon={<BellRing className="size-6" />}
            title="Zil çizelgesi yok"
            description="İlk ders saati, ders ve teneffüs sürelerini girin; çizelge otomatik oluşsun."
            action={editable && <Button onClick={() => openEditor(null)}>Çizelge oluştur</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-slate-200/70 lg:flex-row lg:items-center">
            {schedules.length > 1 && (
              <div className="shrink-0">
                <Segmented
                  value={selected?.id ?? ''}
                  onChange={(id) => {
                    setForcedId(id);
                    const first = schedules.find((x) => x.id === id)?.weekdays.find((d) => pickSchedule(schedules, d)?.id === id);
                    if (first) setDay(first);
                  }}
                  options={schedules.map((x) => ({ value: x.id, label: x.name }))}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <WeekCoverage
                schedules={schedules}
                day={day}
                today={monday <= todayIso && todayIso <= addIsoDays(monday, 6) ? now.weekday : 0}
                info={weekInfo}
                onDay={(d) => {
                  setDay(d);
                  setForcedId(null);
                }}
              />
            </div>
          </div>
          {!selected && (
            <Card>
              <EmptyState
                icon={<BellRing className="size-6" />}
                title={`${WEEKDAY_NAMES[day]} için zil çizelgesi yok`}
                description="Bu gün ders yapılıyorsa bir çizelge oluşturun ya da mevcut çizelgeyi bu güne kopyalayın."
                action={editable && <Button onClick={() => openEditor(null)}>Çizelge oluştur</Button>}
              />
            </Card>
          )}
          {selected && (
            <ScheduleView
              key={selected.id}
              schedule={selected}
              editable={editable}
              lunchThresholdMin={school.data?.settings.lunchThresholdMin ?? 30}
              day={dayContext}
              now={now}
              onEdit={() => openEditor(selected)}
              onCopy={() => openCopy(selected)}
              onDelete={() => {
                ops.remove.mutate(selected.id);
                setForcedId(null);
              }}
            />
          )}
        </div>
      )}

      <div className="mt-5">
        <HolidaysCard />
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Çizelgeyi düzenle' : 'Yeni zil çizelgesi'}
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

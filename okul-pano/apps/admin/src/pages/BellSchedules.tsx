import { bellScheduleSchema, generatePeriods, WEEKDAY_SHORT, type Period } from '@okulpano/shared';
import { BellRing, Plus, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Spinner, WeekdayPicker } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { useList, useResource, useSchool, type BellSchedule } from '../lib/data.ts';
import { ScheduleCard } from './bell/ScheduleCard.tsx';
import { useForm } from '../lib/form.ts';

type Form = { name: string; weekdays: number[]; periods: Period[] };

const defaultGen = { firstStart: '08:30', lessonMin: 40, breakMin: 10, count: 8, lunchAfter: 5, lunchMin: 45 };

function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return (bh! * 60 + bm!) - (ah! * 60 + am!);
}

function Editor({ form }: { form: ReturnType<typeof useForm<Form>> }) {
  const { values: v, set, errors } = form;
  const [gen, setGen] = useState(defaultGen);
  const [showGen, setShowGen] = useState(v.periods.length === 0);

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
        {() => <WeekdayPicker value={v.weekdays} onChange={(d) => set('weekdays', d)} />}
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
              variant="secondary"
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
                {gap !== null && gap > 0 && (
                  <div className="py-1 pl-16 text-xs text-slate-400">
                    {gap >= 30 ? 'Öğle arası' : 'Teneffüs'} · {gap} dk
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

  const covered = new Set((list.data ?? []).flatMap((s) => s.weekdays));
  const overlaps = [1, 2, 3, 4, 5, 6, 7].filter((d) => (list.data ?? []).filter((s) => s.weekdays.includes(d)).length > 1);

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
        description="Panonun sağ üstündeki zil sayacı bu çizelgelere göre ders ve teneffüsün bitmesine kalan süreyi hesaplar. Cuma gibi farklı günler için ayrı çizelge oluşturabilirsiniz."
        actions={
          editable && (
            <Button icon={<Plus className="size-4" />} onClick={() => openEditor(null)}>
              Yeni çizelge
            </Button>
          )
        }
      />
      {overlaps.length > 0 && (
        <div className="mb-4">
          <Alert>
            {overlaps.map((d) => WEEKDAY_SHORT[d]).join(', ')} günleri birden fazla çizelgede seçili; panoda listedeki ilk çizelge kullanılır.
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,26rem),1fr))] gap-4">
          {list.data.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              editable={editable}
              lunchThresholdMin={school.data?.settings.lunchThresholdMin ?? 30}
              onEdit={() => openEditor(s)}
              onDelete={() => ops.remove.mutate(s.id)}
            />
          ))}
        </div>
      )}

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

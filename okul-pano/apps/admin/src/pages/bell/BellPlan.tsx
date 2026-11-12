import { compareClassNames, joinClassNames, latestClasses, scheduleLessonCount, WEEKDAY_NAMES, WEEKDAY_SHORT, type Period, type Shift, errorText } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Lock, Settings2 } from '../../components/icons.tsx';
import { useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Badge, Button, Card, Modal, Segmented, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath, type BellSchedule, type ClassGroup, type School, type TimetableEntry } from '../../lib/data.ts';
import { shortDate } from './ScheduleView.tsx';

export interface WeekDay {
  weekday: number;
  date: string;
  /** Günün ders sayısı (null: ders programı yok) */
  count: number | null;
  schedule: BellSchedule | null;
  /** O gün çalan ders saatleri (son derste biter; tatil / arife uygulanmış) */
  periods: Period[];
  holiday: string | null;
  halfDay: string | null;
  /** Düzen o güne elle sabitlenmiş */
  fixed: boolean;
}

/** Düzenlerin renkleri (ders sayısına göre sırayla) */
const TONES = ['bg-sky-100 text-sky-900', 'bg-violet-100 text-violet-900', 'bg-pink-100 text-pink-900', 'bg-orange-100 text-orange-900', 'bg-teal-100 text-teal-900'];
const toneOf = (schedules: BellSchedule[], id: string | undefined) => {
  const sorted = [...schedules].sort((a, b) => scheduleLessonCount(a) - scheduleLessonCount(b));
  return TONES[Math.max(0, sorted.findIndex((s) => s.id === id)) % TONES.length];
};

/** Bu hafta: her gün kaç ders var, hangi düzen çalıyor, saat aralığı; tıklayınca günün düzeni elle seçilir */
export function WeekDays({
  days,
  todayIso,
  schedules,
  classes,
  timetable,
  dual,
  shift,
  editable,
  onSet,
}: {
  days: WeekDay[];
  todayIso: string;
  schedules: BellSchedule[];
  classes: ClassGroup[];
  timetable: TimetableEntry[];
  dual: boolean;
  shift: Shift;
  editable: boolean;
  onSet: (weekday: number, scheduleId: string | null) => Promise<void>;
}) {
  const [picking, setPicking] = useState<WeekDay | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const names = new Map(classes.map((c) => [c.id, c.name]));
  const latest = (d: number) => latestClasses(timetable, classes, dual, d, shift).map((id) => names.get(id) ?? '');

  return (
    <Card>
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-ink">Bu hafta zil</h2>
        <p className="text-sm text-slate-500">
          Günün ders sayısı, o gün en geç biten sınıfın son dersidir (zil hesabına katılmayan sınıflar sayılmaz). Sınav günü gibi durumlarda güne tıklayıp düzeni elle seçebilirsiniz.
        </p>
      </div>
      <div className="grid gap-2.5 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-5">
        {days.map((d) => {
          const first = d.periods[0];
          const last = d.periods[d.periods.length - 1];
          const late = d.count ? latest(d.weekday) : [];
          return (
            <button
              key={d.weekday}
              type="button"
              disabled={!editable}
              onClick={() => setPicking(d)}
              className={clsx(
                'min-w-0 rounded-2xl p-3.5 text-left ring-1 transition',
                d.date === todayIso ? 'ring-2 ring-ink' : 'ring-slate-200',
                editable && 'hover:ring-brand-400',
              )}
            >
              <div className="flex items-baseline justify-between gap-2 text-xs font-bold tracking-wide text-slate-500 uppercase">
                <span>{WEEKDAY_NAMES[d.weekday]}</span>
                <span className="font-medium tracking-normal normal-case">{shortDate(d.date)}</span>
              </div>
              {d.holiday ? (
                <div className="mt-2 text-sm font-semibold text-rose-700">{d.holiday}</div>
              ) : (
                <>
                  <div className="mt-1 text-2xl font-extrabold text-ink tabular-nums">
                    {d.count ?? '–'} <span className="text-sm font-semibold text-slate-500">ders</span>
                  </div>
                  {d.schedule ? (
                    <span className={clsx('mt-1.5 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-xs font-bold', toneOf(schedules, d.schedule.id))}>
                      {d.fixed && <Lock className="size-3" />}
                      {d.schedule.name}
                    </span>
                  ) : (
                    <span className="mt-1.5 inline-block text-xs text-slate-400">{d.count === 0 ? 'Ders yok' : 'Zil düzeni yok'}</span>
                  )}
                  {first && last && (
                    <div className="mt-1.5 text-sm font-semibold text-slate-700 tabular-nums">
                      {first.start} – {last.end}
                      {d.halfDay && <span className="ml-1 text-xs font-medium text-amber-700">· arife</span>}
                    </div>
                  )}
                  {late.length > 0 && <div className="mt-1 line-clamp-2 text-[11px] text-slate-400">En geç: {joinClassNames(late)}</div>}
                </>
              )}
            </button>
          );
        })}
      </div>

      <Modal open={Boolean(picking)} onClose={() => setPicking(null)} title={picking ? `${WEEKDAY_NAMES[picking.weekday]} zili` : ''} description={picking?.count ? `Programda bu gün ${picking.count} ders var.` : undefined}>
        {picking && (
          <div className="space-y-2">
            {[{ id: null as string | null, name: 'Otomatik (ders sayısına göre)', hint: 'Önerilen' }, ...schedules.map((s) => ({ id: s.id as string | null, name: s.name, hint: `${s.periods.length} ders` }))].map((o) => {
              const current = picking.fixed ? picking.schedule?.id === o.id : o.id === null;
              return (
                <button
                  key={o.id ?? 'auto'}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onSet(picking.weekday, o.id);
                      toast.success(`${WEEKDAY_NAMES[picking.weekday]}: ${o.id ? o.name : 'otomatik'}`);
                      setPicking(null);
                    } catch (err) {
                      toast.error(errorText(err, 'Kaydedilemedi'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className={clsx(
                    'flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left ring-1 transition',
                    current ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-200 hover:ring-slate-300',
                  )}
                >
                  <span className="font-semibold text-ink">{o.name}</span>
                  <span className="text-xs text-slate-500">{o.hint}</span>
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </Card>
  );
}

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Düzen kartı: kural özeti, şerit, kullanıldığı günler */
export function ProfileCard({ schedule, usedOn, active, onSelect }: { schedule: BellSchedule; usedOn: number[]; active: boolean; onSelect: () => void }) {
  const ps = [...schedule.periods].sort((a, b) => a.start.localeCompare(b.start));
  const first = ps[0];
  const last = ps[ps.length - 1];
  const gaps = ps.slice(1).map((p, i) => toMin(p.start) - toMin(ps[i]!.end));
  const longest = Math.max(0, ...gaps);
  const lunchAt = longest >= 20 ? gaps.indexOf(longest) : -1;
  const morningBreak = gaps.find((_, i) => lunchAt < 0 || i < lunchAt);
  const afternoonBreak = lunchAt < 0 ? undefined : gaps.find((_, i) => i > lunchAt);
  const span = first && last ? Math.max(1, toMin(last.end) - toMin(first.start)) : 1;
  const rows: [string, string][] = [
    ['İlk ders', first?.start ?? '–'],
    ['Ders', first ? `${toMin(first.end) - toMin(first.start)} dk` : '–'],
    ['Sabah teneffüsü', morningBreak !== undefined ? `${morningBreak} dk` : '–'],
    ['Öğle arası', lunchAt >= 0 ? `${lunchAt + 1}. dersten sonra · ${longest} dk` : 'yok'],
    ['Öğleden sonra teneffüs', afternoonBreak !== undefined ? `${afternoonBreak} dk` : '–'],
    ['Son zil', last?.end ?? '–'],
  ];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx('min-w-0 rounded-2xl p-4 text-left ring-1 transition', active ? 'bg-brand-50/60 ring-2 ring-brand-500' : 'ring-slate-200 hover:ring-slate-300')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[15px] font-bold text-ink">{schedule.name}</span>
        <span className="flex shrink-0 gap-1">
          {schedule.source === 'eokul' && <Badge tone="green">e-Okul</Badge>}
          {schedule.weekdays.length > 0 && <Badge tone="slate">Sabit: {schedule.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ')}</Badge>}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-dashed border-slate-200 py-0.5">
            <span className="text-slate-500">{k}</span>
            <span className="font-semibold text-ink tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      {first && (
        <div className="relative mt-3 h-5 overflow-hidden rounded-md bg-emerald-300">
          {ps.map((p) => (
            <span
              key={p.no}
              className="absolute inset-y-0 rounded-[3px] bg-slate-700"
              style={{ left: `${((toMin(p.start) - toMin(first.start)) / span) * 100}%`, width: `${((toMin(p.end) - toMin(p.start)) / span) * 100}%` }}
            />
          ))}
          {lunchAt >= 0 && (
            <span
              className="absolute inset-y-0 bg-amber-400"
              style={{ left: `${((toMin(ps[lunchAt]!.end) - toMin(first.start)) / span) * 100}%`, width: `${(longest / span) * 100}%` }}
            />
          )}
        </div>
      )}
      <div className="mt-2 text-xs text-slate-500">
        {schedule.weekdays.length ? 'Elle sabitlendi' : `${scheduleLessonCount(schedule)} dersli günlerde`}
        {usedOn.length > 0 ? ` · bu hafta: ${usedOn.map((d) => WEEKDAY_SHORT[d]).join(', ')}` : ' · bu hafta kullanılmıyor'}
      </div>
    </button>
  );
}

/** Bir grubun (sabahçı / öğlenci) özeti: saatler zilden okunur */
export interface ShiftSummary {
  range: string | null;
  scheduleName: string | null;
  classCount: number;
}

/**
 * Eğitim düzeni (Zil Saatleri'nin üstünde): Tam gün / Yarım gün (ikili eğitim). Yarım günde iki grup kartı aynı
 * zamanda sekmedir: seçilen grubun zil ayrıntısı sayfanın geri kalanında görünür. Saatler zil düzenlerinden okunur;
 * ayrıca elle girilmez (tek kaynak).
 */
export function EducationModeCard({
  classes,
  dual,
  editable,
  shift,
  onShift,
  summary,
}: {
  classes: ClassGroup[];
  dual: boolean;
  editable: boolean;
  shift: Shift;
  onShift: (s: Shift) => void;
  summary: Record<Shift, ShiftSummary>;
}) {
  const { schoolId } = useAuth();
  const schoolPath = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const sorted = [...classes].sort((a, b) => compareClassNames(a.name, b.name));
  const afternoon = sorted.filter((c) => c.shift === 'afternoon');
  const saveDual = useMutation({
    mutationFn: (dualShift: boolean) => api<School>(schoolPath, { method: 'PATCH', body: { settings: { dualShift } } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      if (!data.settings.dualShift) onShift('morning');
    },
    onError: (e) => toast.error(e.message),
  });
  const card = (s: Shift) => {
    const m = s === 'morning';
    const sum = summary[s];
    const on = shift === s;
    const names = m ? null : afternoon.slice(0, 4).map((c) => c.name).join(', ') + (afternoon.length > 4 ? '…' : '');
    return (
      <button
        key={s}
        type="button"
        aria-pressed={on}
        onClick={() => onShift(s)}
        className={clsx(
          'relative rounded-2xl p-4 text-left ring-2 transition',
          m ? 'bg-amber-50' : 'bg-violet-50',
          on ? (m ? 'ring-amber-500' : 'ring-violet-500') : 'ring-transparent hover:ring-slate-300',
        )}
      >
        <span className={clsx('absolute top-3.5 right-3.5 rounded-full px-2.5 py-0.5 text-xs font-bold', on ? 'bg-ink text-surface' : 'bg-slate-100 text-slate-600')}>
          {on ? 'Gösteriliyor' : 'Ayarla'}
        </span>
        <span className={clsx('block text-xs font-extrabold tracking-wide', m ? 'text-amber-700' : 'text-violet-700')}>
          {m ? 'SABAHÇI GRUP' : 'ÖĞLENCİ GRUP'} · {sum.classCount} SINIF
        </span>
        <span className="mt-1 block text-2xl font-extrabold text-ink tabular-nums">{sum.range ?? 'Zil düzeni yok'}</span>
        <span className="mt-1 block truncate pr-2 text-xs text-slate-500">
          {[sum.scheduleName, names].filter(Boolean).join(' · ') || (m ? 'Öğlenci seçilmeyen bütün sınıflar' : 'Henüz öğlenci sınıf seçilmedi')}
        </span>
      </button>
    );
  };

  return (
    <Card className="mb-5">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Eğitim düzeni</h2>
            <p className="text-sm text-slate-500">Okul sabahçı ve öğlenci şeklinde ikili eğitim yapıyorsa Yarım gün'ü seçin.</p>
          </div>
          <Segmented
            value={dual ? 'half' : 'full'}
            onChange={(v) => editable && v !== (dual ? 'half' : 'full') && saveDual.mutate(v === 'half')}
            options={[
              { value: 'full', label: 'Tam gün' },
              { value: 'half', label: 'Yarım gün (ikili eğitim)' },
            ]}
          />
        </div>
        {dual && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">{(['morning', 'afternoon'] as const).map(card)}</div>
            <div className="flex flex-wrap items-center gap-3">
              {editable && (
                <Button size="sm" variant="secondary" icon={<Settings2 className="size-3.5" />} onClick={() => setPicking(true)}>
                  Öğlenci sınıfları seç
                </Button>
              )}
              <span className="text-xs text-slate-500">Pano sabah sabahçı zilini, sabahçı dersleri bitince öğlenci zilini gösterir.</span>
            </div>
          </>
        )}
      </div>
      <ClassPicker
        open={picking}
        title="Öğlenci sınıflar"
        classes={sorted}
        initial={new Set(afternoon.map((c) => c.id))}
        onClose={() => setPicking(false)}
        onSave={async (picked) => {
          const path = `${schoolPath}/classes`;
          await api(`${path}/shift`, { method: 'POST', body: { classIds: sorted.filter((c) => picked.has(c.id)).map((c) => c.id), shift: 'afternoon' } });
          await api(`${path}/shift`, { method: 'POST', body: { classIds: sorted.filter((c) => !picked.has(c.id) && c.shift === 'afternoon').map((c) => c.id), shift: 'morning' } });
          await qc.invalidateQueries({ queryKey: [schoolId, 'classes'] });
          toast.success('Kaydedildi');
          setPicking(false);
        }}
      />
    </Card>
  );
}

/** Zil hesabına katılmayan sınıflar (ikili eğitim ayarı üstteki Eğitim düzeni kartında) */
export function BellClassSettings({ classes, editable }: { classes: ClassGroup[]; editable: boolean }) {
  const { schoolId } = useAuth();
  const schoolPath = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const sorted = [...classes].sort((a, b) => compareClassNames(a.name, b.name));
  const exempt = sorted.filter((c) => c.bellExempt);

  return (
    <div className="mt-5">
      <Card>
        <div className="space-y-3 p-5 sm:p-6">
          <div>
            <div className="font-semibold text-ink">Zil hesabına katılmayan sınıflar</div>
            <p className="text-sm text-slate-500">Günün ders sayısını belirlemezler (ör. özel eğitim); zil onlar için de aynı çalar.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {exempt.map((c) => (
              <span key={c.id} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                {c.name}
              </span>
            ))}
            {!exempt.length && <span className="text-xs text-slate-500">Yok.</span>}
            {editable && (
              <Button size="sm" variant="secondary" icon={<Settings2 className="size-3.5" />} onClick={() => setOpen(true)}>
                Düzenle
              </Button>
            )}
          </div>
        </div>
      </Card>
      <ClassPicker
        open={open}
        title="Zil hesabına katılmayan sınıflar"
        classes={sorted}
        initial={new Set(exempt.map((c) => c.id))}
        onClose={() => setOpen(false)}
        onSave={async (picked) => {
          const path = `${schoolPath}/classes`;
          await api(`${path}/bell-exempt`, { method: 'POST', body: { classIds: sorted.filter((c) => picked.has(c.id) && !c.bellExempt).map((c) => c.id), exempt: true } });
          await api(`${path}/bell-exempt`, { method: 'POST', body: { classIds: sorted.filter((c) => !picked.has(c.id) && c.bellExempt).map((c) => c.id), exempt: false } });
          await qc.invalidateQueries({ queryKey: [schoolId, 'classes'] });
          toast.success('Kaydedildi');
          setOpen(false);
        }}
      />
    </div>
  );
}

function ClassPicker({
  open,
  title,
  classes,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  classes: ClassGroup[];
  initial: Set<string>;
  onClose: () => void;
  onSave: (picked: Set<string>) => Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const current = picked ?? initial;
  const close = () => {
    setPicked(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Vazgeç
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(current);
                setPicked(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {classes.map((c) => {
          const on = current.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = new Set(current);
                if (on) next.delete(c.id);
                else next.add(c.id);
                setPicked(next);
              }}
              className={clsx('rounded-full px-3 py-1 text-xs font-bold transition', on ? 'bg-ink text-surface' : 'bg-surface text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300')}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

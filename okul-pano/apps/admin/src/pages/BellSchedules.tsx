import {
  addIsoDays,
  bellClassDays,
  bellScheduleSchema,
  classSetLabel,
  compareClassNames,
  dayBells,
  generatePeriods,
  lunchBeforeNo,
  WEEKDAY_SHORT,
  gradeOf,
  isoWeekday,
  lessonCounts,
  missingLessonCounts,
  scheduleLessonCount,
  schoolDay,
  schoolLessonCounts,
  sortPeriods,
  WEEKDAY_NAMES,
  type Period,
  type SchoolCalendar,
  type Shift,
} from '@okulpano/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BellRing, Check, ChevronDown, ChevronLeft, ChevronRight, Coffee, CopyPlus, Minus, Plus, Trash2, Utensils, Wand2 } from '../components/icons.tsx';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, DeleteButton, EditButton, EmptyState, Field, IconButton, Input, Modal, PageHeader, Segmented, Spinner } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useList, useResource, useSchool, useSchoolPath, type BellSchedule, type ClassGroup, type TimetableEntry } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';
import { BellClassSettings } from './bell/BellPlan.tsx';
import { BellTag, DayFlow, NowCards, TimeBox, WeekStrip, type FlowBell, type OverrideRow } from './bell/DayFlow.tsx';
import { useUpcomingHolidays, useWeekHolidays } from './bell/HolidaysCard.tsx';
import { shortDate, useNow } from './bell/ScheduleView.tsx';

type Form = { name: string; lessonCount: number | ''; periods: Period[]; classIds: string[]; weekdays: number[] };

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

function Editor({ form, classes, lunchThresholdMin }: { form: ReturnType<typeof useForm<Form>>; classes: ClassGroup[]; lunchThresholdMin: number }) {
  const { values: v, set, errors } = form;
  // Öğle arası: günün en uzun arası (panodaki hesapla aynı)
  const lunchNo = lunchBeforeNo(v.periods, lunchThresholdMin);
  const [gen, setGen] = useState(() => ({ ...(v.periods.length ? deriveRule(v.periods) : defaultGen), count: Number(v.lessonCount) || v.periods.length || defaultGen.count }));
  const [showGen, setShowGen] = useState(v.periods.length === 0);

  // Ders listesi her zaman saate göre sıralı ve 1'den numaralı: adlar "1. Ders, 2. Ders…" (elle yazılmaz)
  const lessons = sortPeriods(v.periods);
  const commit = (list: Period[]) => {
    const next = sortPeriods(list).map((p, i) => ({ ...p, no: i + 1 }));
    // "Kaç derslik gün" ders sayısını izliyorsa birlikte güncellenir
    if (v.lessonCount === '' || Number(v.lessonCount) === lessons.length) set('lessonCount', next.length || '');
    set('periods', next);
  };
  const len = (p: Period) => minutesBetween(p.start, p.end);
  const gapAfter = (i: number) => (lessons[i + 1] ? minutesBetween(lessons[i]!.end, lessons[i + 1]!.start) : null);
  /** i. dersten itibaren bütün dersleri kaydırır */
  const shiftFrom = (i: number, minutes: number) =>
    commit(lessons.map((p, j) => (j >= i ? { ...p, start: addMinutes(p.start, minutes), end: addMinutes(p.end, minutes) } : p)));
  const updatePeriod = (i: number, patch: Partial<Period>) => commit(lessons.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  /**
   * i. dersten sonra yeni ders (i = -1: liste boş): süresi önceki dersin süresi, önündeki ara önceki teneffüs (öğle arası
   * değil); eski ara yeni dersin arkasında kalır, sonraki dersler kayar. Liste boşsa 08:30, 40 dk.
   */
  const newAfter = (i: number): Period => {
    const prev = lessons[i];
    if (!prev) return { no: 1, start: '08:30', end: '09:10', label: null };
    const before = i > 0 ? minutesBetween(lessons[i - 1]!.end, prev.start) : null;
    const after = gapAfter(i);
    const brk = before ?? (after !== null && lessons[i + 1]!.no !== lunchNo ? after : null) ?? defaultGen.breakMin;
    const start = addMinutes(prev.end, brk);
    return { no: i + 2, start, end: addMinutes(start, len(prev)), label: null };
  };
  const insertAfter = (i: number) => {
    const added = newAfter(i);
    const push = i >= 0 ? minutesBetween(lessons[i]!.end, added.end) : 0;
    commit([...lessons.slice(0, i + 1), added, ...lessons.slice(i + 1).map((p) => ({ ...p, start: addMinutes(p.start, push), end: addMinutes(p.end, push) }))]);
  };
  /** Dersi siler; sonraki dersler önündeki arayla birlikte yukarı kayar (öğle arası korunur) */
  const removeAt = (i: number) => {
    const p = lessons[i]!;
    const pull = i > 0 ? minutesBetween(lessons[i - 1]!.end, p.end) : lessons[i + 1] ? minutesBetween(p.start, lessons[i + 1]!.start) : 0;
    commit([...lessons.slice(0, i), ...lessons.slice(i + 1).map((x) => ({ ...x, start: addMinutes(x.start, -pull), end: addMinutes(x.end, -pull) }))]);
  };
  const nextNew = newAfter(lessons.length - 1);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <Field label="Düzen adı" error={errors.name}>
          {(id) => <Input id={id} value={v.name} onChange={(ev) => set('name', ev.target.value)} placeholder="ör. 9 derslik gün, Cuma" invalid={Boolean(errors.name)} />}
        </Field>
        <Field label="Kaç derslik gün" error={errors.lessonCount} help={v.weekdays.length ? 'Seçili günlerde ders sayısına bakılmaz' : 'Günün ders sayısı bu olunca seçilir'}>
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

      <DayScope value={v.weekdays} onChange={(days) => set('weekdays', days)} lessonCount={Number(v.lessonCount) || v.periods.length} />

      <ClassScope classes={classes} value={v.classIds} onChange={(ids) => set('classIds', ids)} lessonCount={Number(v.lessonCount) || v.periods.length} days={v.weekdays} />

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
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink">Ders saatleri</span>
          <span className="text-xs text-slate-500">Aranın süresini değiştirince sonraki dersler birlikte kayar</span>
        </div>
        {errors.periods && (
          <div className="mb-2">
            <Alert tone="red">{errors.periods}</Alert>
          </div>
        )}
        <div className="space-y-1">
          {lessons.map((p, i) => {
            const gap = gapAfter(i);
            const lunch = lessons[i + 1]?.no === lunchNo;
            return (
              <div key={`${i}-${p.start}`}>
                <div className="flex items-center gap-2">
                  <span className="w-[5.5rem] shrink-0 rounded-lg bg-slate-100 py-1.5 text-center text-sm font-bold text-ink">{i + 1}. Ders</span>
                  <TimeBox value={p.start} onChange={(t) => updatePeriod(i, { start: t })} label={`${i + 1}. ders başlangıç`} className="w-[4.6rem] rounded-lg border border-slate-200 bg-surface px-2 py-1.5 text-center text-sm font-bold text-ink tabular-nums" />
                  <span className="text-slate-400">–</span>
                  <TimeBox value={p.end} onChange={(t) => updatePeriod(i, { end: t })} label={`${i + 1}. ders bitiş`} className="w-[4.6rem] rounded-lg border border-slate-200 bg-surface px-2 py-1.5 text-center text-sm font-bold text-ink tabular-nums" />
                  <span className="w-12 text-xs font-semibold text-slate-400 tabular-nums">{len(p)} dk</span>
                  <span className="flex-1" />
                  <IconButton label={`${i + 1}. dersi sil`} tone="delete" onClick={() => removeAt(i)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
                {gap !== null && (
                  <div
                    className={clsx(
                      'my-1 ml-[6rem] flex items-center gap-2 rounded-xl py-1 pr-1.5 pl-3 text-xs font-semibold',
                      lunch ? 'bg-tile-sun text-tile-sun-ink' : 'bg-tile-mint text-tile-mint-ink',
                    )}
                  >
                    {lunch ? <Utensils className="size-3.5" /> : <Coffee className="size-3.5" />}
                    <span className="w-20">{lunch ? 'Öğle arası' : 'Teneffüs'}</span>
                    <span className="inline-flex items-center rounded-lg bg-surface/80 ring-1 ring-black/5">
                      <button type="button" disabled={gap < 5} onClick={() => shiftFrom(i + 1, -5)} className="px-2 py-0.5 text-sm font-bold disabled:opacity-40" aria-label="Arayı 5 dakika kısalt">
                        <Minus className="size-3.5" strokeWidth={2.5} />
                      </button>
                      <span className="min-w-14 text-center font-bold tabular-nums">{gap} dk</span>
                      <button type="button" onClick={() => shiftFrom(i + 1, 5)} className="px-2 py-0.5 text-sm font-bold" aria-label="Arayı 5 dakika uzat">
                        <Plus className="size-3.5" strokeWidth={2.5} />
                      </button>
                    </span>
                    <button
                      type="button"
                      onClick={() => insertAfter(i)}
                      className="ml-auto rounded-lg border border-dashed border-current/30 bg-surface/60 px-2 py-0.5 text-[11px] font-bold opacity-80 hover:opacity-100"
                    >
                      + Araya ders
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => insertAfter(lessons.length - 1)}
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border-2 border-dashed border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="size-4" /> Ders ekle
            </span>
            <span className="text-xs font-medium text-slate-400">
              {lessons.length + 1}. Ders {nextNew.start} – {nextNew.end} olarak eklenir
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Düzen hangi günler: boşsa ders sayısı tutan her gün; seçilirse yalnızca bu günler (ders sayısına bakılmaz) */
function DayScope({ value, onChange, lessonCount }: { value: number[]; onChange: (days: number[]) => void; lessonCount: number }) {
  const picked = new Set(value);
  const toggle = (d: number) => onChange(picked.has(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b));
  const chip = (on: boolean) => clsx('rounded-full px-3 py-1 text-xs font-bold ring-1', on ? 'bg-ink text-surface ring-ink' : 'ring-slate-200 hover:bg-slate-100');
  return (
    <div className="rounded-xl p-4 ring-1 ring-slate-200/70">
      <div className="text-sm font-semibold text-ink">Hangi günler?</div>
      <p className="text-xs text-slate-500">
        {value.length
          ? `Her hafta ${value.map((d) => WEEKDAY_NAMES[d]).join(', ')} günleri bu zil çalar; o günün ders sayısına bakılmaz.`
          : `Otomatik: ${lessonCount ? `${lessonCount} dersli` : 'ders sayısı tutan'} her gün kendiliğinden seçilir. Belirli günlerde çalması için gün seçin.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onChange([])} className={chip(!value.length)}>
          Otomatik
        </button>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <button key={d} type="button" onClick={() => toggle(d)} className={chip(picked.has(d))} aria-pressed={picked.has(d)} title={WEEKDAY_NAMES[d]}>
            {WEEKDAY_SHORT[d]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Düzen kimler için: boşsa okul geneli; seçilirse yalnızca bu sınıflar, o gün ders sayıları tutunca (ya da seçili günlerde).
 * Her düzey tek satır (kutusu bütün şubeleri seçer); şubeler yalnızca istenince, bir düzey için açılır.
 */
function ClassScope({ classes, value, onChange, lessonCount, days }: { classes: ClassGroup[]; value: string[]; onChange: (ids: string[]) => void; lessonCount: number; days: number[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...classes].sort((a, b) => compareClassNames(a.name, b.name));
  const groups: { key: string; title: string; items: ClassGroup[] }[] = [];
  for (const c of sorted) {
    const g = gradeOf(c.name);
    const key = g === null ? 'other' : String(g);
    let group = groups.find((x) => x.key === key);
    if (!group) groups.push((group = { key, title: g === null ? 'Diğer sınıflar' : `${g}. sınıflar`, items: [] }));
    group.items.push(c);
  }
  const picked = new Set(value);
  const toggle = (ids: string[], on: boolean) => onChange(on ? [...new Set([...value, ...ids])] : value.filter((id) => !ids.includes(id)));
  // Özet: tamamı seçili düzey "12. sınıflar (7 şube)", kısmen seçilende şube adları
  const summary = groups.flatMap((g) => {
    const on = g.items.filter((c) => picked.has(c.id));
    if (!on.length) return [];
    return on.length === g.items.length ? [`${g.title} (${g.items.length} şube)`] : [on.map((c) => c.name).join(', ')];
  });
  return (
    <div className="rounded-xl p-4 ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">Hangi sınıflar için?</div>
          <p className="text-xs text-slate-500">
            {value.length
              ? `Yalnızca seçili sınıflar, ${days.length ? 'seçili günlerde ders varsa' : `o gün ${lessonCount || 'bu kadar'} dersleri olunca`} bu zile geçer; diğerleri okul geneli zilde kalır.`
              : `Okul geneli: ${days.length ? 'seçili günlerde' : 'günün ders sayısına göre'} bütün okul için çalar. Belirli sınıflara (ör. 12. sınıflar) özel zil için düzey ya da şube seçin.`}
          </p>
        </div>
        {value.length > 0 && (
          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => onChange([])}>
            Okul geneli yap
          </Button>
        )}
      </div>
      {summary.length > 0 && <div className="mt-3 rounded-lg bg-tile-peach/60 px-3 py-2 text-xs font-semibold text-tile-peach-ink">Seçili: {summary.join(' · ')}</div>}
      <div className="mt-3 space-y-1.5">
        {groups.map((g) => {
          const ids = g.items.map((c) => c.id);
          const n = ids.filter((id) => picked.has(id)).length;
          const all = n === ids.length;
          const isOpen = open === g.key;
          return (
            <div key={g.key}>
              <div className={clsx('flex items-center gap-3 rounded-xl px-3 py-2 ring-1', isOpen ? 'ring-2 ring-ink' : 'ring-slate-200')}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={all ? 'true' : n ? 'mixed' : 'false'}
                  aria-label={`${g.title}: bütün şubeler`}
                  onClick={() => toggle(ids, !all)}
                  className={clsx('grid size-[18px] shrink-0 place-items-center rounded-[5px] border-2', n ? 'border-ink bg-ink text-surface' : 'border-slate-400')}
                >
                  {all ? <Check className="size-3" strokeWidth={3.5} /> : n ? <Minus className="size-3" strokeWidth={3.5} /> : null}
                </button>
                <button type="button" onClick={() => toggle(ids, !all)} className="w-28 text-left text-sm font-bold text-ink">
                  {g.title}
                </button>
                <span className="text-xs text-slate-500">
                  {ids.length} şube{all ? ' · hepsi seçili' : n ? ` · ${n} seçili` : ''}
                </span>
                <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-ink" aria-expanded={isOpen}>
                  <ChevronDown className={clsx('size-3.5 transition-transform', isOpen && 'rotate-180')} /> şubeler
                </button>
              </div>
              {isOpen && (
                <div className="flex flex-wrap gap-1.5 py-2 pl-9">
                  {g.items.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle([c.id], !picked.has(c.id))}
                      aria-pressed={picked.has(c.id)}
                      className={clsx('rounded-full px-3 py-1 text-xs font-semibold ring-1', picked.has(c.id) ? 'bg-ink text-surface ring-ink' : 'text-slate-600 ring-slate-200 hover:bg-slate-50')}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const shiftOfSchedule = (s: Pick<BellSchedule, 'shift'>): Shift => (s.shift === 'afternoon' ? 'afternoon' : 'morning');

export function BellSchedules() {
  const { can, schoolId } = useAuth();
  const editable = can('schedule.manage');
  const qc = useQueryClient();
  const toast = useToast();
  const overridePath = useSchoolPath('bell-overrides');
  const list = useList<BellSchedule>('bell-schedules');
  const school = useSchool();
  const ops = useResource<BellSchedule>('bell-schedules', 'Zil düzeni');
  const classes = useList<ClassGroup>('classes');
  const timetable = useList<TimetableEntry>('timetable');
  const overrides = useList<OverrideRow>('bell-overrides');
  const form = useForm<Form>({ name: '', lessonCount: '', periods: [], classIds: [], weekdays: [] });
  const [editing, setEditing] = useState<BellSchedule | null>(null);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [selDate, setSelDate] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const tz = school.data?.timezone ?? 'Europe/Istanbul';
  const now = useNow(tz);
  const settings = school.data?.settings;
  const lunchThresholdMin = settings?.lunchThresholdMin ?? 30;
  const dual = Boolean(settings?.dualShift);
  const [shiftTab, setShiftTab] = useState<Shift>('morning');
  const shift: Shift = dual ? shiftTab : 'morning';
  const schedules = list.data ?? [];
  const inShift = schedules.filter((s) => shiftOfSchedule(s) === shift);
  const classList = classes.data ?? [];
  const counts = useMemo(() => (timetable.data?.length ? lessonCounts(timetable.data, classList, dual) : null), [timetable.data, classList, dual]);
  const bellClasses = useMemo(() => (timetable.data?.length ? bellClassDays(timetable.data, classList) : null), [timetable.data, classList]);

  // Hafta (hafta sonu ders yoksa gelecek hafta); tatil ve arifeler Tatil Takvimi'nden
  const todayIso = now.iso;
  const upcoming = useUpcomingHolidays();
  const weekendNoLessons = now.weekday >= 6 && !counts?.[`${shift}:${now.weekday}`];
  const monday = addIsoDays(todayIso, (weekendNoLessons ? 8 - now.weekday : 1 - now.weekday) + weekOffset * 7);
  const week = useWeekHolidays(monday);
  const halfDayEnd = settings?.halfDayEnd ?? '13:00';
  const cal: SchoolCalendar = {
    schedules,
    holidays: [...(week.data?.holidays ?? []), ...(upcoming.data?.holidays ?? [])],
    halfDays: [...(week.data?.halfDays ?? []), ...(upcoming.data?.halfDays ?? [])],
    halfDayEnd,
    lessonCounts: counts,
    bellClasses,
    overrides: overrides.data ?? [],
    dualShift: dual,
  };
  const weekdays = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => counts?.[`${shift}:${d}`] || inShift.some((s) => s.weekdays.includes(d)))];
  const classById = new Map(classList.map((c) => [c.id, c]));
  const allNames = classList.map((c) => c.name);
  const classShiftOf = (c: ClassGroup): Shift => (dual && c.shift === 'afternoon' ? 'afternoon' : 'morning');

  /** Bir günün zilleri ve ekrandaki adları ("9, 10 ve 11. sınıflar", "12. sınıflar") */
  const flowBells = (date: string): FlowBell[] => {
    const wd = isoWeekday(date);
    const bells = dayBells(date, cal).filter((b) => b.shift === shift);
    const specialIds = new Set(bells.flatMap((b) => b.classIds ?? []));
    return bells.map((b) => {
      const names = b.classIds
        ? b.classIds.map((id) => classById.get(id)?.name ?? '').filter(Boolean)
        : classList
            .filter((c) => !c.bellExempt && classShiftOf(c) === shift && !specialIds.has(c.id) && (bellClasses?.find((x) => x.id === c.id)?.counts[wd] ?? 0) > 0)
            .map((c) => c.name);
      // Okul geneli zilin sınıfları tek tek yazılmaz; yalnızca sınıfa özel zilin kimler için olduğu yazılır
      const label = b.classIds ? classSetLabel(names, allNames) : specialIds.size ? 'Diğer sınıflar' : 'Bütün sınıflar';
      return {
        ...b,
        label,
        scheduleName: schedules.find((s) => s.id === b.scheduleId)?.name ?? null,
        special: Boolean(b.classIds),
        override: (overrides.data ?? []).find((o) => o.date === date && o.target === b.target) ?? null,
      };
    });
  };
  const days = weekdays.map((d) => {
    const date = addIsoDays(monday, d - 1);
    const sd = schoolDay(date, cal, shift);
    return { date, weekday: d, holiday: sd.holiday, halfDay: sd.halfDay, bells: sd.holiday ? [] : flowBells(date) };
  });
  const selected = days.find((d) => d.date === selDate) ?? days.find((d) => d.date === todayIso) ?? days.find((d) => d.date >= todayIso) ?? days[0]!;
  const todayHoliday = schoolDay(todayIso, cal, shift).holiday;
  const todayBells = todayHoliday ? [] : flowBells(todayIso);
  const schoolCounts = schoolLessonCounts(cal);
  // Okul geneli düzenler kısa günleri de karşılar (dersler erken biter); uyarı yalnızca hiçbir düzenin yetmediği ders sayıları için
  const autoSchool = inShift.filter((s) => !s.weekdays.length && !s.classIds?.length);
  const maxAuto = Math.max(0, ...autoSchool.map(scheduleLessonCount));
  const missing = schoolCounts ? missingLessonCounts(schedules, schoolCounts, shift).filter((n) => n > maxAuto) : [];

  const halfToday = upcoming.data?.halfDays.find((h) => h.date === todayIso);
  const todayNote = todayHoliday
    ? `Bugün ${todayHoliday}: panoda zil çalmaz, sıradaki ders olarak tatilden sonraki ilk ders günü görünür.`
    : halfToday
      ? `Bugün ${halfToday.name} (yarım gün): panoda son zil ${halfDayEnd}. Bu saatten sonra başlayan dersler yapılmaz, taşan ders son zilde biter.`
      : null;

  const shiftName = dual ? (shift === 'afternoon' ? ' · Öğlenci' : ' · Sabahçı') : '';
  /** Yeni düzen: ders sayısı verilirse ilk düzenin kuralıyla (e-Okul saatleri) o kadar ders saati hazırlanır */
  const openNew = (count?: number) => {
    setEditing(null);
    const base = [...inShift].filter((s) => !s.weekdays.length && !s.classIds?.length).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
    const periods = count && base ? generatePeriods({ ...deriveRule(base.periods), count, lunchAfter: deriveRule(base.periods).lunchAfter || null, afternoonBreakMin: null }) : [];
    form.reset({ name: count ? `${count} derslik gün${shiftName}` : '', lessonCount: count ?? '', periods, classIds: [], weekdays: [] });
    setOpen(true);
  };
  const openEditor = (s: BellSchedule) => {
    setEditing(s);
    form.reset({ name: s.name, lessonCount: s.lessonCount ?? '', periods: s.periods, classIds: s.classIds ?? [], weekdays: s.weekdays });
    setOpen(true);
  };
  /** Kopya: aynı saatlerle başka bir gün ya da başka sınıflar için (ör. cuma namazı, 12. sınıfların uzun günü) */
  const openCopy = (s: BellSchedule) => {
    setEditing(null);
    form.reset({ name: `${s.name} (kopya)`, lessonCount: s.lessonCount ?? '', periods: s.periods, classIds: s.classIds ?? [], weekdays: [] });
    setOpen(true);
  };

  const submit = async () => {
    const payload = form.validate(bellScheduleSchema, {
      name: form.values.name,
      periods: form.values.periods,
      lessonCount: form.values.lessonCount === '' ? null : form.values.lessonCount,
      weekdays: form.values.weekdays,
      shift: editing ? editing.shift : shift === 'afternoon' ? 'afternoon' : null,
      sortOrder: editing?.sortOrder ?? schedules.length,
      classIds: form.values.classIds.length ? form.values.classIds : null,
    });
    if (!payload) return;
    try {
      if (editing) await ops.update.mutateAsync({ id: editing.id, body: payload });
      else await ops.create.mutateAsync(payload);
      // Okul geneli bir güne tek düzen sabitlenir: aynı günü tutan öteki okul geneli düzenlerden o gün kaldırılır
      if (!payload.classIds?.length && payload.weekdays.length) {
        for (const s of inShift.filter((x) => x.id !== editing?.id && !x.classIds?.length && x.weekdays.some((d) => payload.weekdays.includes(d)))) {
          await ops.update.mutateAsync({
            id: s.id,
            body: { name: s.name, periods: s.periods, lessonCount: s.lessonCount, shift: s.shift, sortOrder: s.sortOrder, weekdays: s.weekdays.filter((d) => !payload.weekdays.includes(d)), classIds: null },
          });
        }
      }
      setOpen(false);
    } catch (err) {
      form.fail(err);
    }
  };

  /** Bir günü okul geneli bir düzene sabitler ya da otomatiğe döndürür */
  const setDay = async (weekday: number, scheduleId: string | null) => {
    for (const s of inShift.filter((x) => !x.classIds?.length)) {
      const has = s.weekdays.includes(weekday);
      const want = s.id === scheduleId;
      if (has === want) continue;
      const weekdaysNext = want ? [...s.weekdays, weekday].sort() : s.weekdays.filter((d) => d !== weekday);
      await ops.update.mutateAsync({
        id: s.id,
        body: { name: s.name, periods: s.periods, lessonCount: s.lessonCount, shift: s.shift, sortOrder: s.sortOrder, weekdays: weekdaysNext, classIds: s.classIds ?? null },
      });
    }
  };

  /** Bu günün saatlerini kaydeder (düzenin saatlerine dönülen zilin müdahalesi silinir) */
  const saveOverride = async (changes: { bell: FlowBell; periods: Period[] | null }[], note: string, notify: boolean) => {
    for (const { bell, periods } of changes) {
      if (periods) await api(overridePath, { method: 'PUT', body: { date: selected.date, target: bell.target, periods, note: note || null, notify } });
      else if (bell.override) await api(`${overridePath}/${bell.override.id}`, { method: 'DELETE' });
    }
    await qc.invalidateQueries({ queryKey: [schoolId, 'bell-overrides'] });
    toast.success(changes.some((c) => c.periods) ? 'Bu günün zil saatleri kaydedildi; panolar güncellendi.' : 'Düzenin saatlerine dönüldü.');
  };

  const removeOverride = async (o: OverrideRow) => {
    await api(`${overridePath}/${o.id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: [schoolId, 'bell-overrides'] });
    toast.success('Geri alındı');
  };

  const targetLabel = (o: OverrideRow) => {
    if (o.target.startsWith('school:')) return 'Okul geneli';
    const s = schedules.find((x) => `schedule:${x.id}` === o.target);
    return s ? s.name : 'Silinmiş düzen';
  };
  const scheduleScope = (s: BellSchedule) => {
    const who = s.classIds?.length ? classSetLabel(s.classIds.map((id) => classById.get(id)?.name ?? '').filter(Boolean), allNames) : 'Okul geneli';
    const n = scheduleLessonCount(s);
    // Okul geneli otomatik düzen, kendinden küçük düzen olmayan ders sayılarını da karşılar (ör. 1–10 dersli günler)
    const lower = s.classIds?.length || s.weekdays.length ? n : Math.max(0, ...autoSchool.map(scheduleLessonCount).filter((x) => x < n)) + 1;
    const when = s.weekdays.length ? `${s.weekdays.map((d) => WEEKDAY_NAMES[d]).join(', ')} günleri` : lower < n ? `${lower}–${n} dersli günlerde` : `${n} dersli günlerde`;
    return `${who} · ${when}`;
  };
  const usedOn = (s: BellSchedule) => days.filter((d) => d.bells.some((b) => b.scheduleId === s.id)).map((d) => WEEKDAY_NAMES[d.weekday]!.slice(0, 3));

  const loading = list.isLoading || timetable.isLoading || classes.isLoading;
  const history = [...(overrides.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Zil Saatleri"
        description="Okul geneli zil o günün ders sayısına göre kendiliğinden seçilir (o gün en geç biten sınıfın son dersi). Belirli sınıflara özel zil de tanımlayabilirsiniz (ör. 12. sınıfların 11 dersli günü: öğle arası ve teneffüsler farklı). Bir günün saatlerine elle müdahale edebilirsiniz; ertesi gün düzen kendiliğinden geri gelir."
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
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-ink">Bu hafta zil</h2>
                <p className="text-sm text-slate-500">Her günün altında o gün çalan ziller. Bir güne tıklayınca akışı aşağıda açılır; oradan o güne elle müdahale edebilirsiniz.</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" aria-label="Önceki hafta" disabled={weekOffset <= 0} onClick={() => setWeekOffset((w) => w - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="px-2 text-sm font-semibold text-slate-600">
                  {shortDate(monday)} haftası
                </span>
                <Button size="sm" variant="secondary" aria-label="Sonraki hafta" disabled={weekOffset >= 8} onClick={() => setWeekOffset((w) => w + 1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <WeekStrip days={days} selected={selected.date} todayIso={todayIso} onSelect={setSelDate} />
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <DayFlow
              key={`${selected.date}-${shift}`}
              date={selected.date}
              isToday={selected.date === todayIso}
              nowSec={now.sec}
              holiday={selected.holiday}
              halfDay={selected.halfDay}
              endsAt={halfDayEnd}
              bells={selected.bells}
              lunchThresholdMin={lunchThresholdMin}
              editable={editable && selected.date >= todayIso}
              onSave={saveOverride}
              onPickSchedule={() => setPicking(selected.weekday)}
            />
            <aside className="space-y-5">
              <NowCards bells={todayBells} nowSec={now.sec} lunchThresholdMin={lunchThresholdMin} />

              <div className="rounded-2xl bg-surface shadow-sm ring-1 ring-slate-200/70">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="font-semibold text-ink">Zil düzenleri</h2>
                  <p className="text-xs text-slate-500">Kalıcı saatler. Okul geneli düzen kısa günlerde de çalar, dersler erken biter.</p>
                </div>
                <div className="space-y-2.5 p-4">
                  {[...inShift]
                    .sort((a, b) => Number(Boolean(a.classIds?.length)) - Number(Boolean(b.classIds?.length)) || Number(Boolean(a.weekdays.length)) - Number(Boolean(b.weekdays.length)) || scheduleLessonCount(a) - scheduleLessonCount(b))
                    .map((s) => {
                      const special = Boolean(s.classIds?.length);
                      const used = usedOn(s);
                      return (
                        <div key={s.id} className={clsx('rounded-xl p-3 ring-1', special ? 'ring-orange-200' : 'ring-slate-200')}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-ink">{s.name}</div>
                              <div className="text-xs text-slate-500">
                                {scheduleScope(s)} · {sortPeriods(s.periods)[0]?.start}–{sortPeriods(s.periods).at(-1)?.end}
                              </div>
                            </div>
                            <BellTag bell={{ special, scheduleName: special ? 'sınıfa özel' : 'okul geneli' }} />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {used.map((d) => (
                              <span key={d} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                {d}
                              </span>
                            ))}
                            {!used.length && <span className="text-[11px] text-slate-400">Bu hafta çalmıyor</span>}
                            {editable && (
                              <span className="ml-auto flex items-center gap-1.5">
                                <EditButton onClick={() => openEditor(s)} />
                                <IconButton label="Kopyala" onClick={() => openCopy(s)}>
                                  <CopyPlus className="size-3.5" />
                                </IconButton>
                                <DeleteButton onConfirm={() => ops.remove.mutate(s.id)} what={s.name} />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {editable && missing.length > 0 && (
                    <div className="space-y-2 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                      <div>
                        <b>Programda {missing.map((n) => `${n} dersli`).join(', ')} gün var ama düzeni yok.</b> Şimdilik bir büyük düzen kullanılıyor.
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {missing.map((n) => (
                          <Button key={n} size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => openNew(n)}>
                            {n} derslik gün
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-surface shadow-sm ring-1 ring-slate-200/70">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="font-semibold text-ink">Elle müdahaleler</h2>
                  <p className="text-xs text-slate-500">Yalnızca o gün için değiştirilen saatler (son 30 gün ve ileri tarihler)</p>
                </div>
                <ul className="divide-y divide-slate-100 px-5">
                  {history.map((o) => (
                    <li key={o.id} className="flex items-center gap-2 py-2.5 text-sm">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => {
                        const diff = Math.floor((Date.parse(o.date) - Date.parse(addIsoDays(todayIso, 1 - now.weekday))) / (7 * 86400_000));
                        setWeekOffset(Math.max(0, diff));
                        setSelDate(o.date);
                      }}>
                        <span className="font-semibold text-ink">
                          {shortDate(o.date)} {WEEKDAY_NAMES[isoWeekday(o.date)]}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {targetLabel(o)}
                          {o.note ? ` · ${o.note}` : ''}
                          {o.createdByName ? ` · ${o.createdByName}` : ''}
                        </span>
                      </button>
                      {o.date >= todayIso && editable && (
                        <Button size="sm" variant="ghost" onClick={() => void removeOverride(o)}>
                          Geri al
                        </Button>
                      )}
                    </li>
                  ))}
                  {!history.length && <li className="py-4 text-sm text-slate-500">Henüz yok. Bir günü açıp "Bu günü düzenle" ile başlayın.</li>}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      )}

      {!loading && <BellClassSettings classes={classList} dual={dual} editable={editable} />}

      <Modal
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={picking ? `${WEEKDAY_NAMES[picking]} günleri zil düzeni` : ''}
        description="Her hafta bu gün okul geneli için hangi düzen çalsın? Otomatikte günün ders sayısına göre seçilir."
      >
        <div className="space-y-2">
          {[{ id: null as string | null, name: 'Otomatik (ders sayısına göre)' }, ...inShift.filter((s) => !s.classIds?.length).map((s) => ({ id: s.id as string | null, name: s.name }))].map((o) => {
            const current = o.id ? inShift.find((s) => s.id === o.id)?.weekdays.includes(picking ?? 0) : !inShift.some((s) => !s.classIds?.length && s.weekdays.includes(picking ?? 0));
            return (
              <button
                key={o.id ?? 'auto'}
                type="button"
                onClick={async () => {
                  if (picking) await setDay(picking, o.id);
                  setPicking(null);
                }}
                className={clsx('flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-semibold ring-1', current ? 'ring-2 ring-ink' : 'ring-slate-200 hover:bg-slate-50')}
              >
                {o.name}
                {current && <span className="text-xs text-slate-500">şu an</span>}
              </button>
            );
          })}
        </div>
      </Modal>

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
        <Editor form={form} classes={classList} lunchThresholdMin={lunchThresholdMin} />
      </Modal>
    </>
  );
}

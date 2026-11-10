import {
  compressDay,
  computeBellStatus,
  endAfter,
  lunchBeforeNo,
  lunchIndex,
  parseClock,
  periodLabel,
  ringNow,
  setGapAfter,
  shiftPeriods,
  sortPeriods,
  validatePeriods,
  WEEKDAY_NAMES,
  type DayBell,
  type Period, errorText } from '@okulpano/shared';
import clsx from 'clsx';
import { BellRing, CalendarOff, Coffee, FastForward, Flag, Hand, Scissors, Sunrise, Sunset, Undo2, Utensils, Zap } from '../../components/icons.tsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Select, Toggle } from '../../components/ui.tsx';
import { shortDate } from './ScheduleView.tsx';

/*
 * Günün zil akışı: öğle arasına kadar herkes aynı saatlerdeyse tek akış, sonra her zil kendi sütununda ("ayrılan akış").
 * "Bu günü düzenle" açılınca saatler yerinde değişir (saat kutuları, aralarda ±5 dk, hızlı işlemler); kayıt yalnızca o
 * gün içindir, düzen değişmez.
 */

export interface OverrideRow {
  id: string;
  date: string;
  target: string;
  periods: Period[];
  note: string | null;
  createdByName: string | null;
  updatedAt: string;
}

/** Bir günün zili ve ekranda adı: "9, 10 ve 11. sınıflar" / "12. sınıflar", düzen adı ve varsa müdahale kaydı */
export interface FlowBell extends DayBell {
  label: string;
  scheduleName: string | null;
  /** Sınıfa özel zil mi (turuncu) */
  special: boolean;
  override: OverrideRow | null;
}

const toMin = (hm: string) => parseClock(hm) / 60;
const clock = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} sa${min % 60 ? ` ${min % 60} dk` : ''}` : `${min} dk`);
const weekdayOf = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const same = (a?: Period, b?: Period) => Boolean(a && b && a.no === b.no && a.start === b.start && a.end === b.end);
const samePeriods = (a: readonly Period[], b: readonly Period[]) => a.length === b.length && sortPeriods(a).every((p, i) => same(p, sortPeriods(b)[i]));

export function bellTone(special: boolean) {
  return special ? 'bg-tile-peach text-tile-peach-ink' : 'bg-tile-sky text-tile-sky-ink';
}

export function BellTag({ bell, className }: { bell: Pick<FlowBell, 'special' | 'scheduleName'>; className?: string }) {
  return (
    <span className={clsx('inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', bellTone(bell.special), className)}>
      {bell.scheduleName ?? 'Zil'}
    </span>
  );
}

export function DayFlow({
  date,
  isToday,
  nowSec,
  holiday,
  halfDay,
  endsAt,
  bells,
  lunchThresholdMin,
  editable,
  onSave,
  onPickSchedule,
}: {
  date: string;
  isToday: boolean;
  nowSec: number;
  holiday: string | null;
  halfDay: string | null;
  endsAt: string;
  bells: FlowBell[];
  lunchThresholdMin: number;
  editable: boolean;
  /** Değişen ziller: periods null ise müdahale silinir (düzenin saatleri çalar) */
  onSave: (changes: { bell: FlowBell; periods: Period[] | null }[], note: string, notify: boolean) => Promise<void>;
  /** Bu güne sabit düzen seçimi (okul geneli) */
  onPickSchedule?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Period[]>>({});
  const [scope, setScope] = useState<'all' | string>('all');
  const [selected, setSelected] = useState<{ no: number; targets: string[] } | null>(null);
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [shortened, setShortened] = useState<{ lesson: number; brk: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gün değişince düzenleme kapanır
  useEffect(() => {
    setEditing(false);
    setSelected(null);
    setError(null);
  }, [date]);

  const startEditing = () => {
    setDrafts(Object.fromEntries(bells.map((b) => [b.target, b.periods])));
    setNote(bells.find((b) => b.override?.note)?.override?.note ?? '');
    setScope('all');
    setSelected(null);
    setError(null);
    setEditing(true);
  };

  /** Seçili kapsamdaki (ya da verilen) zillere dönüşüm uygular */
  const apply = (fn: (p: Period[], b: FlowBell) => Period[], targets?: string[]) =>
    setDrafts((d) => {
      const next = { ...d };
      for (const b of bells) {
        const inScope = targets ? targets.includes(b.target) : scope === 'all' || scope === b.target;
        if (inScope) next[b.target] = fn(d[b.target] ?? b.periods, b);
      }
      return next;
    });

  // Ekranda gösterilen saatler: düzenlemede taslak
  const shown: FlowBell[] = bells.map((b) => ({ ...b, periods: sortPeriods(editing ? (drafts[b.target] ?? b.periods) : b.periods) }));
  const changed = editing ? bells.filter((b) => !samePeriods(drafts[b.target] ?? b.periods, b.periods)) : [];

  // Ortak gövde: bütün zillerde aynı olan baştaki dersler (öğle arasına kadar genelde aynı)
  const common = useMemo(() => {
    if (shown.length < 2) return 0;
    let k = 0;
    const lists = shown.map((b) => b.periods);
    while (lists.every((l) => same(l[k], lists[0]![k]))) k++;
    return k;
  }, [shown]);

  const status = (b: FlowBell) => (isToday && b.periods.length ? computeBellStatus(b.periods, nowSec, lunchThresholdMin) : null);
  const weekday = weekdayOf(date);
  const anyOverride = bells.filter((b) => b.override);
  const canEdit = editable && !holiday && bells.some((b) => b.periods.length);

  const save = async () => {
    for (const b of changed) {
      const problem = validatePeriods(drafts[b.target]!);
      if (problem) return setError(`${b.label}: ${problem}`);
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        changed.map((b) => {
          const periods = drafts[b.target]!;
          // Düzenin saatlerine dönüldüyse müdahale silinir
          return { bell: b, periods: samePeriods(periods, b.basePeriods) ? null : periods };
        }),
        note.trim(),
        notify,
      );
      setEditing(false);
    } catch (e) {
      setError(errorText(e, 'Kaydedilemedi'));
    } finally {
      setSaving(false);
    }
  };

  const revertAll = async () => {
    setSaving(true);
    try {
      await onSave(
        anyOverride.map((b) => ({ bell: b, periods: null })),
        '',
        false,
      );
    } finally {
      setSaving(false);
    }
  };

  /** Bir saat listesinin akışı; `targets` bu satırların ait olduğu ziller, `base` değişiklik karşılaştırması için */
  const renderList = (periods: Period[], targets: string[], base: Period[], opts: { tone: 'std' | 'alt'; leadGap?: Period | null; bellsFor: FlowBell[] }) => {
    const items: ReactNode[] = [];
    const baseByNo = new Map(base.map((p) => [p.no, p]));
    const live = opts.bellsFor.map(status).find((s) => s && (s.kind === 'lesson' || s.kind === 'break'));
    const prevOf = (i: number) => (i === 0 ? (opts.leadGap ?? null) : periods[i - 1]!);
    // Öğle arası: zilin bütün günündeki en uzun ara (liste günün bir parçası olabilir)
    const lunchNos = new Set(opts.bellsFor.map((b) => lunchBeforeNo(b.periods, lunchThresholdMin)));
    periods.forEach((p, i) => {
      const prev = prevOf(i);
      if (prev) {
        const gap = toMin(p.start) - toMin(prev.end);
        const lunch = lunchNos.has(p.no);
        const gapNow = live?.kind === 'break' && live.prev.no === prev.no;
        const baseGap = baseByNo.get(p.no) && baseByNo.get(prev.no) ? toMin(baseByNo.get(p.no)!.start) - toMin(baseByNo.get(prev.no)!.end) : gap;
        items.push(
          <li key={`g${p.no}`} className="grid grid-cols-[4.5rem_1.5rem_1fr] items-center">
            <span />
            <span className="flex h-9 justify-center">
              <span className={clsx('w-0.5 border-l-2 border-dashed', lunch ? 'border-amber-300' : 'border-emerald-300')} />
            </span>
            <span className="flex items-center gap-2">
              <span
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  lunch ? 'bg-tile-sun text-tile-sun-ink' : opts.tone === 'alt' ? 'bg-tile-peach text-tile-peach-ink' : 'bg-tile-mint text-tile-mint-ink',
                  gapNow && 'ring-2 ring-emerald-500',
                )}
              >
                {lunch ? <Utensils className="size-3" /> : <Coffee className="size-3" />}
                {lunch ? 'Öğle arası' : 'Teneffüs'} · {duration(gap)}
                {gapNow && ' · şu an'}
              </span>
              {gap !== baseGap && (
                <span className="rounded-full bg-tile-rose px-2 py-0.5 text-[11px] font-bold text-tile-rose-ink">
                  <Hand className="mr-0.5 inline size-3" />
                  {gap > baseGap ? '+' : ''}
                  {gap - baseGap} dk
                </span>
              )}
              {editing && (
                <span className="ml-auto flex gap-1">
                  {[-5, 5].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => apply((list) => setGapAfter(list, prev.no, Math.max(0, gap + d)), targets)}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
                      aria-label={`Arayı 5 dakika ${d < 0 ? 'kısalt' : 'uzat'}`}
                    >
                      {d < 0 ? '−5' : '+5'}
                    </button>
                  ))}
                </span>
              )}
            </span>
          </li>,
        );
      }
      const orig = baseByNo.get(p.no);
      const moved = orig && !same(orig, p);
      const active = live?.kind === 'lesson' && live.period.no === p.no && live.period.start === p.start;
      const progress = active && live?.kind === 'lesson' ? 1 - live.remainingSec / live.totalSec : null;
      const isSel = selected?.no === p.no && selected.targets.join() === targets.join();
      items.push(
        <li key={`p${p.no}`} className="grid grid-cols-[4.5rem_1.5rem_1fr] items-stretch">
          <span className="flex flex-col justify-center pr-3 text-right tabular-nums">
            {editing ? (
              <>
                <TimeBox value={p.start} onChange={(v) => apply((list) => list.map((x) => (x.no === p.no ? { ...x, start: v } : x)), targets)} label={`${periodLabel(p)} başlangıç`} />
                <TimeBox value={p.end} onChange={(v) => apply((list) => list.map((x) => (x.no === p.no ? { ...x, end: v } : x)), targets)} label={`${periodLabel(p)} bitiş`} small />
              </>
            ) : (
              <>
                <span className={clsx('text-base font-bold', active ? 'text-brand-600' : 'text-ink')}>{p.start}</span>
                <span className="text-xs text-slate-400">{p.end}</span>
              </>
            )}
            {moved && <span className="text-[11px] text-slate-400 line-through">{orig.start}</span>}
          </span>
          <span className="relative flex justify-center">
            <span className="absolute inset-y-0 w-0.5 bg-slate-200" />
            <span className={clsx('relative z-10 my-auto size-3.5 rounded-full ring-4 ring-surface', active ? 'bg-brand-500' : 'bg-brand-300')} />
          </span>
          <span
            onClick={editing ? () => setSelected(isSel ? null : { no: p.no, targets }) : undefined}
            title={editing ? 'Seçin: hızlı işlemler bu dersten itibaren uygulanır' : undefined}
            className={clsx(
              'relative my-1 flex min-w-0 items-center gap-3 rounded-xl px-4 py-2.5 ring-1 select-none',
              active
                ? 'bg-brand-600 text-white shadow-md ring-brand-600'
                : moved
                  ? 'bg-tile-rose/40 ring-2 ring-rose-400 ring-dashed'
                  : opts.tone === 'alt'
                    ? 'bg-tile-peach/45 ring-orange-200'
                    : 'bg-slate-50/70 ring-slate-200/80',
              editing && 'cursor-pointer',
              isSel && 'ring-2 ring-ink',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className={clsx('block truncate text-[15px] font-bold', active ? 'text-white' : 'text-ink')}>{periodLabel(p)}</span>
              {progress !== null && (
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/25">
                  <span className="block h-full rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
                </span>
              )}
            </span>
            {active ? (
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">Şu an · {Math.ceil((live as { remainingSec: number }).remainingSec / 60)} dk</span>
            ) : moved ? (
              <span className="shrink-0 rounded-full bg-tile-rose px-2 py-0.5 text-[11px] font-bold text-tile-rose-ink">
                <Hand className="mr-0.5 inline size-3" />
                elle
              </span>
            ) : (
              <span className="shrink-0 text-xs font-medium text-slate-400">{duration(toMin(p.end) - toMin(p.start))}</span>
            )}
          </span>
        </li>,
      );
    });
    return <ol>{items}</ol>;
  };

  const sectionTitle = (icon: ReactNode, text: ReactNode) => (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
      {icon}
      {text}
    </div>
  );

  // Akış: tek zilde sabah / öğleden sonra iki sütun; birden çok zilde ortak gövde ve zil başına sütun
  let flow: ReactNode;
  const first = shown[0];
  if (!first || !first.periods.length) {
    flow = <p className="p-6 text-sm text-slate-500">Bu gün ders yok.</p>;
  } else if (shown.length === 1) {
    const ps = first.periods;
    const lunchAt = lunchIndex(ps, lunchThresholdMin);
    const halves = lunchAt > 0 ? [ps.slice(0, lunchAt), ps.slice(lunchAt)] : [ps];
    flow = (
      <div className={clsx('grid gap-x-8 p-4 sm:p-6', halves.length > 1 && 'lg:grid-cols-2')}>
        {halves.map((h, hi) => (
          <div key={hi} className="min-w-0">
            {halves.length > 1 &&
              sectionTitle(
                hi === 0 ? <Sunrise className="size-4" /> : <Sunset className="size-4" />,
                <>
                  {hi === 0 ? 'Sabah' : 'Öğleden sonra'}
                  <span className="font-medium tracking-normal normal-case">
                    · {h[0]!.start}–{h[h.length - 1]!.end}
                  </span>
                </>,
              )}
            {renderList(h, [first.target], first.basePeriods, { tone: first.special ? 'alt' : 'std', leadGap: hi === 1 ? halves[0]!.at(-1) : null, bellsFor: [first] })}
          </div>
        ))}
      </div>
    );
  } else {
    const trunk = first.periods.slice(0, common);
    flow = (
      <div className="p-4 sm:p-6">
        {trunk.length > 0 && (
          <>
            {sectionTitle(
              <Sunrise className="size-4" />,
              <>
                Herkes
                <span className="font-medium tracking-normal normal-case">
                  · {trunk[0]!.start}–{trunk[trunk.length - 1]!.end}
                </span>
              </>,
            )}
            <div className="max-w-xl">{renderList(trunk, shown.map((b) => b.target), first.basePeriods, { tone: 'std', bellsFor: shown })}</div>
            <div className="my-4 flex items-center gap-3">
              <span className="h-0.5 flex-1 border-t-2 border-dashed border-amber-300" />
              <span className="rounded-full bg-tile-sun px-3 py-1 text-xs font-bold text-tile-sun-ink">Zil burada ayrılıyor</span>
              <span className="h-0.5 flex-1 border-t-2 border-dashed border-amber-300" />
            </div>
          </>
        )}
        <div className={clsx('grid gap-x-8 gap-y-6', shown.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-2 2xl:grid-cols-3')}>
          {shown.map((b) => (
            <div key={b.target} className="min-w-0">
              {sectionTitle(<BellTag bell={b} />, <span className="text-ink">{b.label}</span>)}
              {renderList(b.periods.slice(common), [b.target], b.basePeriods, { tone: b.special ? 'alt' : 'std', leadGap: common ? b.periods[common - 1] : null, bellsFor: [b] })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-slate-200/70">
      {/* Başlık solda, düzen seçimi ve "Bu günü düzenle" her gün sağ üstte aynı yerde */}
      <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink">
            {isToday ? 'Bugün · ' : ''}
            {WEEKDAY_NAMES[weekday]}, {shortDate(date)}
            {!holiday && bells.length > 1 && <span className="ml-2 rounded-full bg-tile-peach px-2 py-0.5 align-middle text-xs font-bold text-tile-peach-ink">{bells.length} zil</span>}
          </h2>
          <p className="text-sm text-slate-500">
            {holiday
              ? 'Tatil'
              : bells.map((b) => `${b.special ? `${b.label}: ` : ''}${b.scheduleName ?? 'zil'}${b.lessonCount ? ` (${b.lessonCount} ders)` : ''}`).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {onPickSchedule && editable && !editing && !holiday && (
            <Button size="sm" variant="ghost" onClick={onPickSchedule}>
              Bu güne düzen seç
            </Button>
          )}
          {canEdit && (
            <div className="flex items-center gap-2 rounded-full bg-tile-rose/50 px-3 py-1.5">
              <Hand className="size-4 text-tile-rose-ink" />
              <Toggle checked={editing} onChange={(v) => (v ? startEditing() : setEditing(false))} label="Bu günü düzenle" />
            </div>
          )}
        </div>
      </header>

      {holiday && (
        <div className="flex items-start gap-3 border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-800 sm:px-6">
          <CalendarOff className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>{holiday}.</b> Tam gün tatil; zil çalmaz.{' '}
            <Link to="/tatil-takvimi" className="font-semibold underline-offset-2 hover:underline">
              Tatil Takvimi
            </Link>
          </span>
        </div>
      )}
      {halfDay && !holiday && (
        <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900 sm:px-6">
          <CalendarOff className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>{halfDay}:</b> yarım gün, son zil {endsAt}. Bu saatten sonra başlayan dersler yapılmaz.
          </span>
        </div>
      )}

      {!editing && anyOverride.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-rose-100 bg-tile-rose/40 px-5 py-3 text-sm text-tile-rose-ink sm:px-6">
          <Hand className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <b>Bu gün elle değiştirildi</b> ({anyOverride.map((b) => b.label).join(', ')})
            {anyOverride[0]!.override!.note ? `: ${anyOverride[0]!.override!.note}` : ''}
            <span className="opacity-75"> · {anyOverride[0]!.override!.createdByName ?? ''}</span>
          </span>
          {editable && (
            <Button size="sm" variant="secondary" icon={<Undo2 className="size-3.5" />} loading={saving} onClick={() => void revertAll()}>
              Geri al
            </Button>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-3 border-b border-rose-100 bg-tile-rose/25 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-tile-rose-ink">
              <Hand className="mr-1 inline size-4" />
              {WEEKDAY_NAMES[weekday]}, {shortDate(date)} için elle düzenleniyor. Kalıcı düzen değişmez.
            </span>
            {bells.length > 1 && (
              <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                Hızlı işlemler:
                <Select plain aria-label="Hızlı işlemlerin kapsamı" value={scope} onChange={(e) => setScope(e.target.value)} className="h-8 rounded-full border border-slate-200 bg-surface px-3 text-xs font-bold">
                  <option value="all">Herkes</option>
                  {bells.map((b) => (
                    <option key={b.target} value={b.target}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<FastForward className="size-3.5" />} disabled={!selected} onClick={() => selected && apply((p) => shiftPeriods(p, selected.no, -5), selected.targets)}>
              Seçili dersten itibaren −5 dk
            </Button>
            <Button size="sm" variant="secondary" icon={<FastForward className="size-3.5" />} disabled={!selected} onClick={() => selected && apply((p) => shiftPeriods(p, selected.no, 5), selected.targets)}>
              +5 dk
            </Button>
            <Button size="sm" variant="secondary" icon={<Flag className="size-3.5" />} disabled={!selected} onClick={() => selected && apply((p) => endAfter(p, selected.no), selected.targets)}>
              Seçili derste bitir
            </Button>
            <Button size="sm" variant="secondary" icon={<Scissors className="size-3.5" />} onClick={() => setShortened(shortened ? null : { lesson: 30, brk: 5 })}>
              Kısaltılmış gün
            </Button>
            {isToday && (
              <Button size="sm" variant="secondary" icon={<Zap className="size-3.5" />} onClick={() => apply((p) => ringNow(p, clock(nowSec)))}>
                Zili şimdi çal
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => apply((_, b) => b.basePeriods)}>
              Düzene geri dön
            </Button>
          </div>
          {shortened && (
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label className="text-xs font-semibold text-slate-600">
                Ders (dk)
                <Input type="number" min={10} max={60} value={shortened.lesson} onChange={(e) => setShortened({ ...shortened, lesson: Number(e.target.value) })} className="mt-1 w-20" />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Teneffüs (dk)
                <Input type="number" min={0} max={30} value={shortened.brk} onChange={(e) => setShortened({ ...shortened, brk: Number(e.target.value) })} className="mt-1 w-20" />
              </label>
              <Button
                size="sm"
                onClick={() => {
                  apply((p) => compressDay(p, shortened.lesson, shortened.brk, lunchThresholdMin));
                  setShortened(null);
                }}
              >
                Uygula
              </Button>
              <span className="text-xs text-slate-500">İlk ders aynı saatte başlar, öğle arası korunur.</span>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Saat kutularına yazın ya da aralardaki −5 / +5 ile teneffüsü ve öğle arasını değiştirin (sonraki dersler kayar). Bir derse tıklayınca seçilir; hızlı işlemler o dersten itibaren uygulanır.
          </p>
        </div>
      )}

      {!holiday && flow}

      {editing && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Neden? (ör. tören, toplantı)" className="max-w-xs" />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-current" />
            Öğretmenlere bildir
          </label>
          {error && <span className="text-sm font-semibold text-rose-600">{error}</span>}
          <span className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
            <Button loading={saving} disabled={!changed.length} onClick={() => void save()} className="!bg-rose-600 hover:!bg-rose-500">
              {changed.length ? 'Bu gün için kaydet' : 'Değişiklik yok'}
            </Button>
          </span>
        </div>
      )}
    </section>
  );
}

/** 24 saatlik saat kutusu (SS:DD): tarayıcı diline bağlı 12 saat biçimi olmasın diye düz yazı; geçerli olunca uygulanır */
/** 24 saat biçiminde saat kutusu ("0830", "8.30" de olur); Enter ya da odaktan çıkınca kaydedilir */
export function TimeBox({ value, onChange, label, small, className }: { value: string; onChange: (v: string) => void; label: string; small?: boolean; className?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(text.trim());
    const hm = m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null;
    if (hm && hm !== value) onChange(hm);
    else setText(value);
  };
  return (
    <input
      inputMode="numeric"
      value={text}
      aria-label={label}
      maxLength={5}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={className ?? clsx('w-[3.6rem] rounded-md border border-slate-200 bg-surface px-1.5 text-right tabular-nums', small ? 'mt-0.5 text-xs text-slate-500' : 'text-sm font-bold text-ink')}
    />
  );
}

/** Bugün: her zilin "Şu an" kartı */
export function NowCards({ bells, nowSec, lunchThresholdMin }: { bells: FlowBell[]; nowSec: number; lunchThresholdMin: number }) {
  return (
    <>
      {bells
        .filter((b) => b.periods.length)
        .map((b) => {
          const s = computeBellStatus(b.periods, nowSec, lunchThresholdMin);
          const min = 'remainingSec' in s ? Math.ceil(s.remainingSec / 60) : null;
          const title =
            s.kind === 'lesson' ? periodLabel(s.period) : s.kind === 'break' ? (s.isLunch ? 'Öğle arası' : 'Teneffüs') : s.kind === 'before' ? 'Dersler başlamadı' : s.kind === 'after' ? 'Dersler bitti' : 'Zil yok';
          const caption = s.kind === 'lesson' ? 'kaldı' : s.kind === 'break' ? `sonra ${periodLabel(s.next)}` : s.kind === 'before' ? `sonra ilk ders (${s.next.start})` : '';
          const progress = s.kind === 'lesson' || s.kind === 'break' ? 1 - s.remainingSec / s.totalSec : null;
          return (
            <div key={b.target} className={clsx('rounded-2xl p-5 text-white shadow-sm', b.special ? 'bg-orange-600' : 'bg-brand-600')}>
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-white/75 uppercase">
                <BellRing className="size-4" /> Şu an · {b.label}
                {b.overridden && <Hand className="size-3.5" />}
              </div>
              <div className="mt-2 text-2xl font-bold">{title}</div>
              {min != null && (
                <div className="mt-1">
                  <span className="text-4xl font-extrabold tabular-nums">{duration(min)}</span> <span className="text-sm text-white/80">{caption}</span>
                </div>
              )}
              {progress != null && (
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-surface" style={{ width: `${progress * 100}%` }} />
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}

/** Hafta şeridi: her günün altında o gün çalan ziller; tıklanan gün seçilir */
export function WeekStrip({
  days,
  selected,
  todayIso,
  onSelect,
}: {
  days: { date: string; weekday: number; holiday: string | null; halfDay: string | null; bells: FlowBell[] }[];
  selected: string;
  todayIso: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-5">
      {days.map((d) => {
        const on = d.date === selected;
        const manual = d.bells.some((b) => b.overridden);
        return (
          <button
            key={d.date}
            type="button"
            onClick={() => onSelect(d.date)}
            className={clsx(
              'flex min-w-0 flex-col gap-1.5 rounded-2xl p-3 text-left transition',
              on ? 'ring-2 ring-ink' : 'ring-1 ring-slate-200 hover:ring-slate-300',
              d.date < todayIso && 'opacity-60',
            )}
          >
            <span className="flex justify-between text-xs font-bold tracking-wide text-slate-600 uppercase">
              {WEEKDAY_NAMES[d.weekday]}
              <span className="font-medium normal-case text-slate-400">
                {shortDate(d.date)}
                {d.date === todayIso && ' · bugün'}
              </span>
            </span>
            {d.holiday ? (
              <span className="text-sm font-semibold text-rose-600">{d.holiday}</span>
            ) : (
              <>
                <span className="text-lg font-bold text-ink">{d.bells.filter((b) => b.periods.length).length || 'Ders yok'}{d.bells.some((b) => b.periods.length) ? ' zil' : ''}</span>
                {d.bells
                  .filter((b) => b.periods.length)
                  .map((b) => (
                    // Sınıf adı yalnızca sınıfa özel zilde (kimler için); okul geneli zilde yalnızca düzen adı
                    <span key={b.target} className="flex min-w-0 items-center justify-between gap-2 text-xs text-slate-600">
                      {b.special && <span className="truncate">{b.label}</span>}
                      <BellTag bell={b} />
                    </span>
                  ))}
                {d.halfDay && <span className="rounded-full bg-tile-sun px-2 py-0.5 text-[11px] font-bold text-tile-sun-ink">Arife · yarım gün</span>}
                {manual && (
                  <span className="rounded-full bg-tile-rose px-2 py-0.5 text-[11px] font-bold text-tile-rose-ink">
                    <Hand className="mr-0.5 inline size-3" />
                    elle değiştirildi
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

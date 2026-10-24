import { computeBellStatus, parseClock, periodLabel, pickSchedule, sortPeriods, WEEKDAY_NAMES, WEEKDAY_SHORT, type Period } from '@okulpano/shared';
import clsx from 'clsx';
import { BellRing, Clock, Coffee, CopyPlus, Pencil, Sunrise, Sunset, Utensils } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { DeleteButton } from '../../components/ui.tsx';
import type { BellSchedule } from '../../lib/data.ts';

type Segment =
  | { kind: 'lesson'; period: Period; start: number; end: number }
  | { kind: 'break' | 'lunch'; start: number; end: number };

function segments(periods: Period[], lunchMin: number): Segment[] {
  const sorted = sortPeriods(periods);
  const out: Segment[] = [];
  sorted.forEach((p, i) => {
    const start = parseClock(p.start);
    const end = parseClock(p.end);
    out.push({ kind: 'lesson', period: p, start, end });
    const next = sorted[i + 1];
    if (next) {
      const ns = parseClock(next.start);
      if (ns > end) out.push({ kind: ns - end >= lunchMin * 60 ? 'lunch' : 'break', start: end, end: ns });
    }
  });
  return out;
}

function duration(sec: number): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h} sa${m % 60 ? ` ${m % 60} dk` : ''}` : `${m} dk`;
}
const clock = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;

/** Yerel saatle güncellenen "şu an" (yalnızca vurgu için) */
export function useNow() {
  const read = () => {
    const d = new Date();
    return { weekday: ((d.getDay() + 6) % 7) + 1, sec: d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() };
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const t = setInterval(() => setNow(read()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Haftanın 7 günü ve her güne düşen çizelge (panoda da aynı kural: listede ilk eşleşen) */
export function WeekCoverage({
  schedules,
  day,
  today,
  onDay,
}: {
  schedules: BellSchedule[];
  /** Seçili gün */
  day: number;
  today: number;
  onDay: (d: number) => void;
}) {
  // Hafta sonu yalnızca bir çizelgede seçiliyse gösterilir
  const days = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => schedules.some((x) => x.weekdays.includes(d)))];
  return (
    <div className={clsx('grid gap-1.5 sm:gap-2', days.length === 7 ? 'grid-cols-7' : days.length === 6 ? 'grid-cols-6' : 'grid-cols-5')}>
      {days.map((d) => {
        const s = pickSchedule(schedules, d);
        const sorted = s ? sortPeriods(s.periods) : [];
        const active = d === day;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onDay(d)}
            className={clsx(
              'min-w-0 rounded-2xl px-2 py-2.5 text-left transition sm:px-3',
              active
                ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-[0_10px_24px_-12px_rgba(19,112,143,0.8)]'
                : 'bg-slate-50 ring-1 ring-slate-200/80 hover:bg-surface hover:ring-brand-200',
            )}
          >
            <div className={clsx('flex items-center gap-1 text-xs font-semibold', active ? 'text-white/85' : d === today ? 'text-brand-700' : 'text-slate-500')}>
              <span className="sm:hidden">{WEEKDAY_SHORT[d]}</span>
              <span className="hidden sm:inline">{WEEKDAY_NAMES[d]}</span>
              {d === today && <span className={clsx('size-1.5 rounded-full', active ? 'bg-white' : 'bg-brand-500')} title="Bugün" />}
            </div>
            {s && sorted.length ? (
              <>
                <div className={clsx('mt-0.5 truncate text-sm font-bold tabular-nums', active ? 'text-white' : 'text-ink')}>
                  {sorted[0]!.start}
                  <span className="hidden sm:inline">–{sorted[sorted.length - 1]!.end}</span>
                </div>
                <div className={clsx('hidden truncate text-[11px] sm:block', active ? 'text-white/75' : 'text-slate-500')}>
                  {sorted.length} ders · {s.name}
                </div>
              </>
            ) : (
              <div className={clsx('mt-0.5 text-sm', active ? 'text-white/80' : 'text-slate-400')}>Ders yok</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Stat({ icon, label, value, tone = 'slate' }: { icon: ReactNode; label: string; value: string; tone?: 'slate' | 'amber' | 'emerald' }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={clsx(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          tone === 'amber' ? 'bg-amber-50 text-amber-600' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
        )}
      >
        {icon}
      </span>
      <span className="flex-1 text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-ink tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Seçili zil çizelgesinin tam sayfa görünümü: solda saat cetvelli zaman şeridi ve ders kutuları,
 * sağda canlı durum ve özet. Bugün bu çizelge geçerliyse o anki ders / teneffüs vurgulanır.
 */
export function ScheduleView({
  schedule,
  editable,
  lunchThresholdMin,
  onEdit,
  onCopy,
  onDelete,
}: {
  schedule: BellSchedule;
  editable: boolean;
  lunchThresholdMin: number;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const now = useNow();
  const segs = segments(schedule.periods, lunchThresholdMin);
  const lessons = segs.filter((s): s is Extract<Segment, { kind: 'lesson' }> => s.kind === 'lesson');
  const gaps = segs.filter((s) => s.kind !== 'lesson');
  const dayStart = segs[0]?.start ?? 0;
  const dayEnd = segs[segs.length - 1]?.end ?? 1;
  const span = Math.max(1, dayEnd - dayStart);
  const lunch = gaps.find((s) => s.kind === 'lunch');
  const lessonTotal = lessons.reduce((a, s) => a + s.end - s.start, 0);
  const breakTotal = gaps.filter((s) => s.kind === 'break').reduce((a, s) => a + s.end - s.start, 0);

  const isToday = schedule.weekdays.includes(now.weekday);
  const status = isToday ? computeBellStatus(schedule.periods, now.sec, lunchThresholdMin) : null;
  const activeStart =
    status?.kind === 'lesson' ? parseClock(status.period.start) : status?.kind === 'break' ? parseClock(status.prev.end) : null;
  const nowPct = isToday && now.sec >= dayStart && now.sec <= dayEnd ? ((now.sec - dayStart) / span) * 100 : null;

  // Saat cetveli: ilk tam saatten son tam saate
  const ticks: number[] = [];
  for (let h = Math.ceil(dayStart / 3600) * 3600; h <= dayEnd; h += 3600) ticks.push(h);

  // Öğle arası varsa gün iki parçada gösterilir (öğle arası ilk parçanın sonunda kalır)
  const lunchIndex = segs.findIndex((x) => x.kind === 'lunch');
  const halves = lunchIndex > 0 ? [segs.slice(0, lunchIndex + 1), segs.slice(lunchIndex + 1)].filter((h) => h.length) : [segs];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      {/* Ana alan */}
      <section className="min-w-0 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-slate-200/70">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-ink">{schedule.name}</h2>
            <p className="text-sm text-slate-500">
              {schedule.weekdays.map((d) => WEEKDAY_NAMES[d]).join(', ') || 'Gün seçilmemiş'}
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500 sm:flex">
            <span className="size-2.5 rounded-sm bg-brand-500" /> Ders
            <span className="ml-2 size-2.5 rounded-sm bg-emerald-400" /> Teneffüs
            <span className="ml-2 size-2.5 rounded-sm bg-amber-400" /> Öğle
          </div>
        </header>

        {/* Zaman şeridi */}
        <div className="px-5 pt-6 pb-2 sm:px-6">
          <div className="relative">
            <div className="flex h-14 overflow-hidden rounded-xl bg-slate-100">
              {segs.map((s, i) => (
                <div
                  key={i}
                  title={s.kind === 'lesson' ? `${periodLabel(s.period)} · ${s.period.start}–${s.period.end}` : `${s.kind === 'lunch' ? 'Öğle arası' : 'Teneffüs'} · ${duration(s.end - s.start)}`}
                  style={{ width: `${((s.end - s.start) / span) * 100}%` }}
                  className={clsx(
                    'flex min-w-0 items-center justify-center text-sm font-bold',
                    s.kind === 'lesson' ? 'bg-brand-500 text-white' : s.kind === 'lunch' ? 'bg-amber-400 text-amber-950' : 'bg-emerald-400',
                    i > 0 && 'border-l-2 border-surface',
                    activeStart === s.start && 'ring-4 ring-slate-900/80 ring-inset',
                  )}
                >
                  {s.kind === 'lesson' ? <span className="truncate px-1">{s.period.no}</span> : s.kind === 'lunch' ? <Utensils className="size-4" /> : null}
                </div>
              ))}
            </div>
            {nowPct != null && (
              <div className="pointer-events-none absolute -top-2 -bottom-2 w-0.5 rounded bg-rose-500" style={{ left: `${nowPct}%` }}>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-rose-500 px-1.5 text-[10px] font-bold whitespace-nowrap text-white">
                  {clock(now.sec)}
                </span>
              </div>
            )}
          </div>
          <div className="relative mt-2 h-5 text-[11px] font-medium text-slate-400 tabular-nums">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${((t - dayStart) / span) * 100}%` }}>
                {clock(t)}
              </span>
            ))}
          </div>
        </div>

        {/* Günün akışı: dikey zaman çizelgesi; öğle arası varsa sabah / öğleden sonra iki sütun */}
        <div className={clsx('grid gap-x-8 p-4 sm:p-6', halves.length > 1 && 'lg:grid-cols-2')}>
          {halves.map((half, hi) => (
            <div key={hi} className="min-w-0">
              {halves.length > 1 && (
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  {hi === 0 ? <Sunrise className="size-4" /> : <Sunset className="size-4" />}
                  {hi === 0 ? 'Sabah' : 'Öğleden sonra'}
                  <span className="font-medium tracking-normal normal-case">
                    · {clock(half[0]!.start)}–{clock(half[half.length - 1]!.end)}
                  </span>
                </div>
              )}
              <ol>
                {half.map((seg, i) => {
                  if (seg.kind !== 'lesson') {
                    const gapActive = activeStart === seg.start && status?.kind === 'break';
                    return (
                      <li key={`g${seg.start}`} className="grid grid-cols-[4.5rem_1.5rem_1fr] items-center">
                        <span />
                        <span className="flex h-9 justify-center">
                          <span className={clsx('w-0.5 border-l-2 border-dashed', seg.kind === 'lunch' ? 'border-amber-300' : 'border-emerald-300')} />
                        </span>
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1.5 justify-self-start rounded-full px-2.5 py-0.5 text-xs font-semibold',
                            seg.kind === 'lunch' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-emerald-50 text-emerald-700',
                            gapActive && 'ring-2 ring-emerald-500',
                          )}
                        >
                          {seg.kind === 'lunch' ? <Utensils className="size-3" /> : <Coffee className="size-3" />}
                          {seg.kind === 'lunch' ? 'Öğle arası' : 'Teneffüs'} · {duration(seg.end - seg.start)}
                          {gapActive && ' · şu an'}
                        </span>
                      </li>
                    );
                  }
                  const active = activeStart === seg.start && status?.kind === 'lesson';
                  const progress = active && status?.kind === 'lesson' ? 1 - status.remainingSec / status.totalSec : null;
                  return (
                    <li key={seg.start} className="grid grid-cols-[4.5rem_1.5rem_1fr] items-stretch">
                      <span className="flex flex-col justify-center pr-3 text-right tabular-nums">
                        <span className={clsx('text-base font-bold', active ? 'text-brand-600' : 'text-ink')}>{seg.period.start}</span>
                        <span className="text-xs text-slate-400">{seg.period.end}</span>
                      </span>
                      <span className="relative flex justify-center">
                        <span className="absolute w-0.5 bg-slate-200" style={{ top: i === 0 ? '50%' : 0, bottom: i === half.length - 1 ? '50%' : 0 }} />
                        <span
                          className={clsx(
                            'relative z-10 my-auto size-3.5 rounded-full ring-4 ring-surface',
                            active ? 'bg-brand-500' : status && seg.end <= now.sec && isToday ? 'bg-slate-300' : 'bg-brand-300',
                          )}
                        />
                      </span>
                      <span
                        className={clsx(
                          'my-1 flex min-w-0 items-center gap-3 rounded-xl px-4 py-2.5 ring-1 transition',
                          active ? 'bg-brand-600 text-white shadow-md ring-brand-600' : 'bg-slate-50/70 ring-slate-200/80',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className={clsx('block truncate text-[15px] font-bold', active ? 'text-white' : 'text-ink')}>{periodLabel(seg.period)}</span>
                          {progress !== null && (
                            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/25">
                              <span className="block h-full rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
                            </span>
                          )}
                        </span>
                        {active ? (
                          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">Şu an</span>
                        ) : (
                          <span className="shrink-0 text-xs font-medium text-slate-400">{duration(seg.end - seg.start)}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* Yan panel */}
      <aside className="space-y-5">
        <div
          className={clsx(
            'rounded-2xl p-5 text-white shadow-sm',
            status?.kind === 'break' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-brand-500 to-brand-600',
          )}
        >
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-white/75 uppercase">
            <BellRing className="size-4" /> {isToday ? 'Şu an' : 'Bugün geçerli değil'}
          </div>
          {status?.kind === 'lesson' && (
            <>
              <div className="mt-2 text-2xl font-bold">{periodLabel(status.period)}</div>
              <div className="mt-1 text-4xl font-extrabold tabular-nums">{duration(status.remainingSec)}</div>
              <div className="text-sm text-white/80">kaldı · {status.period.end}'de zil</div>
            </>
          )}
          {status?.kind === 'break' && (
            <>
              <div className="mt-2 text-2xl font-bold">{status.isLunch ? 'Öğle arası' : 'Teneffüs'}</div>
              <div className="mt-1 text-4xl font-extrabold tabular-nums">{duration(status.remainingSec)}</div>
              <div className="text-sm text-white/80">sonra {periodLabel(status.next)}</div>
            </>
          )}
          {status?.kind === 'before' && (
            <>
              <div className="mt-2 text-2xl font-bold">Dersler başlamadı</div>
              <div className="text-sm text-white/80">İlk ders {status.next.start}'de · {duration(status.remainingSec)} sonra</div>
            </>
          )}
          {status?.kind === 'after' && <div className="mt-2 text-2xl font-bold">Dersler bitti</div>}
          {!isToday && <div className="mt-2 text-sm text-white/85">Bu çizelge {schedule.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ')} günleri kullanılır.</div>}
          {status && (status.kind === 'lesson' || status.kind === 'break') && (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-surface" style={{ width: `${(1 - status.remainingSec / status.totalSec) * 100}%` }} />
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-surface px-5 py-3 shadow-sm ring-1 ring-slate-200/70">
          <Stat icon={<BellRing className="size-4" />} label="Ders sayısı" value={`${lessons.length}`} />
          <Stat icon={<Sunrise className="size-4" />} label="İlk ders" value={segs.length ? clock(dayStart) : '—'} />
          <Stat icon={<Sunset className="size-4" />} label="Son zil" value={segs.length ? clock(dayEnd) : '—'} />
          <Stat icon={<Clock className="size-4" />} label="Toplam ders" value={duration(lessonTotal)} />
          <Stat icon={<Coffee className="size-4" />} label="Toplam teneffüs" value={duration(breakTotal)} tone="emerald" />
          <Stat icon={<Utensils className="size-4" />} label="Öğle arası" value={lunch ? `${clock(lunch.start)} · ${duration(lunch.end - lunch.start)}` : 'Yok'} tone="amber" />
        </div>

        {editable && (
          <div className="flex items-center gap-2 rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-slate-200/70">
            <button
              type="button"
              onClick={onEdit}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900/85 dark:bg-brand-600 dark:hover:bg-brand-500"
            >
              <Pencil className="size-4" /> Çizelgeyi düzenle
            </button>
            <DeleteButton onConfirm={onDelete} />
          </div>
        )}
        {editable && (
          <button
            type="button"
            onClick={onCopy}
            className="flex w-full items-start gap-3 rounded-2xl bg-surface p-4 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:ring-brand-300"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <CopyPlus className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Başka gün için kopyala</span>
              <span className="block text-xs text-slate-500">
                Ör. cuma namazı için öğle arasını uzatmak: kopyalayın, günü Cuma seçin, teneffüs sürelerini değiştirin.
              </span>
            </span>
          </button>
        )}
      </aside>
    </div>
  );
}


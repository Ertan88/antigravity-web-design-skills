import { computeBellStatus, parseClock, periodLabel, sortPeriods, WEEKDAY_NAMES, WEEKDAY_SHORT, type Period } from '@okulpano/shared';
import clsx from 'clsx';
import { BellRing, Clock, Coffee, Pencil, Sunrise, Sunset, Utensils } from 'lucide-react';
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
  selectedId,
  today,
  onSelect,
}: {
  schedules: BellSchedule[];
  selectedId: string | null;
  today: number;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const s = schedules.find((x) => x.weekdays.includes(d) && x.periods.length > 0);
        return (
          <button
            key={d}
            type="button"
            disabled={!s}
            onClick={() => s && onSelect(s.id)}
            className={clsx(
              'min-w-0 rounded-xl px-2 py-2 text-left ring-1 transition-colors',
              s && s.id === selectedId ? 'bg-brand-50 ring-brand-300' : s ? 'bg-white ring-slate-200 hover:bg-slate-50' : 'bg-slate-50 ring-slate-100',
            )}
          >
            <div className={clsx('flex items-center gap-1 text-xs font-semibold', d === today ? 'text-brand-700' : 'text-slate-500')}>
              <span className="sm:hidden">{WEEKDAY_SHORT[d]}</span>
              <span className="hidden sm:inline">{WEEKDAY_NAMES[d]}</span>
              {d === today && <span className="size-1.5 rounded-full bg-brand-500" />}
            </div>
            <div className={clsx('mt-0.5 truncate text-xs sm:text-sm', s ? 'font-medium text-slate-900' : 'text-slate-400')}>
              {s ? s.name : 'Ders yok'}
            </div>
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
      <span className="text-sm font-semibold text-slate-900 tabular-nums">{value}</span>
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
  onDelete,
}: {
  schedule: BellSchedule;
  editable: boolean;
  lunchThresholdMin: number;
  onEdit: () => void;
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

  const gapAfter = (lesson: Segment) => gaps.find((g) => g.start === lesson.end);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      {/* Ana alan */}
      <section className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{schedule.name}</h2>
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
                    i > 0 && 'border-l-2 border-white',
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

        {/* Ders kutuları */}
        <ol className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] sm:gap-3 sm:p-6">
          {lessons.map((s) => {
            const active = activeStart === s.start && status?.kind === 'lesson';
            const gap = gapAfter(s);
            const gapActive = gap && activeStart === gap.start && status?.kind === 'break';
            return (
              <li
                key={s.start}
                className={clsx(
                  'relative min-w-0 overflow-hidden rounded-xl p-3 ring-1 transition-colors sm:p-4',
                  active ? 'bg-brand-600 text-white shadow-md ring-brand-600' : 'bg-slate-50/60 ring-slate-200',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={clsx('text-3xl leading-none font-extrabold tabular-nums', active ? 'text-white' : 'text-brand-600')}>
                    {s.period.no}
                  </span>
                  {active ? (
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">Şu an</span>
                  ) : (
                    <span className="text-xs font-medium text-slate-400">{duration(s.end - s.start)}</span>
                  )}
                </div>
                <div className={clsx('mt-2 truncate text-sm font-semibold', active ? 'text-white/90' : 'text-slate-700')}>
                  {periodLabel(s.period)}
                </div>
                <div className={clsx('text-[15px] font-bold tabular-nums sm:text-lg', active ? 'text-white' : 'text-slate-900')}>
                  {s.period.start} – {s.period.end}
                </div>
                {gap && (
                  <div
                    className={clsx(
                      'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      gap.kind === 'lunch'
                        ? active
                          ? 'bg-amber-300 text-amber-950'
                          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                        : active
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-50 text-emerald-700',
                      gapActive && 'ring-2 ring-emerald-500',
                    )}
                  >
                    {gap.kind === 'lunch' ? <Utensils className="size-3" /> : <Coffee className="size-3" />}
                    {gap.kind === 'lunch' ? 'Öğle' : 'Teneffüs'} {duration(gap.end - gap.start)}
                    {gapActive && ' · şu an'}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Yan panel */}
      <aside className="space-y-5">
        <div
          className={clsx(
            'rounded-2xl p-5 text-white shadow-sm',
            status?.kind === 'break' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-brand-600 to-indigo-700',
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
              <div className="h-full rounded-full bg-white" style={{ width: `${(1 - status.remainingSec / status.totalSec) * 100}%` }} />
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-200/70">
          <Stat icon={<BellRing className="size-4" />} label="Ders sayısı" value={`${lessons.length}`} />
          <Stat icon={<Sunrise className="size-4" />} label="İlk ders" value={segs.length ? clock(dayStart) : '—'} />
          <Stat icon={<Sunset className="size-4" />} label="Son zil" value={segs.length ? clock(dayEnd) : '—'} />
          <Stat icon={<Clock className="size-4" />} label="Toplam ders" value={duration(lessonTotal)} />
          <Stat icon={<Coffee className="size-4" />} label="Toplam teneffüs" value={duration(breakTotal)} tone="emerald" />
          <Stat icon={<Utensils className="size-4" />} label="Öğle arası" value={lunch ? `${clock(lunch.start)} · ${duration(lunch.end - lunch.start)}` : 'Yok'} tone="amber" />
        </div>

        {editable && (
          <div className="flex items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
            <button
              type="button"
              onClick={onEdit}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Pencil className="size-4" /> Çizelgeyi düzenle
            </button>
            <DeleteButton onConfirm={onDelete} />
          </div>
        )}
      </aside>
    </div>
  );
}


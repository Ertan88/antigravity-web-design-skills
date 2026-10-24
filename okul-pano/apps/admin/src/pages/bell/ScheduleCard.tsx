import { computeBellStatus, parseClock, periodLabel, sortPeriods, WEEKDAY_SHORT, type Period } from '@okulpano/shared';
import clsx from 'clsx';
import { Coffee, Pencil, Utensils } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DeleteButton, IconButton } from '../../components/ui.tsx';
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

const mins = (sec: number) => Math.round(sec / 60);
function duration(sec: number): string {
  const m = mins(sec);
  const h = Math.floor(m / 60);
  return h ? `${h} sa${m % 60 ? ` ${m % 60} dk` : ''}` : `${m} dk`;
}
const clock = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;

/** Yerel saatle saniyede bir güncellenen "şu an" (yalnızca vurgu için) */
function useSecondsOfDay() {
  const read = () => {
    const d = new Date();
    return { weekday: ((d.getDay() + 6) % 7) + 1, sec: d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() };
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const t = setInterval(() => setNow(read()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Zil çizelgesi kartı: günün oransal zaman şeridi, özet değerler ve ders / teneffüs / öğle arası akışı.
 * Bugün bu çizelge geçerliyse o anki ders ya da teneffüs vurgulanır.
 */
export function ScheduleCard({
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
  const now = useSecondsOfDay();
  const segs = segments(schedule.periods, lunchThresholdMin);
  const first = segs[0];
  const last = segs[segs.length - 1];
  const dayStart = first?.start ?? 0;
  const dayEnd = last?.end ?? 1;
  const span = Math.max(1, dayEnd - dayStart);
  const lessons = segs.filter((s) => s.kind === 'lesson');
  const lessonTotal = lessons.reduce((a, s) => a + s.end - s.start, 0);
  const lunch = segs.find((s) => s.kind === 'lunch');
  const isToday = schedule.weekdays.includes(now.weekday);
  const status = isToday ? computeBellStatus(schedule.periods, now.sec, lunchThresholdMin) : null;
  const activeStart =
    status?.kind === 'lesson' ? parseClock(status.period.start) : status?.kind === 'break' ? parseClock(status.prev.end) : null;

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-brand-50/70 to-white px-5 pt-4 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-slate-900">{schedule.name}</h2>
            {isToday && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Bugün geçerli
              </span>
            )}
          </div>
          <div className="mt-2 flex gap-1" aria-label="Geçerli günler">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <span
                key={d}
                className={clsx(
                  'flex h-6 w-9 items-center justify-center rounded-md text-[11px] font-semibold',
                  schedule.weekdays.includes(d) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400',
                )}
              >
                {WEEKDAY_SHORT[d]}
              </span>
            ))}
          </div>
        </div>
        {editable && (
          <div className="flex shrink-0">
            <IconButton label="Düzenle" onClick={onEdit}>
              <Pencil className="size-4" />
            </IconButton>
            <DeleteButton onConfirm={onDelete} />
          </div>
        )}
      </header>

      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 text-center">
        {[
          { label: 'Ders', value: `${lessons.length}` },
          { label: 'Okul saatleri', value: first && last ? `${clock(dayStart)} – ${clock(dayEnd)}` : '—' },
          { label: 'Toplam ders', value: duration(lessonTotal) },
        ].map((s) => (
          <div key={s.label} className="px-2 py-3">
            <div className="text-[15px] font-bold text-slate-900 tabular-nums">{s.value}</div>
            <div className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Günün oransal şeridi */}
      <div className="px-5 pt-4">
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          {segs.map((s, i) => (
            <div
              key={i}
              style={{ width: `${((s.end - s.start) / span) * 100}%` }}
              className={clsx(
                s.kind === 'lesson' ? 'bg-brand-500' : s.kind === 'lunch' ? 'bg-amber-400' : 'bg-emerald-300',
                activeStart === s.start && 'ring-2 ring-slate-900 ring-inset',
                i > 0 && 'border-l border-white/70',
              )}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] font-medium text-slate-400 tabular-nums">
          <span>{clock(dayStart)}</span>
          {lunch && <span className="text-amber-600">Öğle {clock(lunch.start)}</span>}
          <span>{clock(dayEnd)}</span>
        </div>
      </div>

      {/* Akış */}
      <ol className="px-5 pt-3 pb-5">
        {segs.map((s, i) =>
          s.kind === 'lesson' ? (
            <li
              key={i}
              className={clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5',
                activeStart === s.start ? 'bg-brand-600 text-white shadow-sm' : 'hover:bg-slate-50',
              )}
            >
              <span
                className={clsx(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                  activeStart === s.start ? 'bg-white/20' : 'bg-brand-50 text-brand-700',
                )}
              >
                {s.period.no}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{periodLabel(s.period)}</span>
              {activeStart === s.start && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">Şu an</span>}
              <span className={clsx('text-sm font-semibold tabular-nums', activeStart !== s.start && 'text-slate-900')}>
                {s.period.start}
                <span className={activeStart === s.start ? 'text-white/70' : 'text-slate-400'}> – </span>
                {s.period.end}
              </span>
              <span
                className={clsx(
                  'w-14 shrink-0 text-right text-xs tabular-nums',
                  activeStart === s.start ? 'text-white/80' : 'text-slate-500',
                )}
              >
                {duration(s.end - s.start)}
              </span>
            </li>
          ) : (
            <li key={i} className="flex items-center gap-3 px-3 py-1" aria-label={s.kind === 'lunch' ? 'Öğle arası' : 'Teneffüs'}>
              <span className="flex w-8 justify-center">
                <span className={clsx('h-4 w-px', s.kind === 'lunch' ? 'bg-amber-300' : 'bg-emerald-200')} />
              </span>
              <span
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  s.kind === 'lunch' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-emerald-50 text-emerald-700',
                  activeStart === s.start && 'ring-2 ring-emerald-500',
                )}
              >
                {s.kind === 'lunch' ? <Utensils className="size-3" /> : <Coffee className="size-3" />}
                {s.kind === 'lunch' ? 'Öğle arası' : 'Teneffüs'} · {duration(s.end - s.start)}
                {activeStart === s.start && ' · şu an'}
              </span>
            </li>
          ),
        )}
      </ol>
    </article>
  );
}

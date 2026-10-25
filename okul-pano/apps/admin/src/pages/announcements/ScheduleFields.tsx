import clsx from 'clsx';
import { Field, Input, Segmented } from '../../components/ui.tsx';
import { useList, type AnnouncementSchedule, type Screen } from '../../lib/data.ts';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const emptySchedule = (): AnnouncementSchedule => ({ days: [], from: null, to: null, phase: 'any' });

/** Listede kısa özet: "Kantin · teneffüslerde · Pzt–Cum" */
export function scheduleSummary(screenIds: string[] | null, s: AnnouncementSchedule | null, screens: Screen[] | undefined): string | null {
  const parts: string[] = [];
  if (screenIds?.length) parts.push(screenIds.map((id) => screens?.find((x) => x.id === id)?.name ?? '?').join(', '));
  if (s?.phase === 'break') parts.push('teneffüslerde');
  if (s?.phase === 'lesson') parts.push('ders saatlerinde');
  if (s?.days.length) parts.push(s.days.length === 5 && s.days.every((d) => d <= 5) ? 'hafta içi' : s.days.map((d) => DAYS[d - 1]).join(', '));
  if (s?.from || s?.to) parts.push(`${s.from ?? '00:00'}–${s.to ?? '24:00'}`);
  return parts.length ? parts.join(' · ') : null;
}

const chip = (on: boolean) =>
  clsx('rounded-lg px-2.5 py-1.5 text-sm font-semibold ring-1 transition', on ? 'bg-brand-50 text-brand-700 ring-brand-300' : 'text-slate-500 ring-slate-200 hover:ring-slate-300');

/**
 * Yayın akışı: duyuru hangi panolarda, hangi günlerde, saatlerde ve zilin hangi durumunda görünsün.
 * Hiçbiri seçilmezse duyuru bütün panolarda, yayın tarihleri içinde sürekli döner.
 */
export function ScheduleFields({
  screenIds,
  schedule,
  onScreens,
  onSchedule,
  error,
}: {
  screenIds: string[];
  schedule: AnnouncementSchedule;
  onScreens: (ids: string[]) => void;
  onSchedule: (s: AnnouncementSchedule) => void;
  error?: string;
}) {
  const screens = useList<Screen>('screens');
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="space-y-4 rounded-2xl bg-slate-50/70 p-4 ring-1 ring-slate-200">
      <div>
        <div className="text-sm font-semibold text-ink">Yayın akışı</div>
        <p className="text-xs text-slate-500">Boş bırakırsanız duyuru bütün panolarda sürekli döner.</p>
      </div>
      {(screens.data?.length ?? 0) > 0 && (
        <Field label="Hangi panolarda">
          {() => (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(!screenIds.length)} onClick={() => onScreens([])}>
                Bütün panolar
              </button>
              {screens.data!.map((x) => (
                <button key={x.id} type="button" className={chip(screenIds.includes(x.id))} onClick={() => onScreens(toggle(screenIds, x.id))}>
                  {x.name}
                </button>
              ))}
            </div>
          )}
        </Field>
      )}
      <Field label="Zil durumu">
        {() => (
          <Segmented
            value={schedule.phase}
            onChange={(phase) => onSchedule({ ...schedule, phase })}
            options={[
              { value: 'any', label: 'Her zaman' },
              { value: 'break', label: 'Yalnızca teneffüste' },
              { value: 'lesson', label: 'Yalnızca derste' },
            ]}
          />
        )}
      </Field>
      <Field label="Günler" help="Hiçbiri seçili değilse her gün">
        {() => (
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button key={d} type="button" className={chip(schedule.days.includes(i + 1))} onClick={() => onSchedule({ ...schedule, days: toggle(schedule.days, i + 1).sort() })}>
                {d}
              </button>
            ))}
          </div>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gösterim başlangıç saati" error={error}>
          {(id) => <Input id={id} type="time" value={schedule.from ?? ''} onChange={(e) => onSchedule({ ...schedule, from: e.target.value || null })} />}
        </Field>
        <Field label="Gösterim bitiş saati">
          {(id) => <Input id={id} type="time" value={schedule.to ?? ''} onChange={(e) => onSchedule({ ...schedule, to: e.target.value || null })} />}
        </Field>
      </div>
    </div>
  );
}

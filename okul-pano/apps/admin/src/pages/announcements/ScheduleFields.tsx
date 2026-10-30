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

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * Tarih aralığı, günler ve günlük saatler birbirini dışlıyor mu: aralıktaki her günü gezer,
 * seçili güne ve saat aralığına denk gelen bir an varsa duyuru en az bir kez görünür.
 */
function neverOnAir(startsAt: string, endsAt: string, s: AnnouncementSchedule): string | null {
  if (!startsAt || !endsAt || (!s.days.length && !s.from && !s.to)) return null;
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (end <= start) return null;
  const sec = (hm: string | null, fallback: number) => (hm ? Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(3, 5)) * 60 : fallback);
  const from = sec(s.from, 0);
  const to = sec(s.to, 86400);
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let i = 0; i < 400 && day < end; i++, day.setDate(day.getDate() + 1)) {
    const weekday = ((day.getDay() + 6) % 7) + 1;
    if (s.days.length && !s.days.includes(weekday)) continue;
    const a = Math.max(day.getTime() + from * 1000, start.getTime());
    const b = Math.min(day.getTime() + to * 1000, end.getTime());
    if (b > a) return null;
  }
  return s.days.length && (s.from || s.to)
    ? 'Seçtiğiniz tarih aralığında, seçili günlerde ve saatlerde bir an yok: duyuru hiç görünmez.'
    : s.days.length
      ? 'Seçtiğiniz tarih aralığına seçili günlerden hiçbiri denk gelmiyor: duyuru hiç görünmez.'
      : 'Seçtiğiniz tarih aralığı günlük gösterim saatlerine denk gelmiyor: duyuru hiç görünmez.';
}

/** "21 Ekim 09:00'dan 25 Ekim 17:00'ye kadar, Pazartesi ve Çarşamba, 12:00–13:30 arası, teneffüslerde, Kantin panosunda" */
function planSentence(startsAt: string, endsAt: string, s: AnnouncementSchedule, screenNames: string[]): string {
  const parts: string[] = [];
  if (startsAt && endsAt) parts.push(`${dateFmt.format(new Date(startsAt))} – ${dateFmt.format(new Date(endsAt))} arasında`);
  else if (startsAt) parts.push(`${dateFmt.format(new Date(startsAt))} itibarıyla`);
  else if (endsAt) parts.push(`${dateFmt.format(new Date(endsAt))} tarihine kadar`);
  else parts.push('Kaydettiğiniz andan itibaren süresiz');
  if (s.days.length) parts.push(s.days.length === 5 && s.days.every((d) => d <= 5) ? 'hafta içi her gün' : `her ${s.days.map((d) => DAY_NAMES[d - 1]).join(', ')}`);
  if (s.from || s.to) parts.push(`${s.from ?? '00:00'}–${s.to ?? '24:00'} saatleri arasında`);
  if (s.phase === 'break') parts.push('yalnızca teneffüs ve öğle arasında');
  if (s.phase === 'lesson') parts.push('yalnızca ders saatlerinde');
  parts.push(screenNames.length ? `${screenNames.join(', ')} panosunda görünür.` : 'bütün panolarda görünür.');
  return parts.join(', ');
}

/**
 * Yayın planı: hangi tarihler arasında (takvim), haftanın hangi günleri, günün hangi saatleri,
 * zilin hangi durumunda ve hangi panolarda. Hepsi tek yerde, altta düz bir cümleyle özetlenir;
 * birbirini dışlayan seçimler uyarılır.
 */
export function ScheduleFields({
  screenIds,
  schedule,
  startsAt,
  endsAt,
  onScreens,
  onSchedule,
  onStartsAt,
  onEndsAt,
  error,
  endsError,
}: {
  screenIds: string[];
  schedule: AnnouncementSchedule;
  startsAt: string;
  endsAt: string;
  onScreens: (ids: string[]) => void;
  onSchedule: (s: AnnouncementSchedule) => void;
  onStartsAt: (v: string) => void;
  onEndsAt: (v: string) => void;
  error?: string;
  endsError?: string;
}) {
  const screens = useList<Screen>('screens');
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const conflict = neverOnAir(startsAt, endsAt, schedule);
  const names = screenIds.map((id) => screens.data?.find((x) => x.id === id)?.name ?? '?');
  return (
    <div className="space-y-5 rounded-2xl bg-slate-50/70 p-4 ring-1 ring-slate-200">
      <div className="text-sm font-semibold text-ink">Yayın planı</div>

      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">1 · Hangi tarihler arasında</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Yayın başlangıcı" help="Boşsa hemen">
            {(id) => <Input id={id} type="datetime-local" value={startsAt} onChange={(e) => onStartsAt(e.target.value)} />}
          </Field>
          <Field label="Yayın bitişi" help="Boşsa süresiz" error={endsError}>
            {(id) => <Input id={id} type="datetime-local" value={endsAt} onChange={(e) => onEndsAt(e.target.value)} invalid={Boolean(endsError)} />}
          </Field>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">2 · Bu tarihler içinde ne zaman</div>
        <div className="space-y-4">
          <Field label="Haftanın günleri" help="Hiçbiri seçili değilse her gün">
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
            <Field label="Günün şu saatinden" error={error}>
              {(id) => <Input id={id} type="time" value={schedule.from ?? ''} onChange={(e) => onSchedule({ ...schedule, from: e.target.value || null })} />}
            </Field>
            <Field label="şu saatine kadar">
              {(id) => <Input id={id} type="time" value={schedule.to ?? ''} onChange={(e) => onSchedule({ ...schedule, to: e.target.value || null })} />}
            </Field>
          </div>
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
        </div>
      </div>

      {(screens.data?.length ?? 0) > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">3 · Hangi panolarda</div>
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
        </div>
      )}

      <div className={clsx('rounded-xl px-3 py-2.5 text-sm', conflict ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-surface text-slate-600 ring-1 ring-slate-200')}>
        {conflict ?? planSentence(startsAt, endsAt, schedule, names)}
      </div>
    </div>
  );
}

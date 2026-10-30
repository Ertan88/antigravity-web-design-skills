import {
  computeBellStatus,
  countdown,
  formatPersonName,
  isBirthdayToday,
  schoolDay,
  periodLabel,
  pickSchedule,
  zonedParts,
  type BellStatus,
  type DisplayState,
} from '@okulpano/shared';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Cake, GraduationCap, MonitorSmartphone, ShieldCheck, UserMinus, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useList, type Screen } from '../../lib/data.ts';
import { timeAgo } from '../../lib/format.ts';

/** Panonun gördüğü veri paketi: panoyla birebir aynı bilgi (önizleme anahtarıyla) */
function useBoardState() {
  const { schoolId } = useAuth();
  const token = useQuery({
    queryKey: [schoolId, 'preview-token'],
    queryFn: () => api<{ token: string }>(`/api/schools/${schoolId}/preview-token`, { method: 'POST' }),
    refetchInterval: 25 * 60 * 1000,
    staleTime: 20 * 60 * 1000,
  });
  return useQuery({
    queryKey: [schoolId, 'board-state', token.data?.token],
    enabled: Boolean(token.data),
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch('/api/display/state', { headers: { authorization: `Bearer ${token.data!.token}` }, cache: 'no-store' });
      if (!res.ok) throw new Error('Pano verisi alınamadı');
      return (await res.json()) as DisplayState;
    },
  });
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function bellText(b: BellStatus): { title: string; detail: string } {
  const min = (sec: number) => `${Math.ceil(sec / 60)} dk`;
  switch (b.kind) {
    case 'lesson':
      return { title: `${periodLabel(b.period)} sürüyor`, detail: `Bitmesine ${min(b.remainingSec)} · ${b.period.start} – ${b.period.end}` };
    case 'break':
      return { title: b.isLunch ? 'Öğle arası' : 'Teneffüs', detail: `${periodLabel(b.next)} ${b.next.start}'de · ${min(b.remainingSec)} kaldı` };
    case 'before':
      return { title: 'Dersler henüz başlamadı', detail: `İlk ders ${b.next.start}` };
    case 'after':
      return { title: 'Dersler bitti', detail: `Son ders ${b.last.end}'de bitti` };
    default:
      return { title: 'Bugün ders yok', detail: 'Zil çizelgesi bu güne ait değil' };
  }
}

/** Kutunun simge rengi: her bilgi türü kendi pastel renginde (mobil uygulamayla aynı aile) */
const TONES = {
  sky: 'bg-tile-sky text-tile-sky-ink',
  peach: 'bg-tile-peach text-tile-peach-ink',
  rose: 'bg-tile-rose text-tile-rose-ink',
  lilac: 'bg-tile-lilac text-tile-lilac-ink',
  sun: 'bg-tile-sun text-tile-sun-ink',
  mint: 'bg-tile-mint text-tile-mint-ink',
} as const;

function Box({ icon: Icon, title, to, count, tone, children }: { icon: LucideIcon; title: string; to?: string; count?: number; tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`flex size-9 items-center justify-center rounded-full ${TONES[tone]}`}>
          <Icon className="size-[18px]" />
        </span>
        <h3 className="text-[15px] font-extrabold tracking-tight text-ink">{title}</h3>
        {count !== undefined && <span className="rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-500">{count}</span>}
        {to && (
          <Link to={to} className="ml-auto rounded-full px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 hover:text-ink">
            Düzenle
          </Link>
        )}
      </div>
      <div className="flex-1 text-sm">{children}</div>
    </Card>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-slate-400">{children}</p>;

/** Ana sayfadaki "Bugün" özeti: panoda bugün ne görünüyorsa tek bakışta */
export function TodaySummary() {
  const { can } = useAuth();
  const state = useBoardState();
  const screens = useList<Screen>('screens', { refetchInterval: 30_000 });
  const now = useNow(30_000);
  const st = state.data;
  if (!st) return null;

  const s = st.school.settings;
  const today = zonedParts(now, st.school.timezone);
  const holiday = (st.holidays ?? []).find((h) => h.date === today.isoDate)?.name ?? null;
  // Panodaki gibi: nöbet yerine görevlendirilen öğretmenin adı
  const subs = new Map((st.dutySubstitutions ?? []).filter((x) => x.date === today.isoDate).map((x) => [x.dutyId, x.teacherName]));
  const duties = st.duties.filter((d) => d.weekday === today.weekday).map((d) => ({ ...d, teacherName: subs.get(d.id) ?? d.teacherName }));
  const supervisor = (st.dutySupervisors ?? []).find((x) => x.date === today.isoDate)?.name ?? null;
  const leaves = st.leaves.filter((l) => l.startDate <= today.isoDate && l.endDate >= today.isoDate);
  const birthdays = st.birthdays.filter((b) => isBirthdayToday(b.monthDay, today));
  const schedule = pickSchedule(st.bellSchedules, today.weekday);
  // Panodaki gibi: tam gün tatilde zil çalmaz, arifede dersler yarım gün saatinde biter
  const day = schoolDay(today.isoDate, { schedules: st.bellSchedules, holidays: st.holidays ?? [], halfDays: st.halfDays ?? [], halfDayEnd: s.halfDayEnd });
  const halfDay = day.halfDay;
  const periods = day.periods.length ? day.periods : null;
  const bell = bellText(periods ? computeBellStatus(periods, today.secondsOfDay, s.lunchThresholdMin) : { kind: 'off' });

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight">Bugün</h2>
        <span className="text-sm text-slate-500">
          {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: st.school.timezone }).format(now)}
          {holiday && <span className="ml-2 font-semibold text-rose-600">· {holiday}</span>}
          {halfDay && (
            <span className="ml-2 font-semibold text-amber-600">
              · {halfDay} (yarım gün, son zil {day.endsAt})
            </span>
          )}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Box icon={BellRing} tone="sun" title="Zil durumu" to={can('schedule.manage') ? '/zil-saatleri' : undefined}>
          <div className="text-xl font-extrabold tracking-tight text-ink">{bell.title}</div>
          <div className="text-slate-500">{bell.detail}</div>
          {schedule && <div className="mt-2 text-xs text-slate-400">Çizelge: {schedule.name}</div>}
        </Box>

        <Box icon={ShieldCheck} tone="peach" title="Nöbetçiler" count={duties.length} to={can('duties.manage') ? '/nobet' : undefined}>
          {holiday ? (
            <Empty>Tatil: nöbet yok</Empty>
          ) : duties.length ? (
            <ul className="space-y-1">
              {duties.slice(0, 6).map((d) => (
                <li key={d.id} className="flex justify-between gap-3">
                  <span className="truncate font-medium text-ink">{d.teacherName}</span>
                  <span className="shrink-0 text-slate-500">{d.area}</span>
                </li>
              ))}
              {duties.length > 6 && <li className="text-xs text-slate-400">+{duties.length - 6} kişi daha</li>}
            </ul>
          ) : (
            <Empty>Bugün için nöbet girilmemiş</Empty>
          )}
          {supervisor && (
            <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              Nöbetçi müdür yrd.: <span className="font-semibold text-ink">{supervisor}</span>
            </div>
          )}
        </Box>

        <Box icon={UserMinus} tone="rose" title="İzinli öğretmenler" count={leaves.length} to={can('leaves.manage') ? '/izinler' : undefined}>
          {leaves.length ? (
            <div className="flex flex-wrap gap-1.5">
              {leaves.map((l) => (
                <span key={l.id} className="rounded-full bg-tile-rose px-2.5 py-0.5 font-semibold text-tile-rose-ink">
                  {l.teacherName}
                </span>
              ))}
            </div>
          ) : (
            <Empty>Bugün izinli öğretmen yok</Empty>
          )}
        </Box>

        <Box icon={GraduationCap} tone="lilac" title="Yaklaşan sınavlar" to={can('exams.manage') ? '/sinavlar' : undefined}>
          {st.exams.length ? (
            <ul className="space-y-1">
              {st.exams.slice(0, 4).map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span className="truncate font-medium text-ink">{e.title}</span>
                  <span className="shrink-0 font-semibold text-brand-700">{countdown(Date.parse(e.examAt), now.getTime()).days} gün</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Yaklaşan sınav yok</Empty>
          )}
        </Box>

        <Box icon={Cake} tone="mint" title="Doğum günleri" count={birthdays.length} to={can('students.manage') ? '/ogrenciler' : undefined}>
          {birthdays.length ? (
            <div className="flex flex-wrap gap-1.5">
              {birthdays.map((b) => (
                <span key={b.id} className="rounded-full bg-tile-sun px-2.5 py-0.5 font-semibold text-tile-sun-ink">
                  {formatPersonName(b.name, s.birthdayNameFormat)}
                  {b.className && <span className="ml-1 opacity-70">{b.className}</span>}
                </span>
              ))}
            </div>
          ) : (
            <Empty>Bugün doğum günü olan yok</Empty>
          )}
        </Box>

        <Box icon={MonitorSmartphone} tone="sky" title="Panolar" count={screens.data?.length} to={can('screens.manage') ? '/ekranlar' : undefined}>
          {screens.data?.length ? (
            <ul className="space-y-1.5">
              {screens.data.map((x) => (
                <li key={x.id} className="flex items-center gap-2">
                  <span className={`size-2 shrink-0 rounded-full ${x.online ? 'bg-emerald-500' : x.lastSeenAt ? 'bg-amber-400' : 'bg-slate-300'}`} />
                  <span className="truncate font-medium text-ink">{x.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-500">
                    {x.online ? 'Çevrimiçi' : x.lastSeenAt ? `Son görülme ${timeAgo(x.lastSeenAt)}` : 'Hiç bağlanmadı'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Henüz pano eklenmemiş</Empty>
          )}
        </Box>
      </div>
    </section>
  );
}

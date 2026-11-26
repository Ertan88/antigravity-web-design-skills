import { relativeDayWord, WEEKDAY_NAMES } from '@okulpano/shared';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, BookOpen, CalendarCheck2, CalendarPlus, ClipboardCheck, ShieldCheck, UserMinus } from '../../components/icons.tsx';
import { Button } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';
import { minutesText, todayLessons, toSec, type MeToday } from '../../lib/teacherDay.ts';
import { useNow } from './Today.tsx';
import { LeaveDialog, MySchedule } from './MyWeek.tsx';

const TONE = {
  sky: 'bg-tile-sky text-tile-sky-ink',
  peach: 'bg-tile-peach text-tile-peach-ink',
  lilac: 'bg-tile-lilac text-tile-lilac-ink',
  mint: 'bg-tile-mint text-tile-mint-ink',
} as const;

/** Bugünüm kartı: küçük etiket, kısa başlık, alt bilgi; dokununca ilgili yer */
function DayTile({ tone, icon, label, title, hint, to }: { tone: keyof typeof TONE; icon: ReactNode; label: string; title: string; hint?: string | null; to?: string }) {
  const body = (
    <>
      <div className="flex items-center gap-2 pr-9 text-[13px] font-bold opacity-75">
        {icon}
        {label}
      </div>
      <div className="mt-auto pt-3 text-xl leading-tight font-extrabold tracking-tight">{title}</div>
      {hint && <div className="mt-1 text-[13px] font-bold opacity-85">{hint}</div>}
      {to && (
        <span className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full bg-white/50 transition group-hover:bg-white/80 dark:bg-white/10">
          <ArrowUpRight className="size-4" />
        </span>
      )}
    </>
  );
  const cls = clsx('relative flex min-h-32 flex-col rounded-3xl p-5', TONE[tone]);
  return to ? (
    <Link to={to} className={clsx(cls, 'group transition-transform hover:-translate-y-0.5')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const hm = (t: string) => t.replace(':', '.');
const dayMonth = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const span = (a: string, b: string) => (a === b ? dayMonth(a) : `${dayMonth(a)} – ${dayMonth(b)}`);

type Assignments = { today: string; date: string; lessons: { periodNo: number; start: string | null; className: string; subject: string; absentName: string }[]; duties: { area: string; absentName: string }[] };

/**
 * Öğretmenin Genel Bakış'ı (4A): okul geneli sayılar yerine kişinin bugünkü işleri. Sıradaki ders, bugünkü (yoksa
 * sıradaki) nöbet, izinli yerine görev ve izin talebi; altında yalnızca yetkisi olan işlemler. Müdür ve müdür
 * yardımcısında gösterilmez.
 */
export function MyDay() {
  const { schoolId, school, can } = useAuth();
  const todayPath = useSchoolPath('me/today');
  const assignPath = useSchoolPath('my-assignments');
  const leavesPath = useSchoolPath('me/leaves');
  const hasTeacher = Boolean(school?.teacherId);
  const me = useQuery({ queryKey: [schoolId, 'me/today'], queryFn: () => api<MeToday>(todayPath), enabled: Boolean(schoolId) && hasTeacher, refetchInterval: 5 * 60_000 });
  const assign = useQuery({ queryKey: [schoolId, 'my-assignments'], queryFn: () => api<Assignments>(assignPath), enabled: hasTeacher, refetchInterval: 5 * 60_000 });
  const now = useNow(30_000);
  const [asking, setAsking] = useState(false);

  const actions = (withLeave: boolean) => (
    <div className="flex flex-wrap gap-2">
      {hasTeacher && withLeave && (
        <Button icon={<CalendarPlus className="size-4" />} onClick={() => setAsking(true)}>
          İzin bildir
        </Button>
      )}
      {can('conduct.counsel') && (
        <Link to="/gozlem" className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-bold ring-1 ring-slate-200 hover:bg-slate-100 dark:ring-white/15 dark:hover:bg-white/10">
          <ClipboardCheck className="size-4" /> Gözlem gir
        </Link>
      )}
      <Link to="/sorunlar?yeni=1" className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 text-sm font-bold ring-1 ring-slate-200 hover:bg-slate-100 dark:ring-white/15 dark:hover:bg-white/10">
        <AlertTriangle className="size-4" /> Sorun bildir
      </Link>
    </div>
  );

  const d = me.data;
  if (!hasTeacher || !d) {
    return (
      <>
        {actions(true)}
        <LeaveDialog open={asking} onClose={() => setAsking(false)} path={leavesPath} />
      </>
    );
  }

  // Sıradaki ders
  const day = todayLessons(d, now);
  const current = day.lessons.find((l) => l.state === 'now');
  const next = day.lessons.find((l) => l.state === 'next');
  const lessonTile = current
    ? { label: `Şu an · ${hm(current.period.start)}–${hm(current.period.end)}`, title: `${current.className} ${current.subject}`, hint: `${minutesText(toSec(current.period.end) - day.now)} kaldı${next ? ` · sonra ${next.className}` : ''}` }
    : next
      ? { label: `Sıradaki ders · ${hm(next.period.start)}`, title: `${next.className} ${next.subject}`, hint: `${minutesText(toSec(next.period.start) - day.now)} sonra${next.coverFor ? ` · ${next.coverFor} yerine` : ''}` }
      : day.holiday
        ? { label: 'Bugün', title: 'Ders yok', hint: day.holiday }
        : { label: 'Bugün', title: day.lessons.length ? 'Dersleriniz bitti' : 'Bugün dersiniz yok', hint: null };

  // Nöbet: bugün varsa bugünkü, yoksa haftanın sıradaki nöbeti
  const ownDuties = (w: MeToday['week'][number]) => w.duties.filter((x) => !x.dutyId.startsWith('supervisor:') && !x.coveredBy);
  const todayDuty = d.week.find((w) => w.date === d.today && !w.holiday);
  const nextDuty = d.week.find((w) => w.date > d.today && !w.holiday && ownDuties(w).length);
  const dutyTile =
    todayDuty && ownDuties(todayDuty).length
      ? { label: 'Bugünkü nöbetim', title: ownDuties(todayDuty).map((x) => x.area).join(', '), hint: ownDuties(todayDuty)[0]!.partners.length ? `Birlikte: ${ownDuties(todayDuty)[0]!.partners.join(', ')}` : null }
      : nextDuty
        ? { label: 'Sıradaki nöbetim', title: `${WEEKDAY_NAMES[nextDuty.weekday]} · ${ownDuties(nextDuty).map((x) => x.area).join(', ')}`, hint: dayMonth(nextDuty.date) }
        : { label: 'Nöbet', title: 'Bu hafta nöbetiniz yok', hint: null };

  // İzinli yerine görev
  const a = assign.data;
  const tasks = a ? [...a.lessons.map((l) => ({ title: `${l.periodNo}. ders · ${l.className}`, who: l.absentName })), ...a.duties.map((x) => ({ title: `${x.area} nöbeti`, who: x.absentName }))] : [];
  const coverTile = tasks.length
    ? { label: `Yerine görev · ${relativeDayWord(a!.date, a!.today)}`, title: tasks[0]!.title, hint: [tasks[0]!.who ? `${tasks[0]!.who} yerine` : null, tasks.length > 1 ? `${tasks.length - 1} görev daha` : null].filter(Boolean).join(' · ') || null }
    : { label: 'Yerine görev', title: 'Göreviniz yok', hint: null };

  // İzin talebi: bekleyen, yoksa yaklaşan onaylı izin
  const pending = d.leaves.find((l) => l.status === 'pending');
  const upcoming = d.leaves.find((l) => l.status === 'approved');
  const leaveTile = pending
    ? { title: 'Onay bekliyor', hint: span(pending.startDate, pending.endDate) }
    : upcoming
      ? { title: 'Onaylandı', hint: span(upcoming.startDate, upcoming.endDate) }
      : { title: 'Bekleyen talep yok', hint: null };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DayTile tone="sky" icon={<BookOpen className="size-4" />} {...lessonTile} />
        <DayTile tone="peach" icon={<ShieldCheck className="size-4" />} {...dutyTile} />
        <DayTile tone="lilac" icon={<CalendarCheck2 className="size-4" />} {...coverTile} />
        <DayTile tone="mint" icon={<UserMinus className="size-4" />} label="İzin talebim" {...leaveTile} />
      </div>
      {actions(false)}
      <MySchedule onAsk={() => setAsking(true)} />
      <LeaveDialog open={asking} onClose={() => setAsking(false)} path={leavesPath} />
    </div>
  );
}

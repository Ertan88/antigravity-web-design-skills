import { errorText, WEEKDAY_NAMES } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CalendarClock, CalendarPlus } from '../../components/icons.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';
import { todayIso } from '../../lib/format.ts';
import { dayLessons, type MeToday } from '../../lib/teacherDay.ts';

/*
 * Kişinin kendi haftası (10A): eski "Benim" sayfasının parçaları Genel Bakış'ta. Öğretmende bugünkü dersler, nöbetler ve
 * izinler; idarede (müdür, müdür yardımcısı) en altta küçük "Derslerim ve nöbetlerim" bölümü. Haftalık ders programı
 * pencerede açılır.
 */

export interface MyDuties {
  showing: string;
  teacherName: string | null;
  days: {
    date: string;
    weekday: number;
    holiday: string | null;
    duties: { dutyId: string; area: string; partners: string[]; substituteFor: string | null; coveredBy: string | null }[];
    transport: { partners: string[] } | null;
  }[];
}

export interface MyLeave {
  id: string;
  startDate: string;
  endDate: string;
  note: string | null;
  approvalStatus: 'approved' | 'pending' | 'rejected';
}

/** İzin türleri (mobildeki İzin bildir ile aynı) */
const KINDS = ['Mazeret izni', 'Görevlendirme', 'Rapor', 'Refakat izni', 'Doğum / babalık izni', 'Evlilik izni', 'Vefat izni', 'Diğer'] as const;

const DAYS = [1, 2, 3, 4, 5] as const;

export function WeeklyProgram({ lessons }: { lessons: MeToday['lessons'] }) {
  if (!lessons.length) return <EmptyState icon={<CalendarPlus className="size-6" />} title="Ders programında dersiniz yok" description="Ders programı yüklenince ve kadro kaydınızla eşleşince burada görünür." />;
  const maxNo = Math.max(...lessons.map((l) => l.periodNo));
  const at = (wd: number, no: number) => lessons.filter((l) => l.weekday === wd && l.periodNo === no);
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-12 border-b border-slate-100 p-2 text-xs text-slate-400 dark:border-white/10">Ders</th>
            {DAYS.map((d) => (
              <th key={d} className="border-b border-slate-100 p-2 text-left text-xs font-bold text-slate-500 dark:border-white/10">
                {WEEKDAY_NAMES[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxNo }, (_, i) => i + 1).map((no) => (
            <tr key={no}>
              <td className="border-b border-slate-100 p-2 text-center text-xs font-bold text-slate-400 dark:border-white/10">{no}</td>
              {DAYS.map((d) => (
                <td key={d} className="border-b border-slate-100 p-1.5 align-top dark:border-white/10">
                  {at(d, no).map((l, i) => (
                    <div key={i} className="rounded-lg bg-tile-sky px-2 py-1 text-tile-sky-ink">
                      <div className="text-xs font-extrabold">{l.className}</div>
                      <div className="truncate text-[11px] font-medium">{l.subject}</div>
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const STATUS: Record<MyLeave['approvalStatus'], { label: string; tone: 'green' | 'amber' | 'red' }> = {
  approved: { label: 'Onaylandı', tone: 'green' },
  pending: { label: 'Onay bekliyor', tone: 'amber' },
  rejected: { label: 'Onaylanmadı', tone: 'red' },
};

export function LeaveDialog({ open, onClose, path }: { open: boolean; onClose: () => void; path: string }) {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [kind, setKind] = useState<string>('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const bad = Boolean(start && end && end < start);

  const submit = async () => {
    if (!start || bad) return;
    setBusy(true);
    try {
      const note = [kind, detail.trim()].filter(Boolean).join(' · ') || null;
      const res = await api<{ approvalStatus: string }>(path, { method: 'POST', body: { startDate: start, endDate: end || start, note } });
      await Promise.all(['me/leaves', 'me/today', 'leaves'].map((k) => qc.invalidateQueries({ queryKey: [schoolId, k] })));
      toast.success(res.approvalStatus === 'approved' ? 'İzniniz kaydedildi, panoda görünüyor.' : 'İzin bildiriminiz onaya gönderildi.');
      setStart('');
      setEnd('');
      setKind('');
      setDetail('');
      onClose();
    } catch (err) {
      toast.error(errorText(err, 'İzin bildirilemedi'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="İzin bildir"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} disabled={!start || bad} onClick={() => void submit()}>
            Bildir
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Başlangıç">{(id) => <Input id={id} type="date" min={todayIso()} value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label="Bitiş" help="Tek günse boş bırakın.">
            {(id) => <Input id={id} type="date" min={start || todayIso()} value={end} onChange={(e) => setEnd(e.target.value)} />}
          </Field>
        </div>
        {bad && <Alert tone="amber">Bitiş tarihi başlangıçtan önce olamaz.</Alert>}
        <Field label="İzin türü">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Seçin</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Açıklama (isteğe bağlı)">{(id) => <Textarea id={id} rows={2} maxLength={160} value={detail} onChange={(e) => setDetail(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

const hm = (t: string) => t.replace(':', '.');
const dayMonth = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const span = (a: string, b: string) => (a === b ? dayMonth(a) : `${dayMonth(a)} – ${dayMonth(b)}`);

/** Kişinin haftası için ortak veriler */
export function useMyWeek() {
  const { schoolId, school } = useAuth();
  const todayPath = useSchoolPath('me/today');
  const dutiesPath = useSchoolPath('me/duties');
  const leavesPath = useSchoolPath('me/leaves');
  const on = Boolean(schoolId);
  const today = useQuery({ queryKey: [schoolId, 'me/today'], queryFn: () => api<MeToday>(todayPath), enabled: on && Boolean(school?.teacherId), refetchInterval: 5 * 60_000 });
  const duties = useQuery({ queryKey: [schoolId, 'me/duties'], queryFn: () => api<MyDuties>(dutiesPath), enabled: on });
  const leaves = useQuery({ queryKey: [schoolId, 'me/leaves'], queryFn: () => api<MyLeave[]>(leavesPath), enabled: on && Boolean(school?.teacherId) });
  const now = todayIso();
  // Bugünden sonraki nöbet günleri (okul içi nöbet, taşımalı görev, nöbetçi müdür yardımcılığı)
  const upcoming = (duties.data?.days ?? []).filter((d) => d.date >= (today.data?.today ?? now) && !d.holiday && (d.duties.length > 0 || d.transport));
  return { today, duties, leaves, upcoming, leavesPath };
}

/** Bir nöbet gününün kısa yazımı: "Salı, 1 Aralık · Bahçe" */
function dutyLine(d: MyDuties['days'][number], today: string) {
  const own = d.duties.filter((x) => !x.dutyId.startsWith('supervisor:')).map((x) => (x.substituteFor ? `${x.area} (${x.substituteFor} yerine)` : x.area));
  const sup = d.duties.some((x) => x.dutyId.startsWith('supervisor:'));
  const what = [...own, ...(d.transport ? ['Taşımalı eğitim'] : []), ...(sup ? ['Nöbetçi müdür yardımcısı'] : [])].join(', ');
  return { when: d.date === today ? 'Bugün' : `${WEEKDAY_NAMES[d.weekday]}, ${dayMonth(d.date)}`, what };
}

/** Haftalık ders programı penceresi */
export function WeeklyProgramDialog({ open, onClose, lessons }: { open: boolean; onClose: () => void; lessons: MeToday['lessons'] }) {
  return (
    <Modal open={open} onClose={onClose} size="2xl" title="Haftalık ders programım">
      <WeeklyProgram lessons={lessons} />
    </Modal>
  );
}

/**
 * Öğretmenin Genel Bakış'ı, kartların altı (10A): solda bugünkü dersler saat sırasıyla (şu anki vurgulu), yanda nöbetler
 * ve izinler. "Haftalık program" düğmesi haftanın tablosunu açar.
 */
export function MySchedule({ onAsk }: { onAsk: () => void }) {
  const { today, leaves, upcoming } = useMyWeek();
  const [weekOpen, setWeekOpen] = useState(false);
  const d = today.data;
  if (!d) return null;
  const { holiday, lessons } = dayLessons(d, d.today);
  const nowHm = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: d.timezone }).format(new Date());
  const list = (leaves.data ?? []).filter((l) => l.endDate >= d.today).slice(0, 3);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="grid content-start gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold tracking-tight">Bugünkü derslerim</h2>
          <Button size="sm" variant="secondary" icon={<CalendarClock className="size-4" />} onClick={() => setWeekOpen(true)}>
            Haftalık program
          </Button>
        </div>
        {holiday ? (
          <p className="text-sm text-slate-500">Bugün tatil: {holiday}</p>
        ) : !lessons.length ? (
          <p className="text-sm text-slate-500">Bugün dersiniz yok.</p>
        ) : (
          <ul className="grid gap-1">
            {lessons.map((l) => {
              const live = l.period.start <= nowHm && nowHm < l.period.end;
              const past = l.period.end <= nowHm;
              return (
                <li
                  key={`${l.period.no}-${l.className}`}
                  className={
                    live
                      ? 'flex flex-wrap items-center gap-x-3 rounded-xl bg-brand-50 px-3 py-2 ring-1 ring-brand-100'
                      : 'flex flex-wrap items-center gap-x-3 rounded-xl px-3 py-2 ' + (past ? 'text-slate-400' : '')
                  }
                >
                  <span className="w-24 shrink-0 text-sm font-bold tabular-nums">
                    {hm(l.period.start)}–{hm(l.period.end)}
                  </span>
                  <span className={past ? 'text-sm font-semibold' : 'text-sm font-semibold text-ink'}>
                    {l.period.no}. ders · {l.className} {l.subject}
                  </span>
                  {l.coverFor && <Badge tone="amber">{l.coverFor} yerine</Badge>}
                  {live && <Badge tone="blue">Şu an</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="grid content-start gap-4 p-5">
        <div className="grid gap-2">
          <h2 className="text-lg font-extrabold tracking-tight">Nöbetlerim</h2>
          {upcoming.length ? (
            <ul className="grid gap-1.5 text-sm">
              {upcoming.slice(0, 4).map((x) => {
                const line = dutyLine(x, d.today);
                return (
                  <li key={x.date} className="flex flex-wrap gap-x-2">
                    <span className="font-bold text-ink">{line.when}</span>
                    <span className="text-slate-500">{line.what}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Yaklaşan nöbetiniz yok.</p>
          )}
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold tracking-tight">İzinlerim</h2>
            <Button size="sm" variant="secondary" icon={<CalendarPlus className="size-4" />} onClick={onAsk}>
              İzin bildir
            </Button>
          </div>
          {list.length ? (
            <ul className="grid gap-1.5 text-sm">
              {list.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{span(l.startDate, l.endDate)}</span>
                  <Badge tone={STATUS[l.approvalStatus].tone}>{STATUS[l.approvalStatus].label}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Yaklaşan izniniz yok.</p>
          )}
        </div>
      </Card>
      <WeeklyProgramDialog open={weekOpen} onClose={() => setWeekOpen(false)} lessons={d.lessons} />
    </div>
  );
}

/**
 * İdarenin Genel Bakış'ı, en alt (10A): dersi ya da nöbeti olan müdür ve müdür yardımcısı için küçük bölüm. Bugünkü ders
 * sayısı, sıradaki nöbet ve nöbetçi müdür yardımcılığı; haftalık program ve izin bildirme. Dersi ve nöbeti yoksa görünmez.
 */
export function MineCompact() {
  const { school } = useAuth();
  const { today, upcoming, leavesPath } = useMyWeek();
  const [weekOpen, setWeekOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const d = today.data;
  const todays = d ? dayLessons(d, d.today) : null;
  const hasLessons = Boolean(d?.lessons.length);
  if (!hasLessons && !upcoming.length) return null;
  const next = upcoming[0];
  const line = next ? dutyLine(next, d?.today ?? todayIso()) : null;
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
      <div className="min-w-0">
        <div className="text-sm font-extrabold text-ink">Derslerim ve nöbetlerim</div>
        <div className="text-sm text-slate-500">
          {todays && hasLessons
            ? todays.holiday
              ? 'Bugün tatil.'
              : todays.lessons.length
                ? `Bugün ${todays.lessons.length} dersiniz var: ${hm(todays.lessons[0]!.period.start)} – ${hm(todays.lessons[todays.lessons.length - 1]!.period.end)}.`
                : 'Bugün dersiniz yok.'
            : null}
          {line && ` Sıradaki nöbet: ${line.when}, ${line.what}.`}
        </div>
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        {hasLessons && (
          <Button size="sm" variant="secondary" icon={<CalendarClock className="size-4" />} onClick={() => setWeekOpen(true)}>
            Haftalık program
          </Button>
        )}
        {school?.teacherId && (
          <Button size="sm" variant="secondary" icon={<CalendarPlus className="size-4" />} onClick={() => setAsking(true)}>
            İzin bildir
          </Button>
        )}
      </div>
      {d && <WeeklyProgramDialog open={weekOpen} onClose={() => setWeekOpen(false)} lessons={d.lessons} />}
      <LeaveDialog open={asking} onClose={() => setAsking(false)} path={leavesPath} />
    </Card>
  );
}

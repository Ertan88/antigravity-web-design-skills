import { errorText, WEEKDAY_NAMES } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { CalendarPlus } from '../components/icons.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Textarea } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchoolPath } from '../lib/data.ts';
import { formatDate, todayIso } from '../lib/format.ts';

interface MeToday {
  teacher: { id: string; fullName: string } | null;
  today: string;
  lessons: { weekday: number; periodNo: number; className: string; subject: string }[];
}
interface MyDuties {
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
interface MyLeave {
  id: string;
  startDate: string;
  endDate: string;
  note: string | null;
  approvalStatus: 'approved' | 'pending' | 'rejected';
}

/** İzin türleri (mobildeki İzin bildir ile aynı) */
const KINDS = ['Mazeret izni', 'Görevlendirme', 'Rapor', 'Refakat izni', 'Doğum / babalık izni', 'Evlilik izni', 'Vefat izni', 'Diğer'] as const;
const DAYS = [1, 2, 3, 4, 5] as const;
type Tab = 'program' | 'duties' | 'leaves';

/** Bu haftanın Pazartesi–Pazar aralığı (ISO tarih) */
function weekRange(today: string): [string, string] {
  const d = new Date(`${today}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  const mon = new Date(d.getTime() - wd * 86_400_000);
  const sun = new Date(mon.getTime() + 6 * 86_400_000);
  return [mon.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)];
}

/**
 * Benim (2B): müdür, müdür yardımcısı ve görevi olan öğretmenin kendi bilgileri tek sayfada. Üstte bu haftanın
 * özeti; altında Ders programım, Nöbetlerim ve İzinlerim sekmeleri. Bilgiler kadrodaki öğretmen kaydından gelir
 * (kendiliğinden bağlanır); nöbetçi müdür yardımcısı günleri kadro kaydı olmasa da ada göre bulunur.
 */
export function Me() {
  const { school, schoolId } = useAuth();
  const todayPath = useSchoolPath('me/today');
  const dutiesPath = useSchoolPath('me/duties');
  const leavesPath = useSchoolPath('me/leaves');
  const today = useQuery({ queryKey: [schoolId, 'me/today'], queryFn: () => api<MeToday>(todayPath), enabled: Boolean(schoolId) });
  const duties = useQuery({ queryKey: [schoolId, 'me/duties'], queryFn: () => api<MyDuties>(dutiesPath), enabled: Boolean(schoolId) });
  const leaves = useQuery({ queryKey: [schoolId, 'me/leaves'], queryFn: () => api<MyLeave[]>(leavesPath), enabled: Boolean(schoolId) });
  const [tab, setTab] = useState<Tab>('program');
  const [asking, setAsking] = useState(false);

  const lessons = today.data?.lessons ?? [];
  const [mon, sun] = weekRange(today.data?.today ?? todayIso());
  const dutyDays = (duties.data?.days ?? []).filter((d) => !d.holiday && (d.duties.length > 0 || d.transport));
  const thisWeek = dutyDays.filter((d) => d.date >= mon && d.date <= sun);
  const supervising = thisWeek.find((d) => d.duties.some((x) => x.dutyId.startsWith('supervisor:')));
  const pending = (leaves.data ?? []).filter((l) => l.approvalStatus === 'pending').length;
  const teacher = today.data?.teacher;

  const loading = today.isLoading || duties.isLoading || leaves.isLoading;
  const error = today.error ?? duties.error ?? leaves.error;

  return (
    <div>
      <PageHeader
        title="Benim"
        description={[teacher?.fullName ?? duties.data?.teacherName, school ? (school.teacherTitle ?? null) : null].filter(Boolean).join(' · ') || 'Ders programınız, nöbetleriniz ve izinleriniz'}
        actions={
          <Button icon={<CalendarPlus className="size-4" />} onClick={() => setAsking(true)}>
            İzin bildir
          </Button>
        }
      />
      {error ? (
        <Alert tone="red">{(error as Error).message}</Alert>
      ) : loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-5">
          {!teacher && (
            <Alert tone="amber">
              Kadroda öğretmen kaydınız bulunamadı. Dersiniz varsa Kişiler ve Yetkiler'de kişi kartınızdan kadrodaki kaydınızı seçin. Nöbetçi müdür yardımcısı günleriniz yine de görünür.
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi tone="bg-tile-sky text-tile-sky-ink" value={String(lessons.length)} label="ders saati / hafta" />
            <Kpi tone="bg-tile-peach text-tile-peach-ink" value={String(thisWeek.filter((d) => d.duties.some((x) => !x.dutyId.startsWith('supervisor:')) || d.transport).length)} label="nöbet bu hafta" />
            <Kpi tone="bg-tile-lilac text-tile-lilac-ink" value={supervising ? WEEKDAY_NAMES[supervising.weekday]!.slice(0, 3) : '—'} label="nöbetçi md. yrd. (bu hafta)" />
            <Kpi tone="bg-tile-mint text-tile-mint-ink" value={String(pending)} label="onay bekleyen izin" />
          </div>

          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'program', label: 'Ders programım' },
              { value: 'duties', label: 'Nöbetlerim' },
              { value: 'leaves', label: 'İzinlerim' },
            ]}
          />

          {tab === 'program' && <Program lessons={lessons} />}
          {tab === 'duties' && <Duties days={dutyDays} />}
          {tab === 'leaves' && <Leaves rows={leaves.data ?? []} onAsk={() => setAsking(true)} />}
        </div>
      )}
      <LeaveDialog open={asking} onClose={() => setAsking(false)} path={leavesPath} />
    </div>
  );
}

function Kpi({ tone, value, label }: { tone: string; value: string; label: string }) {
  return (
    <div className={clsx('rounded-3xl p-4', tone)}>
      <div className="text-3xl font-extrabold tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-semibold opacity-80">{label}</div>
    </div>
  );
}

function Program({ lessons }: { lessons: MeToday['lessons'] }) {
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

function Duties({ days }: { days: MyDuties['days'] }) {
  const today = todayIso();
  const upcoming = days.filter((d) => d.date >= today);
  if (!upcoming.length) return <EmptyState icon={<CalendarPlus className="size-6" />} title="Yaklaşan nöbetiniz yok" description="Nöbet çizelgesinde adınız geçen günler burada görünür." />;
  return (
    <Card className="divide-y divide-slate-100 p-0 dark:divide-white/10">
      {upcoming.map((d) => (
        <div key={d.date} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="w-40 shrink-0 text-sm font-bold text-ink">
            {WEEKDAY_NAMES[d.weekday]}, {formatDate(d.date)}
            {d.date === today && (
              <span className="ml-2">
                <Badge tone="blue">Bugün</Badge>
              </span>
            )}
          </div>
          <div className="grid gap-1 text-sm text-slate-700 dark:text-slate-200">
            {d.duties.map((x) => (
              <div key={x.dutyId}>
                <span className="font-semibold">{x.area}</span>
                {x.partners.length > 0 && <span className="text-slate-500"> · birlikte: {x.partners.join(', ')}</span>}
                {x.substituteFor && <span className="text-slate-500"> · {x.substituteFor} yerine</span>}
                {x.coveredBy && <span className="text-slate-500"> · yerinize {x.coveredBy}</span>}
              </div>
            ))}
            {d.transport && (
              <div>
                <span className="font-semibold">Taşımalı eğitim</span>
                {d.transport.partners.length > 0 && <span className="text-slate-500"> · birlikte: {d.transport.partners.join(', ')}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}

const STATUS: Record<MyLeave['approvalStatus'], { label: string; tone: 'green' | 'amber' | 'red' }> = {
  approved: { label: 'Onaylandı', tone: 'green' },
  pending: { label: 'Onay bekliyor', tone: 'amber' },
  rejected: { label: 'Onaylanmadı', tone: 'red' },
};

function Leaves({ rows, onAsk }: { rows: MyLeave[]; onAsk: () => void }) {
  if (!rows.length)
    return (
      <EmptyState
        icon={<CalendarPlus className="size-6" />}
        title="İzin bildiriminiz yok"
        action={
          <Button variant="secondary" onClick={onAsk}>
            İzin bildir
          </Button>
        }
      />
    );
  return (
    <Card className="divide-y divide-slate-100 p-0 dark:divide-white/10">
      {rows.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <span className="font-bold text-ink">{l.startDate === l.endDate ? formatDate(l.startDate) : `${formatDate(l.startDate)} – ${formatDate(l.endDate)}`}</span>
          {l.note && <span className="text-slate-500">{l.note}</span>}
          <span className="ml-auto">
            <Badge tone={STATUS[l.approvalStatus].tone}>{STATUS[l.approvalStatus].label}</Badge>
          </span>
        </div>
      ))}
    </Card>
  );
}

function LeaveDialog({ open, onClose, path }: { open: boolean; onClose: () => void; path: string }) {
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

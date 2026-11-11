import { coverBandText, errorText } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bus, CalendarCheck2, History, ShieldCheck } from '../../components/icons.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Badge, Button, Card, DeleteButton, EmptyState, Modal, PageHeader, Segmented, Select, Spinner, Table, Td } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';
import { currentMonth, MonthNav, monthLabel } from '../duties/calendar.tsx';

/*
 * İzinli öğretmen yerine görevlendirme: Genel Bakış'ta yalnızca tek satırlık uyarı bandı; atama, istatistik ve sınıf
 * geçmişi Personel › Görevlendirme sayfasında (menüde boş sayısı rozetli). Öğretmen kendi görevlerini "Görevlerim"de görür.
 */

type Candidate = { teacherId: string; fullName: string; onDuty: boolean; monthCount: number };
interface CoverDay {
  date: string;
  holiday: string | null;
  absent: { teacherId: string; fullName: string }[];
  lessons: {
    periodNo: number;
    start: string | null;
    end: string | null;
    classGroupId: string;
    className: string;
    subject: string;
    absentName: string;
    cover: { id: string; teacherId: string; fullName: string } | null;
    candidates: Candidate[];
  }[];
  duties: { dutyId: string; area: string; absentName: string; substitute: { id: string; teacherName: string } | null; candidates: Candidate[] }[];
}

/**
 * Aday öğretmen çipleri: ilk birkaçı çip, kalanı açılır listede. Nöbetçiler "NÖBETÇİ" etiketli; ders satırında diğerleri
 * "DERSİ YOK" etiketli (o gün dersi olan, o saatte boş). Nöbet yerinde ikinci etiket yoktur.
 */
function CandidateChips({ list, busy, onPick, freeTag = false }: { list: Candidate[]; busy: boolean; onPick: (teacherId: string) => void; freeTag?: boolean }) {
  const shown = list.slice(0, 6);
  const rest = list.slice(6);
  if (!list.length) return <p className="mt-2 text-xs font-semibold text-rose-700">Okulda olup bu saatte boş olan öğretmen yok.</p>;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {shown.map((c) => (
        <button
          key={c.teacherId}
          type="button"
          disabled={busy}
          onClick={() => onPick(c.teacherId)}
          title={`Bu ay ${c.monthCount} ders`}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 transition disabled:opacity-50',
            c.onDuty ? 'bg-brand-50 text-brand-800 ring-brand-300 hover:bg-brand-100' : 'bg-surface text-ink ring-slate-200 hover:bg-slate-100',
          )}
        >
          {c.fullName}
          {c.onDuty ? (
            <span className="rounded-md bg-brand-700 px-1.5 py-px text-[10px] font-extrabold tracking-wide text-white">NÖBETÇİ</span>
          ) : (
            freeTag && <span className="rounded-md bg-slate-200 px-1.5 py-px text-[10px] font-extrabold tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-100">DERSİ YOK</span>
          )}
        </button>
      ))}
      {rest.length > 0 && (
        <div className="w-48">
        <Select value="" disabled={busy} onChange={(e) => e.target.value && onPick(e.target.value)} className="py-1 text-xs" aria-label="Diğer boş öğretmenler">
          <option value="">+{rest.length} öğretmen daha</option>
          {rest.map((c) => (
            <option key={c.teacherId} value={c.teacherId}>
              {c.fullName}
              {c.onDuty ? ' (nöbetçi)' : freeTag ? ' (dersi yok)' : ''}
            </option>
          ))}
        </Select>
        </div>
      )}
    </div>
  );
}

/** Günün boş dersleri ve nöbet yerleri (bant, menü rozeti ve Görevlendirme sayfası aynı veriyi paylaşır) */
export function useCoverDay(date?: string) {
  const { can, schoolId } = useAuth();
  const path = useSchoolPath(`cover-day${date ? `?date=${date}` : ''}`);
  return useQuery({
    queryKey: [schoolId, 'cover-day', date ?? 'today'],
    queryFn: () => api<CoverDay>(path),
    enabled: Boolean(schoolId) && can('duties.manage'),
    refetchInterval: 60_000,
  });
}

/** Atanmamış boşluk sayısı */
export const openCount = (d: CoverDay | undefined) => (d && !d.holiday ? d.lessons.filter((l) => !l.cover).length + d.duties.filter((x) => !x.substitute).length : 0);

/** Genel Bakış: yalnızca atanmamış boşluk varken tek satırlık uyarı bandı; atama Görevlendirme sayfasında */
export function CoverBand() {
  const d = useCoverDay().data;
  const open = openCount(d);
  if (!d || !open) return null;
  const text = coverBandText(
    d.absent.map((a) => a.fullName),
    d.lessons.filter((l) => !l.cover).length,
    d.duties.filter((x) => !x.substitute).length,
  );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
      <AlertTriangle className="size-5 shrink-0 text-amber-600" />
      <p className="min-w-0 flex-1 text-sm text-slate-700">
        <b className="text-amber-800">{text.title}</b> {text.detail}
      </p>
      <Link to="/gorevlendirme" className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-bold whitespace-nowrap text-surface hover:opacity-90">
        Görevlendir <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

const shiftDay = (iso: string, by: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + by * 86400_000).toISOString().slice(0, 10);
const dayText = (iso: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/** Bir günün boş dersleri ve nöbet yerleri; her satırda o saatte boş öğretmenler (nöbetçiler önce) */
function CoverDayList({ date }: { date?: string }) {
  const { schoolId } = useAuth();
  const coversPath = useSchoolPath('covers');
  const subsPath = useSchoolPath('duty-substitutions');
  const qc = useQueryClient();
  const toast = useToast();
  const q = useCoverDay(date);
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [schoolId, 'cover-day'] }),
    onError: (err) => toast.error(errorText(err, 'Kaydedilemedi')),
  });
  const d = q.data;
  if (q.isLoading || !d)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  if (d.holiday) return <EmptyState icon={<CalendarCheck2 className="size-7" />} title={d.holiday} description="Tatil: görevlendirme yok." />;
  if (!d.lessons.length && !d.duties.length)
    return <EmptyState icon={<ShieldCheck className="size-7" />} title="Boş ders yok" description="Bu gün izinli öğretmen yok ya da izinli öğretmenin dersi ve nöbeti yok." />;
  const open = openCount(d);
  return (
    <div className="grid gap-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {open > 0 ? <Badge tone="red">{open} boş</Badge> : <Badge tone="green">hepsi atandı</Badge>}
        <span className="text-sm text-slate-500">İzinli: {d.absent.map((a) => a.fullName).join(', ')}. O gün okulda olup o saatte boş olan öğretmenler önerilir; nöbetçiler öndedir.</span>
      </div>
      {d.lessons.map((l) => (
        <div key={`${l.periodNo}-${l.classGroupId}`} className={clsx('rounded-2xl p-3 ring-1', l.cover ? 'ring-slate-200' : 'bg-rose-50/60 ring-rose-200')}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold text-ink">
              {l.periodNo}. ders{l.start ? ` · ${l.start}` : ''} · {l.className} {l.subject}
            </span>
            <span className="text-xs text-slate-500">{l.absentName} yerine</span>
            {l.cover && (
              <span className="ml-auto flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-700">✓ {l.cover.fullName} girecek</span>
                <DeleteButton label="Görevlendirmeyi kaldır" what="Bu görevlendirme" onConfirm={() => act.mutate(() => api(`${coversPath}/${l.cover!.id}`, { method: 'DELETE' }))} />
              </span>
            )}
          </div>
          {!l.cover && (
            <CandidateChips
              list={l.candidates}
              busy={act.isPending}
              freeTag
              onPick={(teacherId) => act.mutate(() => api(coversPath, { method: 'POST', body: { date: d.date, periodNo: l.periodNo, classGroupId: l.classGroupId, teacherId } }))}
            />
          )}
        </div>
      ))}
      {d.duties.map((x) => (
        <div key={x.dutyId} className={clsx('rounded-2xl p-3 ring-1', x.substitute ? 'ring-slate-200' : 'bg-rose-50/60 ring-rose-200')}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold text-ink">Nöbet yeri · {x.area}</span>
            <span className="text-xs text-slate-500">{x.absentName} yerine</span>
            {x.substitute && (
              <span className="ml-auto flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-700">✓ {x.substitute.teacherName}</span>
                <DeleteButton label="Görevlendirmeyi kaldır" what="Bu görevlendirme" onConfirm={() => act.mutate(() => api(`${subsPath}/${x.substitute!.id}`, { method: 'DELETE' }))} />
              </span>
            )}
          </div>
          {!x.substitute && (
            <CandidateChips list={x.candidates} busy={act.isPending} onPick={(teacherId) => act.mutate(() => api(subsPath, { method: 'POST', body: { date: d.date, dutyId: x.dutyId, teacherId } }))} />
          )}
        </div>
      ))}
    </div>
  );
}

type AssignTab = 'today' | 'stats';

/** Görevlendirme sayfası: "Bugün" (izinli öğretmenin dersleri ve nöbet yeri, atama) ve "İstatistik ve sınıf geçmişi" */
export function AssignmentsPage() {
  const [params, setParams] = useSearchParams();
  const tab: AssignTab = params.get('bolum') === 'istatistik' ? 'stats' : 'today';
  const setTab = (t: AssignTab) => setParams(t === 'stats' ? { bolum: 'istatistik' } : {}, { replace: true });
  const today = useCoverDay().data?.date;
  const [date, setDate] = useState<string | null>(null);
  const shown = date ?? today ?? null;
  const [month, setMonth] = useState(currentMonth);
  const open = openCount(useCoverDay().data);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Görevlendirme"
        description="İzinli öğretmenin boş kalan dersleri ve nöbet yeri burada listelenir. O gün okulda olup o saatte boş olan öğretmenler önerilir. Öğretmenin adına dokunulunca görevlendirme yapılır ve öğretmene bildirim gider."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: open ? `Bugün · ${open} boş` : 'Günlük' },
            { value: 'stats', label: 'İstatistik ve sınıf geçmişi' },
          ]}
        />
        {tab === 'stats' ? (
          <MonthNav month={month} onMonth={setMonth} />
        ) : (
          shown && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDate(shiftDay(shown, -1))} aria-label="Önceki gün">
                ‹
              </Button>
              <span className="min-w-52 text-center text-sm font-bold text-ink">
                {shown === today ? 'Bugün · ' : ''}
                {dayText(shown)}
              </span>
              <Button size="sm" variant="secondary" onClick={() => setDate(shiftDay(shown, 1))} aria-label="Sonraki gün">
                ›
              </Button>
              {shown !== today && (
                <Button size="sm" variant="ghost" onClick={() => setDate(null)}>
                  Bugün
                </Button>
              )}
            </div>
          )
        )}
      </div>
      {tab === 'stats' ? (
        <CoverStatsView month={month} />
      ) : (
        <Card className="p-5 sm:p-6">
          <CoverDayList date={date ?? undefined} />
        </Card>
      )}
    </div>
  );
}

interface StatsRow {
  teacherId: string;
  fullName: string;
  month: number;
  total: number;
}

/** Görevlendirme › İstatistik: öğretmen başına ay ve toplam; sınıf geçmişi ayrı pencerede */
export function CoverStatsView({ month }: { month: string }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('cover-stats');
  const q = useQuery({ queryKey: [schoolId, 'cover-stats', month], queryFn: () => api<{ rows: StatsRow[] }>(`${path}?month=${month}`) });
  const [history, setHistory] = useState(false);
  const rows = q.data?.rows ?? [];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-tile-sky/40 px-5 py-3.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-sky-600 text-white">
          <CalendarCheck2 className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">{monthLabel(month)} · İzinli yerine girilen dersler</h2>
          <p className="text-xs text-slate-500">Önce seçili ay, sonra kayıtların başından toplam gösterilir. Bilgi amaçlıdır.</p>
        </div>
        <Button size="sm" variant="secondary" className="ml-auto" icon={<History className="size-4" />} onClick={() => setHistory(true)}>
          Sınıf geçmişi
        </Button>
      </div>
      {q.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !rows.some((r) => r.total) ? (
        <EmptyState icon={<ShieldCheck className="size-7" />} title="Henüz görevlendirme yok" description="İzinli öğretmenin dersine öğretmen gönderildikçe burada sayılır." />
      ) : (
        <Table head={['Öğretmen', `${monthLabel(month).split(' ')[0]} (ders)`, 'Toplam (ders)']}>
          {rows.map((r) => (
            <tr key={r.teacherId}>
              <Td className="font-semibold text-ink">{r.fullName}</Td>
              <Td className="tabular-nums">{r.month || '—'}</Td>
              <Td className="font-bold tabular-nums">{r.total || '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
      <ClassHistory open={history} onClose={() => setHistory(false)} />
    </Card>
  );
}

/** Sınıf geçmişi: sınıf başına girilen ders sayısı; sınıfa dokununca tek tek kayıtlar */
function ClassHistory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('cover-history');
  const [classId, setClassId] = useState<string | null>(null);
  const list = useQuery({ queryKey: [schoolId, 'cover-history'], queryFn: () => api<{ classes: { classGroupId: string; className: string; n: number }[] }>(path), enabled: open });
  const items = useQuery({
    queryKey: [schoolId, 'cover-history', classId],
    queryFn: () => api<{ items: { id: string; date: string; periodNo: number; subject: string; teacherName: string; absentName: string }[] }>(`${path}?classId=${classId}`),
    enabled: open && Boolean(classId),
  });
  const cls = list.data?.classes.find((c) => c.classGroupId === classId);
  return (
    <Modal open={open} onClose={onClose} title={cls ? `${cls.className} · izinli yerine girilen dersler` : 'Sınıf geçmişi'} description="Hangi sınıfa izinli öğretmen yerine kaç ders girildi.">
      {!classId ? (
        <div className="grid gap-1.5">
          {(list.data?.classes ?? []).map((c) => (
            <button key={c.classGroupId} type="button" onClick={() => setClassId(c.classGroupId)} className="flex items-center justify-between rounded-xl px-3 py-2 text-left ring-1 ring-slate-200 hover:bg-slate-50">
              <span className="font-semibold text-ink">{c.className}</span>
              <span className="text-sm font-bold tabular-nums text-slate-600">{c.n} ders</span>
            </button>
          ))}
          {list.data && !list.data.classes.length && <p className="text-sm text-slate-500">Henüz kayıt yok.</p>}
        </div>
      ) : (
        <div className="grid gap-2">
          <Button size="sm" variant="ghost" onClick={() => setClassId(null)} className="justify-self-start">
            ← Bütün sınıflar
          </Button>
          {(items.data?.items ?? []).map((i) => (
            <div key={i.id} className="rounded-xl px-3 py-2 text-sm ring-1 ring-slate-200">
              <div className="font-semibold text-ink">
                {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${i.date}T12:00:00Z`))} · {i.periodNo}. ders · {i.subject}
              </div>
              <div className="text-xs text-slate-500">
                {i.teacherName} girdi{i.absentName ? ` · ${i.absentName} yerine` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Öğretmenin kendi görevleri: ayın ders görevlendirmeleri, ay / toplam ders, taşımalı sayıları */
export function MyCoversPage() {
  const { schoolId, school } = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const path = useSchoolPath('my-covers');
  const q = useQuery({
    queryKey: [schoolId, 'my-covers', month],
    queryFn: () =>
      api<{ today: string; monthCount: number; total: number; transportMonth: number; transportTotal: number; items: { id: string; date: string; periodNo: number; subject: string; className: string; absentName: string }[] }>(`${path}?month=${month}`),
    enabled: Boolean(school?.teacherId),
  });
  const d = q.data;
  return (
    <div className="space-y-6">
      <PageHeader title="Görevlerim" description="İzinli öğretmen yerine girdiğiniz dersler ve taşımalı görevleriniz. Görevlendirildiğinizde bildirim de gelir." actions={<MonthNav month={month} onMonth={setMonth} />} />
      {!school?.teacherId ? (
        <Card className="p-6 text-sm text-slate-500">Hesabınız bir öğretmen kaydına bağlı değil.</Card>
      ) : !d ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile tone="bg-tile-sky text-tile-sky-ink" label={`${monthLabel(month).split(' ')[0]} · derse girdiğim`} value={`${d.monthCount} saat`} />
            <Tile tone="bg-tile-mint text-tile-mint-ink" label="Toplam derse girdiğim" value={`${d.total} saat`} />
            <Tile tone="bg-tile-lilac text-tile-lilac-ink" label={`${monthLabel(month).split(' ')[0]} · taşımalı`} value={`${d.transportMonth} gün`} icon />
            <Tile tone="bg-tile-dark text-white" label="Toplam taşımalı" value={`${d.transportTotal} gün`} icon />
          </div>
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-ink">{monthLabel(month)} · ders görevlendirmeleri</h2>
            {!d.items.length ? (
              <p className="text-sm text-slate-500">Bu ay görevlendirme yok.</p>
            ) : (
              <div className="grid gap-2">
                {d.items.map((i) => (
                  <div key={i.id} className={clsx('rounded-xl px-3 py-2 ring-1', i.date === d.today ? 'bg-brand-50 ring-brand-200' : 'ring-slate-200')}>
                    <div className="font-semibold text-ink">
                      {i.date === d.today ? 'Bugün' : new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${i.date}T12:00:00Z`))} · {i.periodNo}. ders · {i.className}
                    </div>
                    <div className="text-xs text-slate-500">
                      {i.subject}
                      {i.absentName ? ` · ${i.absentName} yerine` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ tone, label, value, icon }: { tone: string; label: string; value: string; icon?: boolean }) {
  return (
    <div className={clsx('rounded-3xl p-5', tone)}>
      <div className="flex items-center gap-1.5 text-[13px] font-bold opacity-75">
        {icon ? <Bus className="size-4" /> : <CalendarCheck2 className="size-4" />}
        {label}
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

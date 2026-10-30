import { academicYearOf, semesterBreak, type AcademicCalendarData } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarDays, CalendarPlus, GraduationCap, Plus, Sunset, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/Toast.tsx';
import { Badge, Button, Card, Input, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../../lib/data.ts';
import { formatDate, formatDateLong } from '../../lib/format.ts';

interface Upcoming {
  holidays: { id: string | null; date: string; name: string; source: 'official' | 'meb' | 'school' }[];
  halfDays: { date: string; name: string }[];
  bridges: { date: string; near: string }[];
}

/** Bugünden eğitim yılının sonuna (30 Haziran) kadar tatiller, arifeler ve olası köprü günleri */
export function useUpcomingHolidays() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('holidays');
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.max(30, Math.round((Date.parse(`${academicYearOf(today) + 1}-06-30`) - Date.parse(today)) / 86400_000));
  return useQuery({
    queryKey: [schoolId, 'holidays', 'upcoming'],
    queryFn: () => api<Upcoming>(`${path}/upcoming?days=${days}`),
    enabled: Boolean(schoolId),
  });
}

interface SchoolAcademic {
  currentYear: number;
  follow: boolean;
  years: { startYear: number; label: string; data: AcademicCalendarData; source: 'meb' | 'manual' | 'builtin'; status: 'confirmed' | 'review' }[];
}

/** Bir haftanın tatil ve arifeleri (Zil Saatleri'ndeki gün şeridi için; geçmiş günler dahil) */
export function useWeekHolidays(monday: string) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('holidays');
  return useQuery({
    queryKey: [schoolId, 'holidays', 'week', monday],
    queryFn: () => api<Upcoming>(`${path}/upcoming?from=${monday}&days=6`),
    enabled: Boolean(schoolId),
  });
}

type Row =
  | { kind: 'holiday'; date: string; name: string; id: string | null; source: 'official' | 'meb' | 'school'; end?: string; days?: number }
  | { kind: 'half'; date: string; name: string }
  | { kind: 'bridge'; date: string; near: string };

/** Kısaltmasız, yıl ve gün adıyla: "16 Kasım 2026 Pazartesi" */
const dateText = formatDateLong;
const shortText = formatDate;
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
/** "Kurban Bayramı 2. Gün" -> "Kurban Bayramı": aynı tatilin günleri tek satırda */
const groupName = (name: string) => name.replace(/ \d+\. Gün$/, '');

/** Ardışık, aynı adlı resmî / MEB tatil günlerini tek satırda topla (okulun kendi tatilleri tek tek silinebilir kalır) */
function groupHolidays(list: Upcoming['holidays']): Extract<Row, { kind: 'holiday' }>[] {
  const out: Extract<Row, { kind: 'holiday' }>[] = [];
  for (const h of list) {
    const last = out[out.length - 1];
    if (last && h.source !== 'school' && last.source === h.source && groupName(last.name) === groupName(h.name) && nextDay(last.end ?? last.date) === h.date) {
      last.end = h.date;
      last.days = (last.days ?? 1) + 1;
      last.name = groupName(h.name);
    } else out.push({ kind: 'holiday', ...h });
  }
  return out;
}

const SOURCE_BADGE = {
  official: { tone: 'red', label: 'Resmî tatil' },
  meb: { tone: 'green', label: 'MEB takvimi' },
  school: { tone: 'blue', label: 'Okulun tatili' },
} as const;

/** Köprü günü tatil yapılınca panoda ve nöbet çizelgesinde görünen ad */
const BRIDGE_NAME = 'İdari İzin (Köprü Günü)';

/**
 * Tatiller ve arifeler: yaklaşan resmî / dini tatiller, okulun eklediği tatiller, arifeler (yarım gün) ve
 * bayrama bitişik olası köprü günleri. Köprü günü idari izin ilan edilirse tek tıkla tatil yapılır.
 * Arifede derslerin bittiği saat okul ayarıdır; panodaki zil sayacı ve sıradaki ders buna göre kısalır.
 */
export function HolidaysCard() {
  const { schoolId, can } = useAuth();
  const path = useSchoolPath('holidays');
  const schoolPath = useSchoolPath();
  const school = useSchool();
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const box = useRef<HTMLDivElement>(null);
  const canHolidays = can('duties.manage');
  const canSettings = can('settings.manage');

  const list = useUpcomingHolidays();
  // Bildirimden gelince ("Olası köprü günü") bu bölüme kaydır
  useEffect(() => {
    if (params.get('tatiller') && list.data) box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [params, list.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: [schoolId, 'holidays'] });
  const add = useMutation({
    mutationFn: (body: { date: string; name: string }) => api(path, { method: 'POST', body }),
    onSuccess: () => {
      void refresh();
      toast.success('Tatil eklendi; o gün panoda zil çalmaz');
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void refresh();
      toast.success('Tatil kaldırıldı');
    },
    onError: (e) => toast.error(e.message),
  });

  const [endsAt, setEndsAt] = useState('');
  const savedEnd = school.data?.settings.halfDayEnd ?? '13:00';
  const saveEnd = useMutation({
    mutationFn: (halfDayEnd: string) => api<School>(schoolPath, { method: 'PATCH', body: { settings: { halfDayEnd } } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      setEndsAt('');
      toast.success(`Arifede son zil ${data.settings.halfDayEnd}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');

  // Arife aynı zamanda köprü günüyse tek satır: "Tam gün yap" ikisini birden karşılar
  const halfDates = new Set((list.data?.halfDays ?? []).map((h) => h.date));
  const bridgeDates = new Set((list.data?.bridges ?? []).map((h) => h.date));
  const rows: Row[] = [
    ...groupHolidays(list.data?.holidays ?? []),
    ...(list.data?.halfDays ?? []).map((h) => ({ kind: 'half' as const, ...h })),
    ...(list.data?.bridges ?? []).filter((h) => !halfDates.has(h.date)).map((h) => ({ kind: 'bridge' as const, ...h })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div ref={box} className="scroll-mt-20">
      <Card>
        <div className="flex flex-col gap-5 p-5 lg:flex-row">
          <div className="space-y-4 lg:w-80 lg:shrink-0">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <CalendarDays className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold text-ink">Tatiller ve arifeler</h2>
                <p className="text-sm text-slate-500">Eğitim yılının sonuna kadar</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <b className="text-ink">Tatil:</b> zil çalmaz, panoda sıradaki ders olarak tatilden sonraki ilk ders günü görünür.
              </li>
              <li>
                <b className="text-ink">Arife (yarım gün):</b> öğleden sonra ders yapılmaz. Son zilden sonra başlayan dersler düşer, taşan ders son zilde biter.
              </li>
              <li>
                <b className="text-ink">Köprü günü:</b> bayram ile hafta sonu arasında kalan iş günü. İdari izin ilan edilirse tatil olarak işaretleyin.
              </li>
            </ul>
            <AcademicYearBox canSettings={canSettings} />
            <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <label htmlFor="half-day-end" className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <Sunset className="size-4" /> Arifede son zil
              </label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  id="half-day-end"
                  type="time"
                  className="w-32"
                  value={endsAt || savedEnd}
                  disabled={!canSettings}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
                {canSettings && endsAt && endsAt !== savedEnd && (
                  <Button size="sm" loading={saveEnd.isPending} onClick={() => saveEnd.mutate(endsAt)}>
                    Kaydet
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-amber-800">Kamuda arife 13:00'ten itibaren tatildir. Arife tam gün tatil ilan edilirse o günü aşağıdan tatil olarak ekleyin.</p>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {list.isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Yükleniyor…</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                {rows.map((r) => (
                  <li key={`${r.kind}-${r.date}`} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5', r.kind === 'bridge' && 'bg-amber-50/50')}>
                    <span className="w-60 shrink-0 text-sm font-medium text-slate-700">
                      {r.kind === 'holiday' && r.end ? `${shortText(r.date)} – ${shortText(r.end)}` : dateText(r.date)}
                      {r.kind === 'holiday' && r.days && r.days > 1 && <span className="block text-xs font-normal text-slate-400">{r.days} gün</span>}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      {r.kind === 'bridge' ? <span className="text-slate-600">{r.near} tatiline bitişik</span> : r.name}
                    </span>
                    {r.kind === 'holiday' && <Badge tone={SOURCE_BADGE[r.source].tone}>{SOURCE_BADGE[r.source].label}</Badge>}
                    {r.kind === 'half' && <Badge tone="amber">Yarım gün · son zil {savedEnd}</Badge>}
                    {r.kind === 'half' && bridgeDates.has(r.date) && <Badge tone="slate">Olası köprü günü</Badge>}
                    {r.kind === 'bridge' && <Badge tone="slate">Olası köprü günü</Badge>}
                    {canHolidays && r.kind === 'bridge' && (
                      <Button size="sm" variant="secondary" icon={<CalendarPlus className="size-4" />} loading={add.isPending && add.variables?.date === r.date} onClick={() => add.mutate({ date: r.date, name: BRIDGE_NAME })}>
                        Tatil yap
                      </Button>
                    )}
                    {canHolidays && r.kind === 'half' && (
                      <Button size="sm" variant="secondary" loading={add.isPending && add.variables?.date === r.date} onClick={() => add.mutate({ date: r.date, name: r.name })}>
                        Tam gün yap
                      </Button>
                    )}
                    {canHolidays && r.kind === 'holiday' && r.source === 'school' && r.id && (
                      <button
                        type="button"
                        aria-label={`${r.name} tatilini kaldır`}
                        title={r.name.startsWith('İdari İzin') || r.name.endsWith('Arifesi') ? 'Kaldırınca önceki haline döner' : 'Kaldır'}
                        onClick={() => remove.mutate(r.id!)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
                {!rows.length && <li className="px-4 py-8 text-center text-sm text-slate-500">Önümüzdeki aylarda tatil yok.</li>}
              </ul>
            )}
            {canHolidays && (
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newDate || newName.trim().length < 2) return;
                  add.mutate({ date: newDate, name: newName.trim() }, { onSuccess: () => (setNewDate(''), setNewName('')) });
                }}
              >
                <Input type="date" className="w-44" aria-label="Tatil tarihi" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                <Input className="min-w-48 flex-1" aria-label="Tatil adı" placeholder="ör. Ara tatil, İdari izin, Okul gezisi" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Button type="submit" variant="secondary" icon={<Plus className="size-4" />} disabled={!newDate || newName.trim().length < 2}>
                  Tatil ekle
                </Button>
              </form>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Kısaltmasız: "16 Kasım 2026" */
const dm = formatDate;

/**
 * Eğitim yılının MEB takvimi (bu ve varsa gelecek yıl): ders başlangıcı, ara tatiller, yarıyıl, ders yılı sonu.
 * Okul "MEB takvimini uygula"yı kapatırsa ara tatil, yarıyıl ve yaz tatili okulda tatil sayılmaz.
 */
function AcademicYearBox({ canSettings }: { canSettings: boolean }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('academic-calendar');
  const schoolPath = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  const cal = useQuery({ queryKey: [schoolId, 'holidays', 'academic'], queryFn: () => api<SchoolAcademic>(path), enabled: Boolean(schoolId) });
  const toggle = useMutation({
    mutationFn: (followMebCalendar: boolean) => api<School>(schoolPath, { method: 'PATCH', body: { settings: { followMebCalendar } } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      void qc.invalidateQueries({ queryKey: [schoolId, 'holidays'] });
      toast.success(data.settings.followMebCalendar ? 'MEB takvimindeki tatiller uygulanıyor' : 'MEB takvimindeki tatiller okulda uygulanmıyor');
    },
    onError: (e) => toast.error(e.message),
  });
  const years = cal.data?.years ?? [];
  if (!cal.data) return null;
  return (
    <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <GraduationCap className="size-4" /> MEB çalışma takvimi
      </div>
      {years.length ? (
        years.map((y) => {
          const d = y.data;
          const rows: [string, string][] = [
            ['Dersler başlar', dm(d.lessonsStart)],
            ...d.breaks.map((b): [string, string] => [b.name, `${dm(b.start)} – ${dm(b.end)}`]),
            ['Yarıyıl tatili', `${dm(semesterBreak(d).start)} – ${dm(semesterBreak(d).end)}`],
            ['Ders yılı biter', dm(d.lessonsEnd)],
          ];
          return (
            <div key={y.startYear} className="mt-2">
              <div className="text-xs font-bold text-emerald-800">
                {y.label} eğitim yılı{y.status === 'review' && ' · kontrol ediliyor'}
              </div>
              <dl className="mt-1 space-y-1 text-xs">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-slate-600">{k}</dt>
                    <dd className="font-semibold text-ink tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })
      ) : (
        <p className="mt-2 text-xs text-slate-600">Bu eğitim yılının takvimi henüz yayımlanmadı. MEB yayımlayınca kendiliğinden eklenir.</p>
      )}
      <div className="mt-3 border-t border-emerald-200 pt-2">
        <Toggle checked={cal.data.follow} disabled={!canSettings} onChange={(v) => toggle.mutate(v)} label="Ara tatil, yarıyıl ve yaz tatilini uygula" />
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Takvim her yıl haziran ortasından itibaren MEB'in sitesinden otomatik alınır.</p>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarDays, CalendarPlus, Plus, Sunset, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/Toast.tsx';
import { Badge, Button, Card, Input } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../../lib/data.ts';

interface Upcoming {
  holidays: { id: string | null; date: string; name: string; source: 'official' | 'school' }[];
  halfDays: { date: string; name: string }[];
  bridges: { date: string; near: string }[];
}

/** Bugünden itibaren tatiller, arifeler ve olası köprü günleri */
export function useUpcomingHolidays() {
  const { schoolId } = useAuth();
  const path = useSchoolPath('holidays');
  return useQuery({
    queryKey: [schoolId, 'holidays', 'upcoming'],
    queryFn: () => api<Upcoming>(`${path}/upcoming`),
    enabled: Boolean(schoolId),
  });
}

type Row =
  | { kind: 'holiday'; date: string; name: string; id: string | null; source: 'official' | 'school' }
  | { kind: 'half'; date: string; name: string }
  | { kind: 'bridge'; date: string; near: string };

const dateText = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

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
    ...(list.data?.holidays ?? []).map((h) => ({ kind: 'holiday' as const, ...h })),
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
                <p className="text-sm text-slate-500">Önümüzdeki 5 ay</p>
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
                    <span className="w-44 shrink-0 text-sm font-medium text-slate-700">{dateText(r.date)}</span>
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      {r.kind === 'bridge' ? <span className="text-slate-600">{r.near} tatiline bitişik</span> : r.name}
                    </span>
                    {r.kind === 'holiday' && <Badge tone={r.source === 'school' ? 'blue' : 'red'}>{r.source === 'school' ? 'Okulun tatili' : 'Tatil'}</Badge>}
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

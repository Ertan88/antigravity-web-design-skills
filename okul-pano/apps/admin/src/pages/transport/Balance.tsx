import { isHalfDayHoliday } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Scale } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Alert, Badge, Button, Card, Modal, Select } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';
import { monthLabel, schoolDays, type Holiday } from '../duties/calendar.tsx';

export interface TransportStat {
  id: string;
  fullName: string;
  isActive: boolean;
  /** Seçilen aydaki nöbet sayısı */
  month: number;
  /** Eğitim yılı başından ayın sonuna kadar */
  total: number;
  last: string | null;
}

export interface TransportStats {
  from: string;
  to: string;
  teachers: TransportStat[];
  average: number;
  min: number;
  max: number;
}

/** Eğitim yılı boyunca kim kaç servis nöbeti tuttu (seçilen ayın sonuna kadar) */
export function useTransportStats(month: string) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('transport-duties');
  return useQuery({
    queryKey: [schoolId, 'transport-duties', 'stats', month],
    queryFn: () => api<TransportStats>(`${path}/stats?month=${month}`),
    enabled: Boolean(schoolId),
  });
}

const schoolYearLabel = (from: string) => {
  const y = Number(from.slice(0, 4));
  return `${y}-${y + 1} eğitim yılı`;
};
const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/**
 * Nöbet dengesi: aylık sayılar tek başına adaleti göstermez (bu ay 1, geçen ay 3 tutan olabilir).
 * Eğitim yılı toplamı ve ortalamaya göre fark gösterilir; bir sonraki ay az tutanlara öncelik verilir.
 */
export function BalanceCard({ month, stats }: { month: string; stats: TransportStats | undefined }) {
  const list = (stats?.teachers ?? []).filter((t) => t.isActive);
  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <Scale className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">Nöbet dengesi · {stats ? schoolYearLabel(stats.from) : ''}</h2>
            <p className="text-xs text-slate-500">
              Eylülden {monthLabel(month)} sonuna kadar tutulan servis nöbetleri. Ortalamanın altında kalanlar önce görevlendirilmeli.
            </p>
          </div>
        </div>
        {list.length > 0 && stats && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="slate">Ortalama {fmt(stats.average)}</Badge>
            <Badge tone={stats.max - stats.min > 1 ? 'amber' : 'green'}>
              En az {stats.min} · en çok {stats.max}
            </Badge>
          </div>
        )}
      </div>
      {list.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-5 py-2">Öğretmen</th>
                <th className="px-3 py-2 text-right">{monthLabel(month)}</th>
                <th className="px-3 py-2 text-right">Yıl toplamı</th>
                <th className="w-1/3 px-5 py-2">Ortalamaya göre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((t) => {
                const diff = t.total - (stats?.average ?? 0);
                const width = stats?.max ? (t.total / stats.max) * 100 : 0;
                return (
                  <tr key={t.id}>
                    <td className="px-5 py-2 font-medium text-ink">{t.fullName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{t.month}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{t.total}</td>
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={clsx('h-full rounded-full', diff <= -1 ? 'bg-sky-400' : diff >= 1 ? 'bg-amber-500' : 'bg-emerald-500')}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span
                          className={clsx(
                            'w-24 text-right text-xs font-semibold tabular-nums',
                            diff <= -1 ? 'text-sky-700' : diff >= 1 ? 'text-amber-700' : 'text-emerald-700',
                          )}
                        >
                          {Math.abs(diff) < 1 ? 'dengede' : diff < 0 ? `${fmt(-diff)} eksik` : `${fmt(diff)} fazla`}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-slate-500">Bu eğitim yılında henüz servis nöbeti yazılmamış.</p>
      )}
    </Card>
  );
}

/**
 * Adil dağıt: ayın boş ya da eksik iş günleri, eğitim yılında en az nöbet tutandan başlanarak doldurulur.
 * Dolu günlere ve tatillere dokunulmaz; sonuç takvimde elle değiştirilebilir.
 */
export function AutoFillDialog({
  open,
  onClose,
  month,
  stats,
  teachers,
  assigned,
  holidays,
}: {
  open: boolean;
  onClose: () => void;
  month: string;
  stats: TransportStats | undefined;
  teachers: { id: string; fullName: string }[];
  /** Tarih -> o günün görevli sayısı */
  assigned: Map<string, number>;
  holidays: Map<string, Holiday>;
}) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('transport-duties');
  const qc = useQueryClient();
  const toast = useToast();
  const [perDay, setPerDay] = useState(2);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = new Map((stats?.teachers ?? []).map((t) => [t.id, t.total]));
  // Varsayılan havuz: bu eğitim yılında servis nöbeti tutmuş öğretmenler
  const served = teachers.filter((t) => (total.get(t.id) ?? 0) > 0).map((t) => t.id);

  useEffect(() => {
    if (open) {
      setSelected(new Set(served));
      setError(null);
    }
    // Yalnızca açılışta varsayılan havuz kurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const workdays = schoolDays(month).filter((d) => {
    const h = holidays.get(d.iso);
    return !h || isHalfDayHoliday(h.name);
  });
  const missing = workdays.filter((d) => (assigned.get(d.iso) ?? 0) < perDay);
  // Bu yıl görev alanlar üstte (az tutandan çoğa), sonra diğerleri alfabetik; liste açılışta sabit kalır
  const sorted = [...teachers].sort(
    (a, b) =>
      Number(!served.includes(a.id)) - Number(!served.includes(b.id)) ||
      (total.get(a.id) ?? 0) - (total.get(b.id) ?? 0) ||
      a.fullName.localeCompare(b.fullName, 'tr'),
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ days: number; assignments: number }>(`${path}/auto-fill`, {
        method: 'POST',
        body: { month, perDay, teacherIds: [...selected] },
      });
      await qc.invalidateQueries({ queryKey: [schoolId, 'transport-duties'] });
      toast.success(res.days ? `${res.days} gün dolduruldu (${res.assignments} görev). Takvimde değiştirebilirsiniz.` : 'Doldurulacak boş gün yok');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dağıtılamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${monthLabel(month)} · adil dağıt`}
      description="Boş günler, bu eğitim yılında en az nöbet tutandan başlanarak doldurulur. Dolu günlere ve tatillere dokunulmaz."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} disabled={!missing.length || selected.size < perDay} onClick={() => void run()}>
            {missing.length ? `${missing.length} günü doldur` : 'Boş gün yok'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="per-day" className="font-medium text-slate-700">
            Günde görevli
          </label>
          <Select id="per-day" className="w-24" value={perDay} onChange={(e) => setPerDay(Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <span className="text-slate-500">
            {workdays.length} iş günü · {missing.length} gün eksik
          </span>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">Dağıtıma katılacak öğretmenler ({selected.size})</span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(served))}>
                Bu yıl görev alanlar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Temizle
              </Button>
            </span>
          </div>
          <div className="grid max-h-72 gap-1 overflow-auto rounded-xl p-1 ring-1 ring-slate-200 sm:grid-cols-2">
            {sorted.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="size-4 accent-brand-600" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                <span className="min-w-0 flex-1 truncate text-ink">{t.fullName}</span>
                <span className="text-xs tabular-nums text-slate-400">{total.get(t.id) ?? 0} nöbet</span>
              </label>
            ))}
          </div>
          {!served.length && <p className="mt-2 text-xs text-slate-500">Bu yıl henüz servis nöbeti yok; görev alacak öğretmenleri işaretleyin.</p>}
        </div>
      </div>
    </Modal>
  );
}

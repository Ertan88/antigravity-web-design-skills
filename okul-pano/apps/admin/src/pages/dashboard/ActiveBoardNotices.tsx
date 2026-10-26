import { dayPlanLabel, type DayPlan } from '@okulpano/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCog, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/Toast.tsx';
import { Button } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchoolPath } from '../../lib/data.ts';

interface Flash {
  id: string;
  text: string;
  endsAt: string;
}

const timeOf = (iso: string) => new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Panoda o an yayında olan anlık mesaj ya da normal dışı gün modu (mobil uygulamadan verilmiş olabilir).
 * Yalnızca varsa görünür ve tek dokunuşla kaldırılır.
 */
export function ActiveBoardNotices() {
  const { schoolId, can } = useAuth();
  const flashPath = useSchoolPath('flash');
  const planPath = useSchoolPath('day-plan');
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const canFlash = can('board.control');
  const canPlan = can('schedule.manage');

  const flash = useQuery({
    queryKey: [schoolId, 'flash'],
    queryFn: () => api<{ active: Flash[] }>(flashPath),
    enabled: canFlash,
    refetchInterval: 30_000,
  });
  const plan = useQuery({ queryKey: [schoolId, 'day-plan'], queryFn: () => api<DayPlan>(planPath), enabled: canPlan });

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      await Promise.all(['flash', 'day-plan'].map((k) => qc.invalidateQueries({ queryKey: [schoolId, k] })));
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Yapılamadı');
    } finally {
      setBusy(false);
    }
  };

  const active = flash.data?.active ?? [];
  const label = plan.data ? dayPlanLabel(plan.data) : null;
  if (!active.length && !label) return null;

  return (
    <div className="space-y-2">
      {active.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200">
          <Megaphone className="size-4 shrink-0 text-amber-700" />
          <span className="min-w-0 flex-1 text-amber-950">
            Panoda yayında: <span className="font-semibold">{f.text}</span>
            <span className="text-amber-700"> · bitiş: {timeOf(f.endsAt)}</span>
          </span>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => api(`${flashPath}/${f.id}`, { method: 'DELETE' }), 'Mesaj panolardan kaldırıldı')}>
            Kaldır
          </Button>
        </div>
      ))}
      {label && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm ring-1 ring-sky-200">
          <CalendarCog className="size-4 shrink-0 text-sky-700" />
          <span className="min-w-0 flex-1 text-sky-950">
            Bugünün modu: <span className="font-semibold">{label}</span>
            <span className="text-sky-700"> · yarın kendiliğinden normale döner</span>
          </span>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => api(planPath, { method: 'DELETE' }), 'Gün normale döndü')}>
            Normale döndür
          </Button>
        </div>
      )}
    </div>
  );
}

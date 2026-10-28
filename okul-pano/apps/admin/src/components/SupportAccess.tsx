import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../lib/data.ts';
import { formatDateTime } from '../lib/format.ts';
import { useToast } from './Toast.tsx';
import { Badge, Button, Card } from './ui.tsx';

/**
 * KVKK: platform desteği okulun verilerini (öğretmen, öğrenci, nöbet…) varsayılan olarak göremez. Yardım gerektiğinde
 * okul yöneticisi süreli erişim verir; süre dolunca kendiliğinden kapanır, yapılan işlemler Etkinlik Geçmişi'ne düşer.
 */
export function SupportAccessCard() {
  const { schoolId, me } = useAuth();
  const school = useSchool();
  const path = useSchoolPath('support-access');
  const qc = useQueryClient();
  const toast = useToast();
  const set = useMutation({
    mutationFn: (hours: 0 | 24 | 168) => api<School>(path, { method: 'POST', body: { hours } }),
    onSuccess: (data, hours) => {
      qc.setQueryData([schoolId, 'school'], data);
      toast.success(hours ? 'Platform desteğine süreli erişim verildi' : 'Platform desteğinin erişimi kapatıldı');
    },
    onError: (e) => toast.error(e.message),
  });
  // Platform yöneticisi kendi kendine erişim vermez
  if (!school.data || me?.user.isSuperAdmin) return null;
  const until = school.data.supportAccessUntil;
  const open = Boolean(until && Date.parse(until) > Date.now());
  return (
    <Card className="mt-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div className="flex gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          {open ? <LifeBuoy className="size-5" /> : <ShieldCheck className="size-5" />}
        </span>
        <div>
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            Destek erişimi
            {open ? <Badge tone="green">Açık · {formatDateTime(until)} tarihine kadar</Badge> : <Badge>Kapalı</Badge>}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Okulunuzun verilerini platform desteği göremez. Yardım istediğinizde süreli erişim verin; süre dolunca kendiliğinden kapanır. Destek
            sırasında yapılan işlemler Etkinlik Geçmişi'nde görünür.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {open ? (
          <Button variant="secondary" loading={set.isPending} onClick={() => set.mutate(0)}>
            Erişimi kapat
          </Button>
        ) : (
          <>
            <Button variant="secondary" loading={set.isPending && set.variables === 24} onClick={() => set.mutate(24)}>
              24 saat erişim ver
            </Button>
            <Button variant="secondary" loading={set.isPending && set.variables === 168} onClick={() => set.mutate(168)}>
              7 gün erişim ver
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

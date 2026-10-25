import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toast.tsx';
import { Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../../lib/data.ts';

/** Taşımalı eğitim modülü: nöbet çizelgesiyle ilgili olduğu için burada açılıp kapanır */
export function TransportToggle() {
  const { can, schoolId, reloadMe } = useAuth();
  const school = useSchool();
  const path = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (hasTransport: boolean) => api<School>(path, { method: 'PATCH', body: { settings: { hasTransport } } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      void reloadMe();
      toast.success(data.settings.hasTransport ? 'Taşımalı eğitim açıldı: menüde Taşımalı Eğitim sayfası çıktı' : 'Taşımalı eğitim kapatıldı');
    },
    onError: (e) => toast.error(e.message),
  });
  if (!school.data || !can('settings.manage')) return null;
  const on = school.data.settings.hasTransport;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50/60 px-4 py-3 ring-1 ring-amber-200/70">
      <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500 text-white">
        <Bus className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <Toggle
          checked={on}
          onChange={(x) => save.mutate(x)}
          label="Taşımalı eğitim (servisle gelen öğrenciler)"
          description="Açıkken o günün taşıma ve öğle yemeği nöbetçileri panoda nöbet kartında görünür; resmî ve dini tatillerde görevli yazılmaz."
        />
      </div>
      {on && (
        <Link to="/tasimali" className="text-sm font-semibold text-amber-800 hover:underline">
          Taşımalı Eğitim çizelgesi →
        </Link>
      )}
    </div>
  );
}

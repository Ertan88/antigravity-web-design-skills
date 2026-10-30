import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bus } from 'lucide-react';
import { useToast } from '../../components/Toast.tsx';
import { Button, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../../lib/data.ts';

/**
 * Taşımalı eğitim modülünü açıp kapatır (Nöbet Çizelgesi › Taşımalı eğitim sekmesi). Kapalıyken düğme,
 * açıkken sekmenin başlığında küçük bir anahtar olarak görünür.
 */
export function TransportSwitch({ label, compact }: { label: string; compact?: boolean }) {
  const { schoolId, reloadMe } = useAuth();
  const school = useSchool();
  const path = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (hasTransport: boolean) => api<School>(path, { method: 'PATCH', body: { settings: { hasTransport } } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      void reloadMe();
      toast.success(data.settings.hasTransport ? 'Taşımalı eğitim açıldı; görevliler panoda nöbet kartında görünür' : 'Taşımalı eğitim kapatıldı');
    },
    onError: (e) => toast.error(e.message),
  });
  if (!school.data) return null;
  const on = school.data.settings.hasTransport;
  if (!compact) {
    return (
      <Button icon={<Bus className="size-4" />} loading={save.isPending} onClick={() => save.mutate(!on)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="rounded-xl bg-surface px-2.5 py-1 ring-1 ring-amber-200" title="Kapatınca görevliler panoda gösterilmez">
      <Toggle checked={on} onChange={(x) => save.mutate(x)} label={label} />
    </div>
  );
}

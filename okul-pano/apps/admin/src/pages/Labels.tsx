import { LABEL_KEYS, LABELS, type LabelKey, type Labels as LabelMap } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SaveBar } from '../components/SaveBar.tsx';
import { useToast } from '../components/Toast.tsx';
import { Card, IconButton, Input, PageHeader, Spinner } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../lib/data.ts';

/**
 * Başlıklar: okul, kart ve sekme adlarını kendi kullandığı adlarla değiştirir (ör. "Servis Nöbetçileri").
 * Boş bırakılan başlık varsayılanı kullanır. Yetki: okul sahibi / yönetici ve "Başlıkları düzenleme" verilenler.
 */
export function Labels() {
  const { schoolId } = useAuth();
  const school = useSchool();
  const path = useSchoolPath('labels');
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<LabelMap | null>(null);
  useEffect(() => {
    if (school.data) setV(school.data.settings.labels ?? {});
  }, [school.data]);
  const save = useMutation({
    mutationFn: (labels: LabelMap) => api<School>(path, { method: 'PUT', body: { labels } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      toast.success('Başlıklar kaydedildi; panolar güncelleniyor');
    },
    onError: (e) => toast.error(e.message),
  });
  if (!school.data || !v) return <Spinner />;
  const saved = school.data.settings.labels ?? {};
  const norm = (m: LabelMap) => JSON.stringify(LABEL_KEYS.map((k) => m[k]?.trim() ?? ''));
  const dirty = norm(v) !== norm(saved);
  const set = (k: LabelKey, text: string) => setV({ ...v, [k]: text });

  return (
    <div>
      <PageHeader
        title="Başlıklar"
        description="Panodaki kartların ve paneldeki sekmelerin adlarını okulunuzda kullanılan adlarla değiştirin. Boş bıraktığınız başlık varsayılan adla görünür."
      />
      <Card className="divide-y divide-slate-100">
        {LABEL_KEYS.map((k) => {
          const id = `label-${k}`;
          const custom = Boolean(v[k]?.trim());
          return (
            <div key={k} className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:items-center md:gap-6">
              <div className="min-w-0">
                <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Type className="size-4 shrink-0 text-slate-400" />
                  {LABELS[k].default}
                </label>
                <p className="mt-0.5 text-xs text-slate-500">{LABELS[k].where}</p>
              </div>
              <div className="flex items-center gap-2">
                <Input id={id} value={v[k] ?? ''} maxLength={60} placeholder={LABELS[k].default} onChange={(e) => set(k, e.target.value)} />
                <IconButton label="Varsayılana döndür" disabled={!custom} onClick={() => set(k, '')}>
                  <RotateCcw className="size-4" />
                </IconButton>
              </div>
            </div>
          );
        })}
        <SaveBar show={dirty} saving={save.isPending} onSave={() => save.mutate(v)} onCancel={() => setV(saved)} />
      </Card>
    </div>
  );
}

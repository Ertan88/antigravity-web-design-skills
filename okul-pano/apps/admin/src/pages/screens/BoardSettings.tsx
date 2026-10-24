import { resolveLayout, type BoardLayout, type SchoolSettings } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutEditor } from '../../components/LayoutEditor.tsx';
import { useToast } from '../../components/Toast.tsx';
import { Button, Card, Field, Input, Segmented, Select, Spinner, Toggle } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../../lib/data.ts';

/** Okulun panolarda kullandığı renk önerileri (kurumsal, sade) */
const PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: 'Petrol', primary: '#1f8bad', accent: '#f59e0b' },
  { name: 'Lacivert', primary: '#1e4f91', accent: '#f2a900' },
  { name: 'Zümrüt', primary: '#0f8a6a', accent: '#f59e0b' },
  { name: 'Bordo', primary: '#9f1d35', accent: '#d4a017' },
  { name: 'Turuncu', primary: '#d9640e', accent: '#0f8a6a' },
];

function useSaveSettings() {
  const { schoolId, reloadMe } = useAuth();
  const path = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (settings: SchoolSettings) => api<School>(path, { method: 'PATCH', body: { settings } }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      void reloadMe();
      toast.success('Kaydedildi; panolar güncelleniyor');
    },
    onError: (e) => toast.error(e.message),
  });
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="grid gap-6 border-b border-slate-100 py-7 first:pt-0 last:border-0 last:pb-0 md:grid-cols-[240px_1fr]">
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

/** Okulun varsayılan pano düzeni: özel düzeni olmayan tüm panolar bunu kullanır */
export function DefaultLayout({ editable }: { editable: boolean }) {
  const school = useSchool();
  const save = useSaveSettings();
  const [layout, setLayout] = useState<BoardLayout | null>(null);
  useEffect(() => {
    if (school.data) setLayout(resolveLayout(school.data.settings));
  }, [school.data]);
  if (!school.data || !layout) return <Spinner />;
  const saved = JSON.stringify(resolveLayout(school.data.settings));
  const dirty = JSON.stringify(layout) !== saved;
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Okulun varsayılan pano düzeni</h2>
          <p className="text-sm text-slate-500">
            Kartları sürükleyerek sütunlar arasında taşıyın ve sıralayın. Panolar sekmesinden bir panoya özel düzen de verebilirsiniz.
          </p>
        </div>
        {editable && (
          <div className="flex gap-2">
            {dirty && (
              <Button variant="secondary" onClick={() => setLayout(JSON.parse(saved) as BoardLayout)}>
                Geri al
              </Button>
            )}
            <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ ...school.data!.settings, layout })}>
              Düzeni kaydet
            </Button>
          </div>
        )}
      </div>
      <LayoutEditor value={layout} onChange={setLayout} disabled={!editable} />
    </Card>
  );
}

/** Panoların görünümü ve akışı (önceden Okul Ayarları'ndaydı) */
export function Appearance({ editable }: { editable: boolean }) {
  const school = useSchool();
  const save = useSaveSettings();
  const [s, setS] = useState<SchoolSettings | null>(null);
  useEffect(() => {
    if (school.data) setS(school.data.settings);
  }, [school.data]);
  if (!school.data || !s) return <Spinner />;
  const set = <K extends keyof SchoolSettings>(k: K, v: SchoolSettings[K]) => setS({ ...s, [k]: v });
  const dirty = JSON.stringify(s) !== JSON.stringify(school.data.settings);

  return (
    <Card className="p-5 sm:p-7">
      <Section title="Görünüm" description="Okulunuzun renkleriyle uyumlu, sade bir pano.">
        <Field label="Tema">
          {() => (
            <Segmented
              value={s.theme}
              onChange={(x) => set('theme', x)}
              options={[
                { value: 'dark', label: 'Koyu (önerilen)' },
                { value: 'light', label: 'Açık' },
              ]}
            />
          )}
        </Field>
        <Field label="Hazır renkler">
          {() => (
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  disabled={!editable}
                  onClick={() => setS({ ...s, primaryColor: p.primary, accentColor: p.accent })}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:ring-slate-300"
                >
                  <span className="flex">
                    <span className="size-4 rounded-full ring-2 ring-surface" style={{ background: p.primary }} />
                    <span className="-ml-1.5 size-4 rounded-full ring-2 ring-surface" style={{ background: p.accent }} />
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['primaryColor', 'accentColor'] as const).map((k) => (
            <Field key={k} label={k === 'primaryColor' ? 'Ana renk' : 'Vurgu rengi'}>
              {(id) => (
                <div className="flex items-center gap-2">
                  <input id={id} type="color" value={s[k]} disabled={!editable} onChange={(e) => set(k, e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border-0 bg-transparent" />
                  <Input value={s[k]} disabled={!editable} onChange={(e) => set(k, e.target.value)} className="font-mono" aria-label={`${k} kodu`} />
                </div>
              )}
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Akış" description="Slayt, kayan yazı ve zil sayacı.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Slayt süresi (sn)" help="Süresi girilmemiş duyurular için">
            {(id) => <Input id={id} type="number" min={3} max={300} disabled={!editable} value={s.slideDurationSec} onChange={(e) => set('slideDurationSec', Number(e.target.value))} />}
          </Field>
          <Field label="Kayan yazı hızı">
            {(id) => (
              <Select id={id} value={s.tickerSpeed} disabled={!editable} onChange={(e) => set('tickerSpeed', Number(e.target.value))}>
                <option value={60}>Yavaş</option>
                <option value={90}>Normal</option>
                <option value={130}>Hızlı</option>
              </Select>
            )}
          </Field>
          <Field label="Öğle arası eşiği (dk)" help="Bundan uzun aralar 'Öğle Arası' yazar">
            {(id) => <Input id={id} type="number" min={10} max={180} disabled={!editable} value={s.lunchThresholdMin} onChange={(e) => set('lunchThresholdMin', Number(e.target.value))} />}
          </Field>
        </div>
        <Toggle checked={s.videoSound} onChange={(x) => set('videoSound', x)} label="Videoları sesli oynat" description="Tarayıcıda otomatik oynatma izni gerekir (aşağıdaki kiosk komutu)." />
      </Section>

      <Section title="Doğum günleri" description="Panoda öğrenci adlarının gösterimi.">
        <Segmented
          value={s.birthdayNameFormat}
          onChange={(x) => set('birthdayNameFormat', x)}
          options={[
            { value: 'initial', label: 'Ayşe Y. (önerilen)' },
            { value: 'full', label: 'Ayşe Yılmaz' },
          ]}
        />
      </Section>

      {editable && (
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-5">
          {dirty && (
            <Button variant="secondary" onClick={() => setS(school.data!.settings)}>
              Geri al
            </Button>
          )}
          <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(s)}>
            Kaydet
          </Button>
        </div>
      )}
    </Card>
  );
}

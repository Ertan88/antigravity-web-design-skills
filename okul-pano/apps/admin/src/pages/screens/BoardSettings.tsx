import { resolveLayout, SPECIAL_THEMES, type BoardLayout, type SchoolSettings } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutEditor } from '../../components/LayoutEditor.tsx';
import { SaveBar } from '../../components/SaveBar.tsx';
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
            Kartları sürükleyerek sütunlar arasında taşıyın ve sıralayın. Özel düzeni olmayan tüm panolar bunu kullanır; bir panoya özel düzen vermek için Panolar sekmesinde o panonun kartındaki "Düzenle"yi kullanın.
          </p>
        </div>
      </div>
      <LayoutEditor value={layout} onChange={setLayout} disabled={!editable} />
      <SaveBar
        show={editable && dirty}
        saving={save.isPending}
        onSave={() => save.mutate({ ...school.data!.settings, layout })}
        onCancel={() => setLayout(JSON.parse(saved) as BoardLayout)}
      />
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
                  onClick={() => setS({ ...s, primaryColor: p.primary, accentColor: p.accent, specialTheme: null })}
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
                  <input id={id} type="color" value={s[k]} disabled={!editable} onChange={(e) => setS({ ...s, [k]: e.target.value, specialTheme: null })} className="h-10 w-14 cursor-pointer rounded-lg border-0 bg-transparent" />
                  <Input value={s[k]} disabled={!editable} onChange={(e) => setS({ ...s, [k]: e.target.value, specialTheme: null })} className="font-mono" aria-label={`${k} kodu`} />
                </div>
              )}
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Özel gün temaları" description="Millî bayramlarda, 10 Kasım'da, Öğretmenler Günü'nde ve dini bayramlarda panonun havası değişsin.">
        <Toggle
          checked={s.autoSpecialThemes}
          onChange={(x) => set('autoSpecialThemes', x)}
          label="Özel günlerde temayı kendiliğinden uygula"
          description="O gün bitince pano kendi renklerine döner. Üst barın ortasında ve zeminde o güne uygun filigran (Türk bayrağı, hilal, kep…) çıkar; 10 Kasım'da yas görünümü eklenir. 'Şimdi uygula' ile seçtiğiniz tema da filigranıyla gelir."
        />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {SPECIAL_THEMES.map((t) => {
            const applied = s.specialTheme === t.id && s.primaryColor === t.primary && s.accentColor === t.accent;
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-slate-200">
                <span
                  className="relative size-11 shrink-0 overflow-hidden rounded-xl shadow-inner"
                  style={{ background: `linear-gradient(135deg, ${t.primary} 0 60%, ${t.accent} 60% 100%)` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-tight font-semibold text-ink">{t.name}</span>
                  <span className="block text-xs leading-tight text-slate-500">{t.when}</span>
                </span>
                <button
                  type="button"
                  disabled={!editable || applied}
                  // Renklerle birlikte o günün filigranı da (bayrak, hilal…) panoya gelir
                  onClick={() => setS({ ...s, primaryColor: t.primary, accentColor: t.accent, specialTheme: t.id })}
                  className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50 disabled:text-slate-400 disabled:ring-slate-200 disabled:hover:bg-transparent"
                >
                  {applied ? 'Seçili' : 'Şimdi uygula'}
                </button>
              </div>
            );
          })}
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
        <Toggle
          checked={s.showEmptyCards}
          onChange={(x) => set('showEmptyCards', x)}
          label="Boş kartları da göster"
          description="Düzende olan kart o gün içeriksizse (izinli yok, doğum günü yok…) kısa bir notla görünür. Kapalıyken o gün panoda hiç yer almaz."
        />
        <Toggle
          checked={s.showAirQuality}
          onChange={(x) => set('showAirQuality', x)}
          label="Hava kalitesi ve hava durumu uyarısı"
          description="Üst barda hava durumunun altında hava kalitesi; yoğun kar, aşırı sıcak gibi bir uyarı varsa onun yerine uyarı görünür."
        />
        <Toggle
          checked={s.animations}
          onChange={(x) => set('animations', x)}
          label="Geçiş animasyonları"
          description="Kartlar yumuşakça belirir, zil çalmadan önceki son dakikada sayaç nabız gibi atar. Eski / yavaş cihazlarda kapatabilirsiniz."
        />
        <Toggle checked={s.videoSound} onChange={(x) => set('videoSound', x)} label="Videoları sesli oynat" description="Tarayıcıda otomatik oynatma izni gerekir (aşağıdaki kiosk komutu)." />
      </Section>

      <Section title="Gece ve hafta sonu modu" description="Ders dışı saatlerde pano kararır ya da ekran koruyucuya geçer: elektrik tasarrufu, daha uzun ekran ömrü.">
        <Field label="Ders dışı saatlerde">
          {() => (
            <Segmented
              value={s.sleepMode}
              onChange={(x) => set('sleepMode', x)}
              options={[
                { value: 'off', label: 'Pano açık kalsın' },
                { value: 'screensaver', label: 'Ekran koruyucu' },
                { value: 'dim', label: 'Karart' },
              ]}
            />
          )}
        </Field>
        {s.sleepMode !== 'off' && (
          <>
            <p className="text-sm text-slate-500">
              {s.sleepMode === 'screensaver'
                ? 'Siyah zeminde büyük saat, tarih ve okul adı görünür; ekranda iz kalmasın diye her dakika yer değiştirir.'
                : 'Pano görünmeye devam eder ama çok koyulaşır.'}{' '}
              Saatler o günün zil çizelgesinden hesaplanır; zil çizelgesi olmayan iş günlerinde pano hiç uyumaz.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="İlk dersten kaç dakika önce açılsın">
                {(id) => <Input id={id} type="number" min={0} max={240} disabled={!editable} value={s.sleepBeforeMin} onChange={(e) => set('sleepBeforeMin', Number(e.target.value))} />}
              </Field>
              <Field label="Son dersten kaç dakika sonra uyusun">
                {(id) => <Input id={id} type="number" min={0} max={240} disabled={!editable} value={s.sleepAfterMin} onChange={(e) => set('sleepAfterMin', Number(e.target.value))} />}
              </Field>
            </div>
            <Toggle checked={s.sleepOffDays} onChange={(x) => set('sleepOffDays', x)} label="Hafta sonu ve tatil günlerinde gün boyu uyusun" />
          </>
        )}
      </Section>

      <Section title="Erişilebilirlik" description="Uzaktan ve zayıf görenler için daha kolay okunan pano.">
        <Field label="Yazı boyutu">
          {() => (
            <Segmented
              value={s.textSize}
              onChange={(x) => set('textSize', x)}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'large', label: 'Büyük' },
              ]}
            />
          )}
        </Field>
        <Toggle
          checked={s.highContrast}
          onChange={(x) => set('highContrast', x)}
          label="Yüksek kontrast"
          description="Düz siyah (ya da beyaz) zemin, keskin kenarlıklar, filigran ve renk geçişleri yok."
        />
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

      <SaveBar show={editable && dirty} saving={save.isPending} onSave={() => save.mutate(s)} onCancel={() => setS(school.data!.settings)} />
    </Card>
  );
}

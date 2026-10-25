import { SCHOOL_TYPES, splitSchoolName, updateSchoolSchema, type SchoolSettings } from '@okulpano/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ImageUpload } from '../components/ImageUpload.tsx';
import { SaveBar } from '../components/SaveBar.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Button, Card, Field, Input, PageHeader, Spinner, Toggle } from '../components/ui.tsx';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useSchool, useSchoolPath, type School } from '../lib/data.ts';
import { useForm } from '../lib/form.ts';

interface GeoResult {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

type Form = {
  name: string;
  logoUrl: string | null;
  city: string;
  latitude: string;
  longitude: string;
  timezone: string;
  settings: SchoolSettings;
};

const EMPTY: Form = { name: '', logoUrl: null, city: '', latitude: '', longitude: '', timezone: 'Europe/Istanbul', settings: {} as SchoolSettings };

const toForm = (s: School): Form => ({
  name: s.name,
  logoUrl: s.logoUrl,
  city: s.city ?? '',
  latitude: s.latitude?.toString() ?? '',
  longitude: s.longitude?.toString() ?? '',
  timezone: s.timezone,
  settings: s.settings,
});

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="grid gap-6 border-b border-slate-100 py-8 first:pt-0 last:border-0 md:grid-cols-[260px_1fr]">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function CitySearch({ onPick }: { onPick: (r: GeoResult) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await api<GeoResult[]>(`/api/geocode?q=${encodeURIComponent(q.trim())}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arama başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="İlçe ya da il adı yazın (ör. Çankaya)"
          aria-label="Konum ara"
        />
        <Button variant="secondary" loading={busy} icon={<Search className="size-4" />} onClick={() => void search()}>
          Ara
        </Button>
      </div>
      {error && <p className="text-xs font-medium text-amber-700">{error}</p>}
      {results && (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Sonuç bulunamadı.</li>}
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onPick(r);
                  setResults(null);
                  setQ('');
                }}
              >
                <MapPin className="size-4 text-slate-400" />
                <span className="font-medium">{r.name}</span>
                <span className="text-slate-500">{[r.region, r.country].filter(Boolean).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Settings() {
  const { schoolId, reloadMe } = useAuth();
  const path = useSchoolPath();
  const qc = useQueryClient();
  const toast = useToast();
  const school = useSchool();
  const form = useForm<Form>(EMPTY);
  const [ready, setReady] = useState(false);
  const v = form.values;

  useEffect(() => {
    if (!school.data) return;
    form.reset(toForm(school.data));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school.data]);

  const save = useMutation({
    mutationFn: (body: unknown) => api<School>(path, { method: 'PATCH', body }),
    onSuccess: (data) => {
      qc.setQueryData([schoolId, 'school'], data);
      void reloadMe();
      toast.success('Ayarlar kaydedildi; ekranlar güncelleniyor');
    },
  });

  if (!ready) return <Spinner />;

  const set = form.set;
  const setting = <K extends keyof SchoolSettings>(k: K, value: SchoolSettings[K]) => set('settings', { ...v.settings, [k]: value });

  const submit = async () => {
    const payload = form.validate(updateSchoolSchema, {
      name: v.name,
      logoUrl: v.logoUrl,
      city: v.city || null,
      latitude: v.latitude ? Number(v.latitude) : null,
      longitude: v.longitude ? Number(v.longitude) : null,
      timezone: v.timezone,
      settings: v.settings,
    });
    if (!payload) return;
    try {
      await save.mutateAsync(payload);
    } catch (err) {
      form.fail(err);
    }
  };

  const s = v.settings;
  const dirty = Boolean(school.data) && JSON.stringify(v) !== JSON.stringify(toForm(school.data!));
  return (
    <div>
      <PageHeader title="Genel Ayarlar" description="Okul bilgileri, konum ve modüller. Panoların görünümü ve düzeni Panolar sayfasında." />
      {form.errors._form && (
        <div className="mb-4">
          <Alert tone="red">{form.errors._form}</Alert>
        </div>
      )}
      <Card className="p-6 sm:p-8">
        <Section title="Okul bilgileri" description="Panonun sol üstünde logo ile birlikte okul adı (kalın) ve altında okul türü görünür.">
          <Field label="Okul adı" error={form.errors.name}>
            {(id) => <Input id={id} value={v.name} onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <Field
            label="Okul türü (ikinci satır)"
            help={
              splitSchoolName(v.name).type
                ? `Boş bırakılırsa addan ayrılır: "${splitSchoolName(v.name).type}". Yalnızca farklı göstermek isterseniz doldurun.`
                : 'Listeden seçin ya da yazın. Panonun üst barında, ekran koruyucuda ve hazır şablonlarda okul adının altında görünür.'
            }
            error={!v.settings.schoolType?.trim() && !splitSchoolName(v.name).type ? 'Okul türü boş: panoda okul adının altı boş kalıyor.' : undefined}
          >
            {(id) => (
              <>
                <Input
                  id={id}
                  list="school-types"
                  value={v.settings.schoolType ?? ''}
                  onChange={(e) => setting('schoolType', e.target.value)}
                  placeholder={splitSchoolName(v.name).type ?? 'ör. Mesleki ve Teknik Anadolu Lisesi'}
                />
                <datalist id="school-types">
                  {SCHOOL_TYPES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Logo" help="Şeffaf arka planlı PNG önerilir.">
            {() => (
              <div className="max-w-xs">
                <ImageUpload value={v.logoUrl} onChange={(url) => set('logoUrl', url)} aspect="aspect-[3/2]" hint="PNG · kare ya da yatay" />
              </div>
            )}
          </Field>
        </Section>

        <Section title="Konum ve hava durumu" description="Hava durumu bu konuma göre 15 dakikada bir güncellenir.">
          <CitySearch
            onPick={(r) => {
              form.reset({ ...v, city: r.name, latitude: r.latitude.toFixed(4), longitude: r.longitude.toFixed(4), timezone: r.timezone ?? v.timezone });
            }}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Panoda görünen yer adı" error={form.errors.city}>
              {(id) => <Input id={id} value={v.city} onChange={(e) => set('city', e.target.value)} />}
            </Field>
            <Field label="Enlem" error={form.errors.latitude}>
              {(id) => <Input id={id} inputMode="decimal" value={v.latitude} onChange={(e) => set('latitude', e.target.value)} placeholder="39.9334" />}
            </Field>
            <Field label="Boylam" error={form.errors.longitude}>
              {(id) => <Input id={id} inputMode="decimal" value={v.longitude} onChange={(e) => set('longitude', e.target.value)} placeholder="32.8597" />}
            </Field>
          </div>
          <Field label="Saat dilimi" error={form.errors.timezone} help="Zil sayacı ve tarih bu saat dilimine göre hesaplanır; cihaz saati yanlış olsa da pano doğru çalışır.">
            {(id) => <Input id={id} value={v.timezone} onChange={(e) => set('timezone', e.target.value)} />}
          </Field>
        </Section>

        <Section title="Modüller" description="Okulunuzda kullanılan isteğe bağlı bölümler.">
          <p className="text-sm text-slate-500">
            Taşımalı eğitim (servis) modülü{' '}
            <Link to="/nobet" className="font-semibold text-brand-700 hover:underline">
              Nöbet Çizelgesi
            </Link>{' '}
            sayfasından açılır.
          </p>
          <Toggle
            checked={s.requireApproval}
            onChange={(x) => setting('requireApproval', x)}
            label="Duyurular onaydan sonra yayınlansın"
            description="Açıkken 'Duyuruları onaylama' yetkisi olmayan kullanıcıların (ör. öğretmenler) eklediği ya da değiştirdiği duyurular, okul sahibi, yöneticiler veya bu yetkiyi verdiğiniz kişiler (ör. müdür yardımcısı) onaylayınca panoya çıkar. Yetkiyi Kullanıcılar ve Yetkiler sayfasından verin."
          />
          <p className="text-sm text-slate-500">
            Panodaki kartların yeri, renkler ve slayt süreleri{' '}
            <Link to="/ekranlar" className="font-semibold text-brand-700 hover:underline">
              Panolar
            </Link>{' '}
            sayfasında.
          </p>
        </Section>
        {/* Pano düzenindeki gibi: yalnızca değişiklik varsa altta yapışık Kaydet / İptal */}
        <SaveBar
          show={dirty}
          saving={save.isPending}
          onSave={() => void submit()}
          onCancel={() => school.data && form.reset(toForm(school.data))}
        />
      </Card>

    </div>
  );
}

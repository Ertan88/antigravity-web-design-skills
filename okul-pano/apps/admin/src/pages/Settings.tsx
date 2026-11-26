import { PlaceSelect } from '../components/PlaceSelect.tsx';
import { RESPONSIBILITY_AREAS, SCHOOL_TYPE_OPTIONS, shortTitle, SPECIAL_DAYS, type Member, type ResponsibilityArea, specialDayFor, splitSchoolName, updateSchoolSchema, type SchoolSettings, type EnrollRole, errorText } from '@okulpano/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, FileText, MapPin, Search, Settings2 } from '../components/icons.tsx';
import { useEffect, useState, type ReactNode } from 'react';
import { ImageUpload } from '../components/ImageUpload.tsx';
import { SampleDataCard } from '../components/Onboarding.tsx';
import { SupportAccessCard } from '../components/SupportAccess.tsx';
import { SaveBar } from '../components/SaveBar.tsx';
import { useToast } from '../components/Toast.tsx';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea, Toggle } from '../components/ui.tsx';
import { confirm } from '../components/confirm.tsx';
import { downloadJson } from '../lib/download.ts';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { SettingsLink, type SettingsTab } from '../components/SettingsLink.tsx';
import { TickerSources } from './TickerSources.tsx';
import { ConductDataSettings } from './Conduct.tsx';
import { AreasDialog } from './Internship.tsx';
import { InternshipSettingsDialog } from './InternshipSettings.tsx';
import { OwnersDialog } from './Issues.tsx';
import { TitleRoleDialog } from './users/dialogs.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useInternshipAccess, useList, useSchool, useSchoolPath, type School, type TeacherOption } from '../lib/data.ts';
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
  institutionCode: string;
  city: string;
  latitude: string;
  longitude: string;
  timezone: string;
  settings: SchoolSettings;
};

const EMPTY: Form = { name: '', logoUrl: null, institutionCode: '', city: '', latitude: '', longitude: '', timezone: 'Europe/Istanbul', settings: {} as SchoolSettings };

const toForm = (s: School): Form => ({
  name: s.name,
  logoUrl: s.logoUrl,
  institutionCode: s.institutionCode ?? '',
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
      setError(errorText(err, 'Arama başarısız'));
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

/**
 * KVKK: okulun aydınlatma metni (herkese açık /aydinlatma/<okul> adresinde yayınlanır) ve okul müdürü için
 * bütün verileri dışa aktarma.
 */
function PrivacySection({ value, onChange, slug }: { value: string; onChange: (v: string) => void; slug: string }) {
  const { school: access, me } = useAuth();
  const canExport = access?.role === 'owner' || Boolean(me?.user.isSuperAdmin);
  const path = useSchoolPath();
  const toast = useToast();
  const [busy, setBusy] = useState<'template' | 'export' | null>(null);
  const publicUrl = `${location.origin}/aydinlatma/${slug}`;

  const fillTemplate = async () => {
    if (value.trim() && !(await confirm({ title: 'Mevcut metin şablonla değiştirilsin mi?', message: 'Kutudaki metnin yerine şablon gelir. Kaydetmeden önce değişikliği gözden geçirebilirsiniz.', tone: 'warning', confirmLabel: 'Şablonla değiştir', icon: FileText }))) return;
    setBusy('template');
    try {
      const { text } = await api<{ text: string }>(`${path}/privacy-template`);
      onChange(text);
      toast.success('Şablon dolduruldu: köşeli parantezli yerleri okulunuzun bilgileriyle değiştirip kaydedin');
    } catch (err) {
      toast.error(errorText(err, 'Şablon alınamadı'));
    } finally {
      setBusy(null);
    }
  };
  const exportData = async () => {
    setBusy('export');
    try {
      const data = await api(`${path}/export`);
      downloadJson(data, `okul-pano-${slug}-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      toast.error(errorText(err, 'Dışa aktarılamadı'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title="Kişisel veriler (KVKK)"
      description="Veri sorumlusu okulunuzdur. Aydınlatma metnini yayınlayın, bağlantısını velilere ve personele iletin (okul sitesi, veli grubu, QR kod)."
    >
      <Field
        label="Aydınlatma metni"
        help='Satır başındaki "# " başlık, "- " madde olur. Şablon genel bir başlangıçtır; okulunuzun bilgileriyle tamamlayıp bir hukukçuya kontrol ettirmeniz önerilir.'
      >
        {(id) => <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-48 font-mono text-xs" maxLength={20000} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<FileText className="size-4" />} loading={busy === 'template'} onClick={() => void fillTemplate()}>
          Şablondan doldur
        </Button>
        <Button
          variant="secondary"
          icon={<Copy className="size-4" />}
          onClick={() => void navigator.clipboard?.writeText(publicUrl).then(() => toast.success('Bağlantı kopyalandı'))}
        >
          Bağlantıyı kopyala
        </Button>
        <a href={`/aydinlatma/${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2 text-sm font-semibold text-brand-700 hover:underline">
          <ExternalLink className="size-4" /> Yayındaki metni aç
        </a>
      </div>
      <p className="text-xs text-slate-500">Herkese açık adres: {publicUrl} · Değişiklik kaydedilince yayına girer.</p>
      {canExport && (
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="text-sm font-semibold">Verileri dışa aktar</div>
          <p className="mt-1 text-sm text-slate-500">
            Okulunuzun bütün kayıtları (öğretmenler, öğrenciler, nöbetler, duyurular, görseller, etkinlik geçmişi) tek dosyada iner. Şifreler ve
            pano anahtarları dosyada yer almaz. Dosyayı güvenli saklayın; kişisel veri içerir.
          </p>
          <Button className="mt-3" variant="secondary" icon={<Download className="size-4" />} loading={busy === 'export'} onClick={() => void exportData()}>
            Verileri indir (JSON)
          </Button>
        </div>
      )}
    </Section>
  );
}

/**
 * Görev dağılımı: her iş için bildirim ve onayın gideceği yöneticiler (bir işe birden çok kişi seçilebilir). Seçilmeyen
 * işte yetkisi olan bütün yöneticilere gider. Ders görevlendirme o günün nöbetçi müdür yardımcısına, mesleki eğitim
 * koordinatör müdür yardımcısına gider (sabit satırlar).
 */
function ResponsibilitiesTable({ value, onChange, internship }: { value: SchoolSettings['responsibilities']; onChange: (v: SchoolSettings['responsibilities']) => void; internship: boolean }) {
  const { schoolId } = useAuth();
  const path = useSchoolPath('members');
  const list = useQuery({ queryKey: [schoolId, 'members'], queryFn: () => api<Member[]>(path) });
  const managers = (list.data ?? []).filter((m) => m.role === 'owner' || m.role === 'admin').sort((a, b) => (a.role === b.role ? a.fullName.localeCompare(b.fullName, 'tr') : a.role === 'owner' ? 1 : -1));
  const toggle = (area: ResponsibilityArea, userId: string) => {
    const cur = value?.[area] ?? [];
    onChange({ ...value, [area]: cur.includes(userId) ? cur.filter((x) => x !== userId) : [...cur, userId] });
  };
  if (list.isLoading) return <Spinner />;
  const fixed = (label: string, text: string) => (
    <tr className="border-t border-slate-200">
      <td className="py-2.5 pr-3 font-semibold text-ink">{label}</td>
      <td colSpan={managers.length} className="py-2.5 text-center text-sm font-semibold text-brand-700 dark:text-slate-100">
        {text}
      </td>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-bold text-slate-500">
            <th className="py-2 pr-3 text-left">İş</th>
            {managers.map((m) => (
              <th key={m.userId} className="px-2 py-2 text-center">
                {m.fullName}
                <div className="font-medium">{m.role === 'owner' ? 'Müdür' : shortTitle('Müdür Yardımcısı')}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RESPONSIBILITY_AREAS.map((a) => (
            <tr key={a.key} className="border-t border-slate-200">
              <td className="py-2.5 pr-3">
                <div className="font-semibold text-ink">{a.label}</div>
                <div className="text-xs text-slate-500">{a.text}</div>
              </td>
              {managers.map((m) => {
                const on = (value?.[a.key] ?? []).includes(m.userId);
                return (
                  <td key={m.userId} className="px-2 py-2.5 text-center">
                    <input type="checkbox" className="size-4 accent-brand-600" checked={on} onChange={() => toggle(a.key, m.userId)} aria-label={`${a.label}: ${m.fullName}`} />
                  </td>
                );
              })}
            </tr>
          ))}
          {fixed('Ders görevlendirme', 'O günün nöbetçi müdür yardımcısı (Nöbet Çizelgesi)')}
          {internship && fixed('Mesleki eğitim', 'Koordinatör müdür yardımcısı (Mesleki eğitim sekmesi)')}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">Bir işte kimse işaretlenmezse bildirim, o işin yetkisi olan bütün yöneticilere gider. Okul sorunlarında kategori sorumluları ayrıca bildirim alır.</p>
    </div>
  );
}

const OTHER_TYPE = '__other';

/** Okul türü: MEB türleri açılır kutuda; listede olmayan tür "Diğer (kendim yazayım)" ile elle yazılır (kayıtlı özel tür korunur) */
function SchoolTypeField({ id, value, derived, onChange }: { id: string; value: string; derived: string | null; onChange: (v: string) => void }) {
  const known = SCHOOL_TYPE_OPTIONS.includes(value.trim());
  const [other, setOther] = useState(Boolean(value.trim()) && !known);
  const custom = other || (Boolean(value.trim()) && !known);
  return (
    <div className="grid gap-2">
      <Select
        id={id}
        value={custom ? OTHER_TYPE : value.trim()}
        onChange={(e) => {
          const next = e.target.value;
          if (next === OTHER_TYPE) {
            setOther(true);
            if (known) onChange('');
          } else {
            setOther(false);
            onChange(next);
          }
        }}
      >
        <option value="">{derived ? `Addan ayır (${derived})` : 'Seçin'}</option>
        {SCHOOL_TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value={OTHER_TYPE}>Diğer (kendim yazayım)</option>
      </Select>
      {custom && <Input aria-label="Okul türü" value={value} onChange={(e) => onChange(e.target.value)} placeholder="ör. Sağlık Meslek Lisesi" maxLength={80} autoFocus={!value} />}
    </div>
  );
}

/** Genel Ayarlar kategorileri (sırasıyla); `keywords` "Ayar ara" kutusunda aranır */
const TABS: { key: SettingsTab; label: string; hint: string; keywords: string }[] = [
  { key: 'okul', label: 'Okul', hint: 'Ad, logo, konum, KVKK', keywords: 'okul adı türü kurum kodu logo il ilçe konum hava durumu kvkk aydınlatma örnek veri' },
  { key: 'gorev', label: 'Görev dağılımı', hint: 'Bildirim, sorun sorumluları', keywords: 'görev dağılımı bildirim onay izin nöbet sorun sorumlu rol görev rol eşleştirme' },
  { key: 'moduller', label: 'Modüller', hint: 'Duyuru onayı, staj, taşımalı', keywords: 'modül duyuru onayı mesleki eğitim işletme staj taşımalı eğitim servis' },
  { key: 'takvim', label: 'Takvim ve zil', hint: 'MEB takvimi, arife, öğle arası', keywords: 'takvim meb tatil arife yarım gün son zil öğle arası teneffüs zil' },
  { key: 'ogrenci', label: 'Öğrenci takibi', hint: 'Saklama süresi, uyarı', keywords: 'öğrenci gözlem saklama süresi kvkk rehberlik uyarı eksi' },
  { key: 'mesleki', label: 'Mesleki eğitim', hint: 'Koordinatör, staj, alanlar', keywords: 'mesleki eğitim staj koordinatör müdür yardımcısı program adı teknik atp alan meslek öğretmeni branş' },
  { key: 'pano', label: 'Pano ve yayın', hint: 'Özel günler, kayan yazı', keywords: 'pano özel gün mesaj kayan yazı rss günün sözü hava uyarısı bugün tarihte' },
  { key: 'destek', label: 'Destek', hint: 'Süreli erişim', keywords: 'destek erişim platform yardım' },
];

export function Settings() {
  const { schoolId, reloadMe, can, school: access } = useAuth();
  const role = access?.role;
  const internship = useInternshipAccess();
  const titles = useList<TeacherOption>('teacher-titles');
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [ownersOpen, setOwnersOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
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
      institutionCode: v.institutionCode || null,
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
  const full = can('settings.manage');
  // Koordinatör müdür yardımcısı ve "Mesleki eğitimi yönetir" yetkisi olan, ayar yetkisi olmasa da Mesleki eğitim sekmesini görür
  const internshipManager = Boolean(internship.data?.manage);
  const tabs = TABS.filter((t) => (t.key === 'mesleki' ? full || internshipManager : full));
  const needle = query.trim().toLocaleLowerCase('tr-TR');
  const listed = needle ? tabs.filter((t) => `${t.label} ${t.keywords}`.toLocaleLowerCase('tr-TR').includes(needle)) : tabs;
  const asked = params.get('sekme') as SettingsTab | null;
  const active: SettingsTab | undefined = tabs.find((t) => t.key === asked)?.key ?? tabs[0]?.key;
  const open = (k: SettingsTab) => {
    setParams({ sekme: k }, { replace: true });
    setQuery('');
  };

  if (!tabs.length)
    return <EmptyState icon={<Settings2 className="size-6" />} title="Bu sayfa için yetkiniz yok" description="Okul ayarlarını okul müdürü ve ayar yetkisi verilen kişiler değiştirir." />;

  return (
    <div>
      <PageHeader title="Genel Ayarlar" description="Okulun bütün ayarları kategorilere ayrılmış olarak burada. Panoların görünümü ve düzeni Panolar sayfasında." />
      {form.errors._form && (
        <div className="mb-4">
          <Alert tone="red">{form.errors._form}</Alert>
        </div>
      )}
      {/* Düzen (A): solda arama ve kategori listesi, sağda seçili kategori; telefonda liste açılır seçime döner */}
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Ayar kategorileri" className="grid content-start gap-1 lg:sticky lg:top-20">
          <div className="relative mb-1 hidden lg:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ayar ara" aria-label="Ayar ara" className="pl-9" />
          </div>
          <div className="lg:hidden">
            <Select value={active} onChange={(e) => open(e.target.value as SettingsTab)} aria-label="Ayar kategorisi">
              {tabs.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          {listed.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => open(t.key)}
              aria-current={active === t.key ? 'page' : undefined}
              className={clsx(
                'hidden rounded-xl px-3 py-2 text-left transition-colors lg:block',
                active === t.key ? 'bg-ink text-surface' : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5',
              )}
            >
              <span className="block text-sm font-bold">{t.label}</span>
              <span className={clsx('block text-xs', active === t.key ? 'text-surface/70' : 'text-slate-400')}>{t.hint}</span>
            </button>
          ))}
          {needle && !listed.length && <p className="hidden px-3 text-sm text-slate-500 lg:block">Aramaya uyan ayar yok.</p>}
        </nav>

        <div className="grid min-w-0 content-start gap-5">
          {active === 'okul' && (
            <>
              <Card className="p-6 sm:p-8">
        <Section title="Okul bilgileri" description="Panonun sol üstünde logo ile birlikte okul adı (kalın) ve altında okul türü görünür.">
          <Field label="Okul adı" error={form.errors.name}>
            {(id) => <Input id={id} value={v.name} onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <Field
            label="Okul türü (ikinci satır)"
            help={
              splitSchoolName(v.name).type
                ? `Seçilmezse addan ayrılır: "${splitSchoolName(v.name).type}". Yalnızca farklı göstermek isterseniz seçin.`
                : 'Panonun üst barında, ekran koruyucuda ve hazır şablonlarda okul adının altında görünür. Listede yoksa "Diğer (kendim yazayım)" seçin.'
            }
            error={!v.settings.schoolType?.trim() && !splitSchoolName(v.name).type ? 'Okul türü boş: panoda okul adının altı boş kalıyor.' : undefined}
          >
            {(id) => <SchoolTypeField id={id} value={v.settings.schoolType ?? ''} derived={splitSchoolName(v.name).type} onChange={(t) => setting('schoolType', t)} />}
          </Field>
          <Field label="Kurum kodu" help="MEBBİS'teki 6 haneli kurum kodu." error={form.errors.institutionCode}>
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                maxLength={6}
                className="max-w-40"
                value={v.institutionCode}
                onChange={(e) => set('institutionCode', e.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>
          <PlaceSelect
            province={v.settings.province ?? ''}
            district={v.settings.district ?? ''}
            onChange={(province, district) => set('settings', { ...v.settings, province, district })}
            provinceHelp="Resmî belgelerde (ör. aylık rehberlik raporu) kullanılır."
            districtHelp="Panodaki hava durumu yerinden ayrıdır."
          />
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
        </Section>

              </Card>
              <Card className="p-6 sm:p-8">
                <PrivacySection value={s.privacyNotice ?? ''} onChange={(x) => setting('privacyNotice', x)} slug={school.data!.slug} />
              </Card>
              <SampleDataCard />
            </>
          )}
          {active === 'gorev' && (
            <>
              <Card className="p-6 sm:p-8">
        <Section title="Görev dağılımı" description="Hangi işin bildirimi ve onayı hangi yöneticiye gider.">
          <ResponsibilitiesTable
            value={s.responsibilities ?? { leaves: [], duties: [], issues: [], announcements: [] }}
            onChange={(x) => setting('responsibilities', x)}
            internship={Boolean(s.internshipEnabled)}
          />
        </Section>

              </Card>
              <Card className="grid gap-3 p-6 sm:p-8">
                <SettingRow title="Okul sorunları sorumluları" text="Her sorun kategorisinde bildirimi alan idareci ve yardımcıları. Seçilmezse bildirim bütün idarecilere gider.">
                  <Button size="sm" variant="secondary" onClick={() => setOwnersOpen(true)}>
                    Düzenle
                  </Button>
                </SettingRow>
                <SettingRow title="Görev → hesap rolü" text="Kadrodaki göreve göre hesap açılırken önerilen rol (ör. Müdür Yardımcısı → Yönetici).">
                  <Button size="sm" variant="secondary" onClick={() => setRolesOpen(true)}>
                    Düzenle
                  </Button>
                </SettingRow>
              </Card>
            </>
          )}
          {active === 'moduller' && (
            <Card className="grid gap-5 p-6 sm:p-8">
              <Toggle
                checked={s.requireApproval}
                onChange={(x) => setting('requireApproval', x)}
                label="Duyurular onaydan sonra yayınlansın"
                description="Açıkken 'Duyuruları onaylama' yetkisi olmayan kullanıcıların (ör. öğretmenler) eklediği ya da değiştirdiği duyurular, okul müdürü, yöneticiler veya bu yetkiyi verdiğiniz kişiler onaylayınca panoya çıkar."
              />
              <Toggle
                checked={Boolean(s.internshipEnabled)}
                onChange={(x) => setting('internshipEnabled', x)}
                label="İşletmelerde mesleki eğitim"
                description="Meslek liseleri için: işletmeler, koordinatör öğretmenler ve aylık işletmede devam çizelgesi. Ayarları Mesleki eğitim sekmesinde."
              />
              <Toggle
                checked={Boolean(s.hasTransport)}
                onChange={(x) => setting('hasTransport', x)}
                label="Taşımalı eğitim"
                description="Servisle gelen öğrenciler için sabah, öğle ve akşam görevlileri (Nöbet › Taşımalı eğitim). Görevliler panoda o günün nöbet kartında görünür."
              />
            </Card>
          )}
          {active === 'takvim' && (
            <Card className="grid gap-5 p-6 sm:p-8">
              <Toggle
                checked={s.followMebCalendar !== false}
                onChange={(x) => setting('followMebCalendar', x)}
                label="MEB takvimindeki tatilleri uygula"
                description="Ara tatiller, yarıyıl ve yaz tatili okulda tatil sayılır. Takvim her yıl MEB'in sitesinden kendiliğinden alınır."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Arifede son zil" help="Kamuda arife 13.00'ten itibaren tatildir. Bu saatten sonra başlayan dersler yapılmaz.">
                  {(id) => <Input id={id} type="time" className="max-w-40" value={s.halfDayEnd ?? '13:00'} onChange={(e) => setting('halfDayEnd', e.target.value)} />}
                </Field>
                <Field label="Öğle arası eşiği (dakika)" help="Günün en uzun arası bundan uzunsa panoda 'Öğle Arası' yazar; öteki aralar teneffüstür.">
                  {(id) => <Input id={id} type="number" min={10} max={180} className="max-w-40" value={s.lunchThresholdMin} onChange={(e) => setting('lunchThresholdMin', Number(e.target.value))} />}
                </Field>
              </div>
              <p className="text-sm text-slate-500">
                Eğitim düzeni (tam gün ya da ikili eğitim) ve öğlenci sınıflar, zil düzenleriyle birlikte{' '}
                <Link to="/zil-saatleri" className="font-semibold text-brand-700 hover:underline">
                  Zil Saatleri
                </Link>{' '}
                sayfasında seçilir.
              </p>
            </Card>
          )}
          {active === 'ogrenci' && <ConductDataSettings />}
          {active === 'mesleki' &&
            (s.internshipEnabled || school.data?.settings.internshipEnabled ? (
              <>
                <InternshipSettingsDialog inline open onClose={() => undefined} />
                {full && <AreasDialog inline open onClose={() => undefined} />}
              </>
            ) : (
              <Card className="p-6">
                <Alert>İşletmelerde mesleki eğitim kapalı. Açmak için Modüller sekmesini kullanın.</Alert>
              </Card>
            ))}
          {active === 'pano' && (
            <>
              <Card className="p-6 sm:p-8">
                <SpecialDaysSection value={s.specialDays} schoolName={v.name} onChange={(x) => setting('specialDays', x)} />
              </Card>
              <TickerSources />
              <p className="text-sm text-slate-500">
                Panodaki kartların yeri, renkler, uyku saatleri ve slayt süreleri{' '}
                <Link to="/ekranlar" className="font-semibold text-brand-700 hover:underline">
                  Panolar
                </Link>{' '}
                sayfasında, canlı önizlemeyle ayarlanır.
              </p>
            </>
          )}
          {active === 'destek' && <SupportAccessCard />}
        </div>
      </div>
      {/* Bilgiler ve seçimler bütün sekmelerde birlikte kaydedilir; yalnızca değişiklik varsa altta yapışık Kaydet / İptal */}
      <SaveBar show={dirty} saving={save.isPending} onSave={() => void submit()} onCancel={() => school.data && form.reset(toForm(school.data))} />
      {ownersOpen && <OwnersDialog onClose={() => setOwnersOpen(false)} />}
      <TitleRoleDialog
        open={rolesOpen}
        onClose={() => setRolesOpen(false)}
        titles={titles.data ?? []}
        value={(s.titleRoles ?? {}) as Record<string, EnrollRole>}
        isOwner={role === 'owner'}
        onSave={async (x) => {
          const data = await api<School>(path, { method: 'PATCH', body: { settings: { titleRoles: x } } });
          qc.setQueryData([schoolId, 'school'], data);
          toast.success('Görev → rol eşleştirmesi kaydedildi');
          setRolesOpen(false);
        }}
      />
    </div>
  );
}

/** Ayar satırı: başlık, açıklama, sağda düğme */
function SettingRow({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">{title}</div>
        <p className="text-sm text-slate-500">{text}</p>
      </div>
      {children}
    </div>
  );
}

/** Bir özel günün örnek tarihi (önizlemede {yil} doldurmak için): bu yıl ya da gelecek yıl */
function sampleDate(id: string): string | null {
  const y = new Date().getFullYear();
  for (const year of [y, y + 1]) {
    for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (specialDayFor(iso)?.def.id === id) return iso;
    }
  }
  return null;
}

type SpecialDaysValue = SchoolSettings['specialDays'];

/**
 * Mobil uygulamadaki özel gün şeridi ve mesaj penceresi: tamamen kapatılabilir, her gün ayrı açılıp kapatılır,
 * başlık / mesaj / görsel değiştirilebilir. Anma günleri sade (konfetisiz, gri) gösterilir.
 */
function SpecialDaysSection({ value, schoolName, onChange }: { value: SpecialDaysValue | undefined; schoolName: string; onChange: (v: SpecialDaysValue) => void }) {
  const cur: SpecialDaysValue = value ?? { enabled: true, signature: '', days: {} };
  const [open, setOpen] = useState<string | null>(null);
  const setDay = (id: string, patch: NonNullable<SpecialDaysValue['days']>[string]) =>
    onChange({ ...cur, days: { ...cur.days, [id]: { ...cur.days?.[id], ...patch } } });
  return (
    <Section
      title="Özel gün mesajları"
      description="Mobil uygulamada bayram ve anma günlerinde ana sayfanın üstünde ince bir şerit görünür; mesaj penceresi her kullanıcıya bir kez açılır. Anma günlerinde (10 Kasım, 18 Mart, 15 Temmuz…) sade ve gri tonlu gösterilir."
    >
      <Toggle checked={cur.enabled !== false} onChange={(x) => onChange({ ...cur, enabled: x })} label="Özel gün şeridi ve mesajları açık" />
      {cur.enabled !== false && (
        <>
          <Field label="İmza" help="Pencerenin altında yazar. Boş bırakılırsa okul adı ve “Okul Müdürlüğü” yazar.">
            {(id) => <Input id={id} value={cur.signature ?? ''} maxLength={80} placeholder={`${schoolName || 'Okul adı'} · Okul Müdürlüğü`} onChange={(e) => onChange({ ...cur, signature: e.target.value })} />}
          </Field>
          <div className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
            {SPECIAL_DAYS.map((d) => {
              const own = cur.days?.[d.id] ?? {};
              const on = own.enabled !== false;
              const sample = sampleDate(d.id);
              const preview = sample ? specialDayFor(sample, { enabled: true, days: { [d.id]: own } }) : null;
              return (
                <div key={d.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                        {d.name}
                        <Badge tone={d.kind === 'celebration' ? 'green' : 'slate'}>{d.kind === 'celebration' ? 'Kutlama' : 'Anma'}</Badge>
                        {(own.title || own.message || own.imageUrl) && <Badge tone="blue">Okulun metni</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">{d.when}</div>
                    </div>
                    {on && (
                      <Button size="sm" variant="ghost" onClick={() => setOpen(open === d.id ? null : d.id)}>
                        {open === d.id ? 'Kapat' : 'Düzenle'}
                      </Button>
                    )}
                    <Toggle checked={on} onChange={(x) => setDay(d.id, { enabled: x })} label="" />
                  </div>
                  {on && open === d.id && (
                    <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
                      <Field label="Başlık" help="Boş bırakılırsa varsayılan metin kullanılır. {yil} kaçıncı yıl olduğunu yazar.">
                        {(id) => <Input id={id} value={own.title ?? ''} maxLength={80} placeholder={d.title} onChange={(e) => setDay(d.id, { title: e.target.value })} />}
                      </Field>
                      <Field label="Mesaj">
                        {(id) => <Textarea id={id} rows={3} value={own.message ?? ''} maxLength={400} placeholder={d.message} onChange={(e) => setDay(d.id, { message: e.target.value })} />}
                      </Field>
                      <Field label="Görsel (isteğe bağlı)" help="Yüklemezseniz hazır çizim (bayrak, kurdele…) kullanılır. Telif hakkı size ait ya da serbest bir görsel yükleyin.">
                        {() => <ImageUpload value={own.imageUrl ?? null} onChange={(url) => setDay(d.id, { imageUrl: url })} aspect="aspect-[2/1]" hint="PNG, JPG veya WEBP · yatay (2:1) görsel" />}
                      </Field>
                      {preview && (
                        <div className="rounded-xl bg-surface p-3 text-sm ring-1 ring-slate-200">
                          <div className="text-xs font-bold tracking-wide text-slate-400 uppercase">Önizleme · {sample}</div>
                          <div className="mt-1 font-bold text-ink">{preview.title}</div>
                          <div className="text-slate-600">{preview.message}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Section>
  );
}

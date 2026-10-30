/**
 * Hazır duyuru şablonları: öğretmen yalnızca metinleri yazar, panoda tasarımlı bir slayt oluşur.
 * Görünüm @okulpano/slides paketinde; burada yalnızca şablonların alanları ve renkleri var
 * (API doğrulaması, panel formu ve pano aynı tanımı kullanır).
 */
export const DESIGN_TEMPLATE_IDS = ['monthStudent', 'achievement', 'parents', 'trip', 'congrats', 'event', 'exam', 'notice', 'celebration'] as const;
export type DesignTemplateId = (typeof DESIGN_TEMPLATE_IDS)[number];

export const DESIGN_PALETTE_IDS = ['petrol', 'navy', 'emerald', 'burgundy', 'amber', 'red', 'slate'] as const;
export type DesignPaletteId = (typeof DESIGN_PALETTE_IDS)[number];

export const DESIGN_PALETTES: Record<DesignPaletteId, { name: string; from: string; to: string; accent: string }> = {
  petrol: { name: 'Petrol', from: '#0d4f66', to: '#1f8bad', accent: '#fbbf24' },
  navy: { name: 'Lacivert', from: '#0f1f45', to: '#1e4f91', accent: '#f2a900' },
  emerald: { name: 'Zümrüt', from: '#064e3b', to: '#0f8a6a', accent: '#fde047' },
  burgundy: { name: 'Bordo', from: '#4c0519', to: '#9f1d35', accent: '#fcd34d' },
  amber: { name: 'Turuncu', from: '#7c2d12', to: '#d9640e', accent: '#fef3c7' },
  red: { name: 'Kırmızı', from: '#7f1d1d', to: '#dc2626', accent: '#ffffff' },
  slate: { name: 'Gece', from: '#0b1220', to: '#334155', accent: '#38bdf8' },
};

export type DesignIcon = 'users' | 'bus' | 'trophy' | 'calendar' | 'pencil' | 'megaphone' | 'flag' | 'clock' | 'pin' | 'star';

export interface DesignField {
  key: string;
  label: string;
  placeholder: string;
  /** Bilgi satırlarında yanında görünen simge */
  icon?: DesignIcon;
  multiline?: boolean;
  /** 'image': fotoğraf (slaytta büyük simgenin yerine yuvarlak fotoğraf) */
  type?: 'text' | 'image';
  max: number;
}

export interface DesignTemplate {
  id: DesignTemplateId;
  name: string;
  description: string;
  /** Slaytın üstündeki küçük etiket (ör. "VELİ TOPLANTISI") */
  kicker: string;
  icon: DesignIcon;
  palette: DesignPaletteId;
  /** 'split': solda metin, sağda büyük simge · 'center': ortada büyük başlık (tebrik, kutlama) */
  layout: 'split' | 'center';
  /** Büyük başlık alanı */
  headline: DesignField;
  /** Başlığın altındaki ikinci satır (isteğe bağlı) */
  subline?: DesignField;
  /** Tarih, saat, yer gibi simgeli bilgi satırları */
  info: DesignField[];
  /** En alttaki not */
  note?: DesignField;
  /** Fotoğraf alanı (ayın öğrencisi, başarı) */
  photo?: DesignField;
  /** 'achievements': Başarılar sayfasının kayıtlarından kendiliğinden oluşur, duyuru şablonlarında görünmez */
  scope?: 'announcements' | 'achievements';
}

const DATE: DesignField = { key: 'date', label: 'Tarih', placeholder: '14 Kasım 2026 Cuma', icon: 'calendar', max: 40 };
const TIME: DesignField = { key: 'time', label: 'Saat', placeholder: '14:00', icon: 'clock', max: 30 };
const PLACE: DesignField = { key: 'place', label: 'Yer', placeholder: 'Konferans salonu', icon: 'pin', max: 60 };
const NOTE: DesignField = { key: 'note', label: 'Not (isteğe bağlı)', placeholder: '', multiline: true, max: 160 };

const PHOTO: DesignField = { key: 'photo', label: 'Fotoğraf (isteğe bağlı)', placeholder: '', type: 'image', max: 500 };

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: 'monthStudent',
    name: 'Ayın öğrencisi',
    description: 'Fotoğraf, ad, sınıf ve neden',
    kicker: 'Ayın Öğrencisi',
    scope: 'achievements',
    icon: 'star',
    palette: 'amber',
    layout: 'center',
    headline: { key: 'name', label: 'Öğrenci', placeholder: 'Elif Yılmaz', max: 60 },
    subline: { key: 'class', label: 'Sınıf', placeholder: '11-B', max: 30 },
    info: [{ key: 'month', label: 'Ay', placeholder: 'Ekim 2026', icon: 'calendar', max: 30 }],
    note: { ...{ key: 'note', label: 'Neden seçildi', placeholder: 'Derslerdeki başarısı, yardımseverliği ve örnek davranışlarıyla.', multiline: true, max: 160 } },
    photo: PHOTO,
  },
  {
    id: 'achievement',
    name: 'Başarı / derece',
    description: 'Fotoğraflı başarı duyurusu',
    kicker: 'Gururla Duyururuz',
    scope: 'achievements',
    icon: 'trophy',
    palette: 'emerald',
    layout: 'split',
    headline: { key: 'name', label: 'Öğrenci / takım', placeholder: 'Robotik Takımımız', max: 60 },
    subline: { key: 'achievement', label: 'Derece', placeholder: 'Türkiye Üçüncüsü', max: 50 },
    info: [
      { key: 'event', label: 'Yarışma', placeholder: 'FIRST LEGO League', icon: 'trophy', max: 70 },
      { key: 'date', label: 'Tarih', placeholder: 'Ekim 2026', icon: 'calendar', max: 40 },
    ],
    note: { key: 'note', label: 'Not (isteğe bağlı)', placeholder: 'Takımımızı ve danışman öğretmenlerini kutlarız.', multiline: true, max: 160 },
    photo: PHOTO,
  },
  {
    id: 'parents',
    name: 'Veli toplantısı',
    description: 'Tarih, saat ve yer bilgisiyle',
    kicker: 'Veli Toplantısı',
    icon: 'users',
    palette: 'petrol',
    layout: 'split',
    headline: { key: 'title', label: 'Başlık', placeholder: '1. Dönem Veli Toplantısı', max: 70 },
    info: [DATE, TIME, { ...PLACE, placeholder: 'Sınıflarda' }],
    note: { ...NOTE, placeholder: 'Tüm velilerimizin katılımını bekliyoruz.' },
  },
  {
    id: 'trip',
    name: 'Okul gezisi',
    description: 'Gezi yeri, tarih, buluşma ve katılım',
    kicker: 'Okul Gezisi',
    icon: 'bus',
    palette: 'emerald',
    layout: 'split',
    headline: { key: 'title', label: 'Gezi yeri', placeholder: 'Çanakkale Şehitliği Gezisi', max: 70 },
    info: [DATE, { key: 'meet', label: 'Buluşma', placeholder: '07:30 · Okul önü', icon: 'clock', max: 50 }, { key: 'who', label: 'Katılım', placeholder: '9. sınıflar · Son kayıt 5 Kasım', icon: 'users', max: 60 }],
    note: { ...NOTE, placeholder: 'Veli izin dilekçesi sınıf öğretmenine teslim edilmelidir.' },
  },
  {
    id: 'congrats',
    name: 'Başarı tebriği',
    description: 'Öğrenci ya da takım, derece ve yarışma',
    kicker: 'Tebrikler',
    icon: 'trophy',
    palette: 'navy',
    layout: 'center',
    headline: { key: 'name', label: 'Öğrenci / takım', placeholder: 'Elif Yılmaz · 11-B', max: 60 },
    subline: { key: 'achievement', label: 'Derece', placeholder: 'İl Birincisi', max: 50 },
    info: [{ key: 'event', label: 'Yarışma / etkinlik', placeholder: 'TÜBİTAK 4006 Bilim Fuarı', icon: 'star', max: 70 }],
    note: { ...NOTE, placeholder: 'Öğrencimizi ve danışman öğretmenini kutlarız.' },
  },
  {
    id: 'event',
    name: 'Etkinlik / tören',
    description: 'Etkinlik adı, tarih, saat ve yer',
    kicker: 'Etkinlik',
    icon: 'star',
    palette: 'amber',
    layout: 'split',
    headline: { key: 'title', label: 'Etkinlik adı', placeholder: 'Bilim Şenliği', max: 70 },
    info: [DATE, TIME, { ...PLACE, placeholder: 'Okul bahçesi' }],
    note: { ...NOTE, placeholder: 'Tüm öğrencilerimiz davetlidir.' },
  },
  {
    id: 'exam',
    name: 'Sınav duyurusu',
    description: 'Sınav adı, tarih, saat ve salon',
    kicker: 'Sınav Duyurusu',
    icon: 'pencil',
    palette: 'slate',
    layout: 'split',
    headline: { key: 'title', label: 'Sınav', placeholder: 'Matematik Ortak Sınavı', max: 70 },
    info: [DATE, { ...TIME, placeholder: '2. ders · 09:20' }, { ...PLACE, label: 'Salon', placeholder: 'Kendi sınıflarında' }],
    note: { ...NOTE, placeholder: 'Kalem, silgi ve öğrenci kartınızı unutmayın.' },
  },
  {
    id: 'notice',
    name: 'Önemli duyuru',
    description: 'Büyük başlık ve kısa metin',
    kicker: 'Önemli Duyuru',
    icon: 'megaphone',
    palette: 'red',
    layout: 'split',
    headline: { key: 'title', label: 'Başlık', placeholder: 'Servis saatleri değişti', max: 70 },
    info: [],
    note: { key: 'body', label: 'Metin', placeholder: 'Yarından itibaren servisler 15:40\'ta hareket edecektir.', multiline: true, max: 220 },
  },
  {
    id: 'celebration',
    name: 'Kutlama / özel gün',
    description: 'Bayram, anma ve özel günler',
    kicker: 'Kutlu Olsun',
    icon: 'flag',
    palette: 'burgundy',
    layout: 'center',
    headline: { key: 'title', label: 'Başlık', placeholder: '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı', max: 70 },
    subline: { key: 'sub', label: 'Alt başlık', placeholder: 'Kutlu olsun!', max: 60 },
    info: [],
    note: { ...NOTE, placeholder: 'Tören saat 09:00\'da okul bahçesinde.' },
  },
];

export function designTemplate(id: string): DesignTemplate {
  return DESIGN_TEMPLATES.find((t) => t.id === id) ?? DESIGN_TEMPLATES[0]!;
}

export interface AnnouncementDesign {
  template: DesignTemplateId;
  palette: DesignPaletteId;
  /** Alan anahtarı → yazılan metin */
  fields: Record<string, string>;
}

/** Şablonun bütün alanları (başlık, alt satır, bilgiler, not) */
export function designFields(t: DesignTemplate): DesignField[] {
  return [...(t.photo ? [t.photo] : []), t.headline, ...(t.subline ? [t.subline] : []), ...t.info, ...(t.note ? [t.note] : [])];
}

/** Listede ve kayan özetlerde görünen başlık */
export function designTitle(d: AnnouncementDesign): string {
  const t = designTemplate(d.template);
  const head = d.fields[t.headline.key]?.trim();
  return head ? (t.layout === 'center' ? `${t.kicker}: ${head}` : head) : t.name;
}

/** Duyuru şablonu seçicisinde görünen şablonlar (başarı / ayın öğrencisi kendi sayfasında) */
export const ANNOUNCEMENT_TEMPLATES = DESIGN_TEMPLATES.filter((t) => t.scope !== 'achievements');

/** Başarılar sayfasındaki kayıttan panodaki hazır şablonlu slayt */
export function achievementDesign(
  a: { kind: 'month' | 'achievement'; name: string; className: string | null; title: string; description: string | null; photoUrl: string | null },
  monthLabel: string,
): AnnouncementDesign {
  return a.kind === 'month'
    ? {
        template: 'monthStudent',
        palette: 'amber',
        fields: { name: a.name, class: a.className ?? '', month: monthLabel, note: a.description || a.title, photo: a.photoUrl ?? '' },
      }
    : {
        template: 'achievement',
        palette: 'emerald',
        fields: { name: a.name + (a.className ? ` · ${a.className}` : ''), achievement: a.title, note: a.description ?? '', photo: a.photoUrl ?? '' },
      };
}

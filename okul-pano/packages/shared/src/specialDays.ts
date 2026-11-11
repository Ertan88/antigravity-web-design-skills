import { officialHolidays } from './holidays.ts';

/*
 * Mobil uygulamadaki özel gün mesajları: ana sayfanın üstünde ince şerit ve günde bir kez açılan pencere.
 * Kutlama ve anma günleri ayrıdır: anma günlerinde konfeti, "kutlu olsun" ve canlı renk kullanılmaz.
 * Okul her günü kapatabilir, başlığı / mesajı / görseli değiştirebilir (okul ayarları › specialDays).
 * Pano temaları (themes.ts) ayrıdır; bu liste yalnızca uygulamadaki mesajlar içindir.
 */

export type SpecialDayKind = 'celebration' | 'commemoration';
/** Pencerenin üstündeki çizim: bayrak, yas kurdelesi, kep, hilal, kar tanesi */
export type SpecialDayArt = 'flag' | 'ribbon' | 'cap' | 'crescent' | 'snow';

export interface SpecialDayDef {
  id: string;
  name: string;
  kind: SpecialDayKind;
  art: SpecialDayArt;
  /** Panelde gösterilen tarih açıklaması */
  when: string;
  /** Şeritte yazan kısa metin */
  strip: string;
  title: string;
  /** {yil}: Cumhuriyetin / olayın kaçıncı yılı (varsa) */
  message: string;
  /** Yıl sayımı için başlangıç yılı (ör. Cumhuriyet 1923) */
  sinceYear?: number;
  /** Şerit ve pencere renkleri */
  colors: { bg: string; fg: string };
}

const md = (iso: string) => iso.slice(5);

export const SPECIAL_DAYS: SpecialDayDef[] = [
  {
    id: 'republic',
    name: 'Cumhuriyet Bayramı',
    kind: 'celebration',
    art: 'flag',
    when: '29 Ekim',
    strip: '29 Ekim Cumhuriyet Bayramı',
    title: 'Cumhuriyet Bayramımız kutlu olsun',
    message: 'Cumhuriyetimizin {yil}. yılını gururla kutluyoruz. Bu güzel günde emeğiniz için teşekkür ederiz.',
    sinceYear: 1923,
    colors: { bg: '#c8102e', fg: '#ffffff' },
  },
  {
    id: 'ataturk',
    name: "Atatürk'ü Anma Günü",
    kind: 'commemoration',
    art: 'ribbon',
    when: '10 Kasım',
    strip: '10 Kasım · Saygıyla anıyoruz',
    title: 'Saygıyla anıyoruz',
    message: "Cumhuriyetimizin kurucusu Gazi Mustafa Kemal Atatürk'ü vefatının {yil}. yılında saygı, sevgi ve özlemle anıyoruz.",
    sinceYear: 1938,
    colors: { bg: '#27272a', fg: '#ffffff' },
  },
  {
    id: 'teachers',
    name: 'Öğretmenler Günü',
    kind: 'celebration',
    art: 'cap',
    when: '24 Kasım',
    strip: '24 Kasım Öğretmenler Günü',
    title: 'Öğretmenler Günümüz kutlu olsun',
    message: '“Öğretmenler, yeni nesil sizin eseriniz olacaktır.” Emeğiniz ve sabrınız için teşekkür ederiz.',
    colors: { bg: '#b45309', fg: '#ffffff' },
  },
  {
    id: 'anthem',
    name: "İstiklal Marşı'nın Kabulü",
    kind: 'commemoration',
    art: 'flag',
    when: '12 Mart',
    strip: "12 Mart İstiklal Marşı'nın Kabulü",
    title: "İstiklal Marşı'mızın kabulünün {yil}. yılı",
    message: "İstiklal Marşı'mızın kabulünün {yil}. yılında millî şairimiz Mehmet Akif Ersoy'u saygı ve rahmetle anıyoruz.",
    sinceYear: 1921,
    colors: { bg: '#3f3f46', fg: '#ffffff' },
  },
  {
    id: 'canakkale',
    name: 'Çanakkale Zaferi ve Şehitleri Anma Günü',
    kind: 'commemoration',
    art: 'flag',
    when: '18 Mart',
    strip: '18 Mart Çanakkale Zaferi',
    title: 'Şehitlerimizi rahmetle anıyoruz',
    message: 'Çanakkale Zaferi’nin {yil}. yılında başta Gazi Mustafa Kemal Atatürk olmak üzere bütün şehitlerimizi rahmet ve minnetle anıyoruz.',
    sinceYear: 1915,
    colors: { bg: '#3f3f46', fg: '#ffffff' },
  },
  {
    id: 'april23',
    name: 'Ulusal Egemenlik ve Çocuk Bayramı',
    kind: 'celebration',
    art: 'flag',
    when: '23 Nisan',
    strip: '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı',
    title: '23 Nisan kutlu olsun',
    message: 'Ulusal Egemenlik ve Çocuk Bayramımızın {yil}. yılını sevinçle kutluyoruz.',
    sinceYear: 1920,
    colors: { bg: '#c8102e', fg: '#ffffff' },
  },
  {
    id: 'may19',
    name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
    kind: 'celebration',
    art: 'flag',
    when: '19 Mayıs',
    strip: '19 Mayıs Gençlik ve Spor Bayramı',
    title: '19 Mayıs kutlu olsun',
    message: "Atatürk'ü Anma, Gençlik ve Spor Bayramımızın {yil}. yılını kutluyoruz.",
    sinceYear: 1919,
    colors: { bg: '#c8102e', fg: '#ffffff' },
  },
  {
    id: 'july15',
    name: 'Demokrasi ve Millî Birlik Günü',
    kind: 'commemoration',
    art: 'flag',
    when: '15 Temmuz',
    strip: '15 Temmuz Demokrasi ve Millî Birlik Günü',
    title: 'Şehitlerimizi rahmetle anıyoruz',
    message: '15 Temmuz Demokrasi ve Millî Birlik Günü’nde şehitlerimizi rahmetle, gazilerimizi minnetle anıyoruz.',
    colors: { bg: '#3f3f46', fg: '#ffffff' },
  },
  {
    id: 'victory',
    name: 'Zafer Bayramı',
    kind: 'celebration',
    art: 'flag',
    when: '30 Ağustos',
    strip: '30 Ağustos Zafer Bayramı',
    title: 'Zafer Bayramımız kutlu olsun',
    message: 'Büyük Zafer’in {yil}. yılını gururla kutluyoruz.',
    sinceYear: 1922,
    colors: { bg: '#c8102e', fg: '#ffffff' },
  },
  {
    id: 'ramazan',
    name: 'Ramazan Bayramı',
    kind: 'celebration',
    art: 'crescent',
    when: 'Arife ve bayram günleri',
    strip: 'Ramazan Bayramı',
    title: 'İyi bayramlar',
    message: 'Ramazan Bayramınızı kutlar, sevdiklerinizle birlikte sağlıklı ve huzurlu bir bayram dileriz.',
    colors: { bg: '#0f766e', fg: '#ffffff' },
  },
  {
    id: 'kurban',
    name: 'Kurban Bayramı',
    kind: 'celebration',
    art: 'crescent',
    when: 'Arife ve bayram günleri',
    strip: 'Kurban Bayramı',
    title: 'İyi bayramlar',
    message: 'Kurban Bayramınızı kutlar, sevdiklerinizle birlikte sağlıklı ve huzurlu bir bayram dileriz.',
    colors: { bg: '#166534', fg: '#ffffff' },
  },
  {
    id: 'newyear',
    name: 'Yeni Yıl',
    kind: 'celebration',
    art: 'snow',
    when: '31 Aralık – 1 Ocak',
    strip: 'Mutlu yıllar',
    title: 'Mutlu yıllar',
    message: 'Yeni yılın size ve ailenize sağlık, mutluluk ve başarı getirmesini dileriz.',
    colors: { bg: '#1e3a5f', fg: '#ffffff' },
  },
];

/** Okulun özel gün ayarları (okul ayarları › specialDays) */
export interface SpecialDaySettings {
  enabled: boolean;
  /** Pencerenin altındaki imza; boşsa "<okul adı> · Okul Müdürlüğü" */
  signature?: string;
  days?: Record<string, { enabled?: boolean; title?: string; message?: string; imageUrl?: string | null }>;
}

export interface ActiveSpecialDay {
  def: SpecialDayDef;
  /** Aynı kutlamanın tekrar gösterilmemesi için: "<id>:<yıl>" (bayram süresince aynı) */
  occurrence: string;
  title: string;
  message: string;
  strip: string;
  imageUrl: string | null;
}

/** Tarih o özel güne denk geliyor mu; dini bayramlarda arife ve bayram günleri */
function matches(def: SpecialDayDef, iso: string): boolean {
  const m = md(iso);
  switch (def.id) {
    case 'republic':
      return m === '10-29';
    case 'ataturk':
      return m === '11-10';
    case 'teachers':
      return m === '11-24';
    case 'anthem':
      return m === '03-12';
    case 'canakkale':
      return m === '03-18';
    case 'april23':
      return m === '04-23';
    case 'may19':
      return m === '05-19';
    case 'july15':
      return m === '07-15';
    case 'victory':
      return m === '08-30';
    case 'newyear':
      return m === '12-31' || m === '01-01';
    case 'ramazan':
    case 'kurban': {
      const name = officialHolidays(Number(iso.slice(0, 4))).get(iso);
      return Boolean(name?.startsWith(def.id === 'ramazan' ? 'Ramazan' : 'Kurban'));
    }
    default:
      return false;
  }
}

/** O günün özel günü (okul kapattıysa null); metinlerde {yil} doldurulur */
export function specialDayFor(iso: string, settings?: Partial<SpecialDaySettings> | null): ActiveSpecialDay | null {
  if (settings && settings.enabled === false) return null;
  const def = SPECIAL_DAYS.find((d) => matches(d, iso));
  if (!def) return null;
  const own = settings?.days?.[def.id];
  if (own?.enabled === false) return null;
  const year = Number(iso.slice(0, 4));
  // Yeni yıl 31 Aralık'ta başlar; 1 Ocak'ta da aynı kutlama sayılır
  const occurrenceYear = def.id === 'newyear' && md(iso) === '01-01' ? year - 1 : year;
  const fill = (t: string) => t.replaceAll('{yil}', def.sinceYear ? String(year - def.sinceYear) : '');
  return {
    def,
    occurrence: `${def.id}:${occurrenceYear}`,
    title: fill(own?.title?.trim() || def.title),
    message: fill(own?.message?.trim() || def.message),
    strip: def.strip,
    imageUrl: own?.imageUrl || null,
  };
}

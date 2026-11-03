/*
 * Meslek alanları: öğretmenin meslek öğretmeni olup olmadığı Öğretmen Kadrosu'ndaki branşından anlaşılır (e-Okul
 * "İşletmelerde Mesleki Eğitim" dersine öğretmen yazmaz). Bunun için MEB Mesleki ve Teknik Eğitim Genel Müdürlüğü'nün
 * Mesleki ve Teknik Anadolu Lisesi alan adları (ülke genelinde ortaktır, bir okula özgü değildir) ve sık kullanılan eski
 * ya da kısa branş adları tanınır. Okulun hangi alanları olduğu okulun kendi branş kayıtlarından gelir; okul tanınmayan
 * bir branşı meslek alanı olarak açabilir, yanlış tanınanı kapatabilir (teacher_branches.vocational).
 */

/** MTAL alan adları (MEB yazımıyla) */
export const MEB_VOCATIONAL_AREAS: readonly string[] = [
  'Adalet',
  'Aile ve Tüketici Hizmetleri',
  'Ayakkabı ve Saraciye Teknolojisi',
  'Bilişim Teknolojileri',
  'Biyomedikal Cihaz Teknolojileri',
  'Büro Yönetimi ve Yönetici Asistanlığı',
  'Çocuk Gelişimi ve Eğitimi',
  'Denizcilik',
  'Elektrik-Elektronik Teknolojisi',
  'Endüstriyel Otomasyon Teknolojileri',
  'Gazetecilik',
  'Gemi Yapımı',
  'Geleneksel El Sanatları',
  'Gıda Teknolojisi',
  'Grafik ve Fotoğraf',
  'Güzellik ve Saç Bakım Hizmetleri',
  'Halkla İlişkiler ve Organizasyon Hizmetleri',
  'Harita-Tapu-Kadastro',
  'Hasta ve Yaşlı Hizmetleri',
  'Hayvan Yetiştiriciliği ve Sağlığı',
  'İnşaat Teknolojisi',
  'İtfaiyecilik ve Yangın Güvenliği',
  'Kimya Teknolojisi',
  'Konaklama ve Seyahat Hizmetleri',
  'Kuyumculuk Teknolojisi',
  'Laboratuvar Hizmetleri',
  'Makine ve Tasarım Teknolojisi',
  'Matbaa Teknolojisi',
  'Metal Teknolojisi',
  'Metalürji Teknolojisi',
  'Mobilya ve İç Mekân Tasarımı',
  'Moda Tasarım Teknolojileri',
  'Motorlu Araçlar Teknolojisi',
  'Muhasebe ve Finansman',
  'Müzik Aletleri Yapımı',
  'Pazarlama ve Perakende',
  'Plastik Teknolojisi',
  'Radyo-Televizyon',
  'Raylı Sistemler Teknolojisi',
  'Sağlık Hizmetleri',
  'Sanat ve Tasarım',
  'Seramik ve Cam Teknolojisi',
  'Siber Güvenlik',
  'Su Ürünleri',
  'Tarım',
  'Tekstil Teknolojisi',
  'Tesisat Teknolojisi ve İklimlendirme',
  'Uçak Bakım',
  'Ulaştırma Hizmetleri',
  'Yenilenebilir Enerji Teknolojileri',
  'Yiyecek İçecek Hizmetleri',
  'Lojistik',
  'Bahçecilik',
  'Ormancılık',
];

/** Okullarda hâlâ kullanılan eski ya da kısa meslek branş adları */
const LEGACY_NAMES: readonly string[] = [
  'Elektrik',
  'Elektronik',
  'Elektrik Elektronik',
  'Elektromekanik',
  'Makine',
  'Makine Teknolojisi',
  'Motor',
  'Motorlu Araçlar',
  'Otomotiv',
  'Ağaç İşleri',
  'Mobilya ve Dekorasyon',
  'Mobilya',
  'Tesisat',
  'Tesisat Teknolojisi',
  'Isıtma ve Tesisat',
  'Bilgisayar',
  'Bilgisayar Teknolojileri',
  'Muhasebe',
  'Büro Yönetimi',
  'Sekreterlik',
  'Tesviye',
  'Döküm',
  'Kaynak',
  'Metal İşleri',
  'Metal',
  'Yapı',
  'İnşaat',
  'Hazır Giyim',
  'Giyim',
  'Moda Tasarımı',
  'Giyim Üretim Teknolojisi',
  'Çocuk Gelişimi',
  'Ev Ekonomisi',
  'Gıda',
  'Turizm',
  'Turizm ve Otelcilik',
  'Konaklama',
  'Yiyecek İçecek',
  'Aşçılık',
  'Güzellik Hizmetleri',
  'Kuaförlük',
  'Pazarlama',
  'Halkla İlişkiler',
  'Grafik',
  'Fotoğrafçılık',
  'Matbaa',
  'Endüstriyel Otomasyon',
  'Mekatronik',
  'Sağlık',
  'Hemşirelik',
  'Tarım Teknolojileri',
  'Seramik',
  'Kuyumculuk',
  'Denizcilik ve Gemi Yapımı',
];

/**
 * Kültür dersi branşları: tam adıyla meslek alanı sayılmaz ("Kimya" kültür dersi, "Kimya Teknolojisi" meslek alanı).
 * Ortaokul branşları da buradadır ("Teknoloji ve Tasarım" ≠ "Makine ve Tasarım Teknolojisi").
 */
const CULTURE_NAMES: readonly string[] = [
  'Kimya',
  'Fizik',
  'Biyoloji',
  'Matematik',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'Türk Dili ve Edebiyatı',
  'Türkçe',
  'Edebiyat',
  'İngilizce',
  'Almanca',
  'Fransızca',
  'Arapça',
  'Rusça',
  'İspanyolca',
  'Yabancı Dil',
  'Din Kültürü ve Ahlak Bilgisi',
  'Din Kültürü',
  'Beden Eğitimi',
  'Beden Eğitimi ve Spor',
  'Görsel Sanatlar',
  'Resim',
  'Müzik',
  'Rehberlik',
  'Rehberlik ve Psikolojik Danışmanlık',
  'Psikolojik Danışma ve Rehberlik',
  'Teknoloji ve Tasarım',
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'Sınıf Öğretmenliği',
  'Okul Öncesi',
  'Özel Eğitim',
  'Sağlık Bilgisi',
  'Sağlık Bilgisi ve Trafik Kültürü',
  'Bilişim Teknolojileri ve Yazılım',
];

/** Eşleştirmede anlam taşımayan sözcükler */
const STOP = new Set(['ve', 'ile', 'teknolojisi', 'teknolojileri', 'teknoloji', 'tek', 'hizmetleri', 'hizmeti', 'alanı', 'alan', 'öğretmeni', 'öğretmenliği', 'öğr', 'öğrt', 'dersleri', 'meslek']);

/** Unvan ekleri (kültür dersi karşılaştırmasında da atılır) */
const TITLE = new Set(['öğretmeni', 'öğretmenliği', 'öğr', 'öğrt', 'alanı', 'alan']);

/** "Mobilya ve İç Mekân Tasarımı Öğretmeni" -> ["mobilya", "iç", "mekan", "tasarımı"] */
export function branchTokens(name: string, stop: ReadonlySet<string> = STOP): string[] {
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/[âà]/g, 'a')
    .replace(/[îì]/g, 'i')
    .replace(/[ûù]/g, 'u')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !stop.has(w));
}

const key = (tokens: readonly string[]) => [...tokens].sort().join(' ');

// Kültür dersleri yalnızca unvan ekleri atılarak karşılaştırılır: "Kimya" ≠ "Kimya Teknolojisi"
const CULTURE = new Set(CULTURE_NAMES.map((n) => key(branchTokens(n, TITLE))));
const KNOWN = [...MEB_VOCATIONAL_AREAS, ...LEGACY_NAMES].map((n) => ({ name: n, tokens: branchTokens(n) }));
const KNOWN_KEYS = new Set(KNOWN.map((k) => key(k.tokens)));

/**
 * Branş adı bir meslek alanı mı: MEB alan adı ya da bilinen eski / kısa adla aynıysa (ekler ve noktalama yok sayılır)
 * ya da en az iki sözcüklü bir alan adının bütün sözcüklerini içeriyorsa ("Elektrik-Elektronik Tek. (Elektrik)").
 * Kültür dersi branşları tam adıyla dışarıda kalır.
 */
export function isVocationalBranchName(name: string): boolean {
  const tokens = branchTokens(name);
  if (!tokens.length) return false;
  if (CULTURE.has(key(branchTokens(name, TITLE)))) return false;
  const k = key(tokens);
  if (KNOWN_KEYS.has(k)) return true;
  const have = new Set(tokens);
  return KNOWN.some((a) => a.tokens.length >= 2 && a.tokens.every((t) => have.has(t)));
}

/** Okulun ayarı (true / false) varsa o, yoksa addan tanıma */
export const branchIsVocational = (b: { name: string; vocational?: boolean | null }) => b.vocational ?? isVocationalBranchName(b.name);

/**
 * Panonun üst barı için okul adını iki satıra böler: "MUAMMER KOCATÜRK" / "MESLEKİ VE TEKNİK ANADOLU LİSESİ".
 * Ayarlarda okul türü girilmişse o kullanılır; girilmemişse addaki bilinen tür ekinden (en uzunu) tahmin edilir.
 */
export const SCHOOL_TYPES = [
  'Mesleki ve Teknik Anadolu Lisesi',
  'Çok Programlı Anadolu Lisesi',
  'Anadolu İmam Hatip Lisesi',
  'Sosyal Bilimler Lisesi',
  'Güzel Sanatlar Lisesi',
  'Mesleki Eğitim Merkezi',
  'İmam Hatip Ortaokulu',
  'Bilim ve Sanat Merkezi',
  'Rehberlik ve Araştırma Merkezi',
  'Halk Eğitim Merkezi',
  'Olgunlaşma Enstitüsü',
  'Özel Eğitim Uygulama Okulu',
  'Özel Eğitim Meslek Okulu',
  'Özel Eğitim Anaokulu',
  'Özel Eğitim Okulu',
  'Açık Öğretim Lisesi',
  'Anadolu Lisesi',
  'Fen Lisesi',
  'Spor Lisesi',
  'Ortaokulu',
  'İlkokulu',
  'Anaokulu',
  'Koleji',
  'Lisesi',
];

/**
 * Ayarlarda ve kayıtta açılır kutuda gösterilen MEB kurum türleri (kademe sırasıyla). Listede olmayan tür
 * "Diğer (kendim yazayım)" ile elle yazılır; addan tür ayırmada SCHOOL_TYPES (genel ekler dahil) kullanılır.
 */
export const SCHOOL_TYPE_OPTIONS = [
  'Anaokulu',
  'İlkokulu',
  'Ortaokulu',
  'İmam Hatip Ortaokulu',
  'Anadolu Lisesi',
  'Fen Lisesi',
  'Sosyal Bilimler Lisesi',
  'Anadolu İmam Hatip Lisesi',
  'Mesleki ve Teknik Anadolu Lisesi',
  'Çok Programlı Anadolu Lisesi',
  'Güzel Sanatlar Lisesi',
  'Spor Lisesi',
  'Açık Öğretim Lisesi',
  'Mesleki Eğitim Merkezi',
  'Özel Eğitim Anaokulu',
  'Özel Eğitim Uygulama Okulu',
  'Özel Eğitim Meslek Okulu',
  'Bilim ve Sanat Merkezi',
  'Rehberlik ve Araştırma Merkezi',
  'Halk Eğitim Merkezi',
  'Olgunlaşma Enstitüsü',
  'Koleji',
];

/** Okul adlarında sık yazılan kısaltmalar: "… MTAL" -> Mesleki ve Teknik Anadolu Lisesi */
const ABBREVIATIONS: Record<string, string> = {
  mtal: 'Mesleki ve Teknik Anadolu Lisesi',
  çpal: 'Çok Programlı Anadolu Lisesi',
  aihl: 'Anadolu İmam Hatip Lisesi',
  aıhl: 'Anadolu İmam Hatip Lisesi',
  sbl: 'Sosyal Bilimler Lisesi',
  gsl: 'Güzel Sanatlar Lisesi',
  mem: 'Mesleki Eğitim Merkezi',
  iho: 'İmam Hatip Ortaokulu',
  bilsem: 'Bilim ve Sanat Merkezi',
  ram: 'Rehberlik ve Araştırma Merkezi',
  hem: 'Halk Eğitim Merkezi',
  al: 'Anadolu Lisesi',
  fl: 'Fen Lisesi',
};

const lower = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

export function splitSchoolName(fullName: string, schoolType?: string | null): { name: string; type: string | null } {
  const name = fullName.trim().replace(/\s+/g, ' ');
  const typed = schoolType?.trim();
  if (typed) {
    // Ad, türü de içeriyorsa ikinci satırda tekrar etmesin
    const n = lower(name);
    const t = lower(typed);
    const base = n.endsWith(t) && n.length > t.length ? name.slice(0, name.length - typed.length).trim() : name;
    return { name: base, type: typed };
  }
  const n = lower(name);
  const last = n.split(' ').pop()!.replace(/\./g, '');
  if (n.includes(' ') && ABBREVIATIONS[last]) {
    return { name: name.slice(0, name.lastIndexOf(' ')).trim(), type: ABBREVIATIONS[last] };
  }
  for (const type of SCHOOL_TYPES) {
    const t = lower(type);
    if (n.endsWith(` ${t}`)) {
      const cut = name.length - t.length;
      return { name: name.slice(0, cut).trim(), type: name.slice(cut).trim() };
    }
  }
  return { name, type: null };
}

/** Mesleki Eğitim Merkezi (MESEM) mi: Okul Ayarları'ndaki okul türünden, girilmemişse addan ("… MEM", "… MESEM") */
export function isMesem(fullName: string, schoolType?: string | null): boolean {
  const t = lower(splitSchoolName(fullName, schoolType).type ?? '');
  return t === 'mesleki eğitim merkezi' || t === 'mesem' || /mesleki eğitim merkez/.test(t) || /\bmesem$/.test(lower(fullName));
}

/** Okulun tam adı türüyle birlikte (ör. "Atatürk" + "Mesleki ve Teknik Anadolu Lisesi"); belgelerde ve başlıklarda */
export function schoolFullName(fullName: string, schoolType?: string | null): string {
  const t = splitSchoolName(fullName, schoolType);
  return t.type ? `${t.name} ${t.type}` : t.name;
}

/** Okul türünün kısaltması (mobil başlık gibi dar yerler için); bilinmeyen tür olduğu gibi kalır */
const TYPE_ABBR: Record<string, string> = {
  'mesleki ve teknik anadolu lisesi': 'MTAL',
  'çok programlı anadolu lisesi': 'ÇPAL',
  'anadolu imam hatip lisesi': 'AİHL',
  'sosyal bilimler lisesi': 'SBL',
  'güzel sanatlar lisesi': 'GSL',
  'mesleki eğitim merkezi': 'MEM',
  'imam hatip ortaokulu': 'İHO',
  'bilim ve sanat merkezi': 'BİLSEM',
  'rehberlik ve araştırma merkezi': 'RAM',
  'halk eğitim merkezi': 'HEM',
  'anadolu lisesi': 'AL',
  'fen lisesi': 'FL',
  'spor lisesi': 'SL',
  ortaokulu: 'OO',
  ilkokulu: 'İO',
};
export const schoolTypeAbbr = (type: string) => TYPE_ABBR[lower(type)] ?? type.trim();

/**
 * Kısa okul adı: ad + kısaltılmış tür ("Develi" + "Mesleki ve Teknik Anadolu Lisesi" → "Develi MTAL").
 * Tür Genel Ayarlar'dan (okul türü) gelir; girilmemişse addan ayrılır. "Müdürlüğü" eki yazılmaz.
 */
export function shortSchoolName(fullName: string, schoolType?: string | null): string {
  const cleaned = fullName.trim().replace(/\s+(müdürlüğü|MÜDÜRLÜĞÜ|Müdürlüğü)$/u, '');
  const t = splitSchoolName(cleaned, schoolType);
  return t.type ? `${t.name} ${schoolTypeAbbr(t.type)}`.trim() : t.name;
}

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
  'Özel Eğitim Okulu',
  'Anadolu Lisesi',
  'Fen Lisesi',
  'Spor Lisesi',
  'Ortaokulu',
  'İlkokulu',
  'Anaokulu',
  'Koleji',
  'Lisesi',
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

/** Okulun tam adı türüyle birlikte (ör. "Atatürk" + "Mesleki ve Teknik Anadolu Lisesi"); belgelerde ve başlıklarda */
export function schoolFullName(fullName: string, schoolType?: string | null): string {
  const t = splitSchoolName(fullName, schoolType);
  return t.type ? `${t.name} ${t.type}` : t.name;
}

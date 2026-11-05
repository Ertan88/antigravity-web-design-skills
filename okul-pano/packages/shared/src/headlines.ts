/**
 * RSS başlıklarını süzme: "Yalnızca öğrencileri ilgilendirenler" seçilirse öğrenci, sınav, tatil,
 * karne gibi kelimeleri içeren başlıklar alınır; atama, ihale, personel gibi yalnızca yöneticileri
 * ilgilendiren başlıklar atılır. Okul kendi kelimelerini de ekleyebilir. Liste genel tutuldu
 * (hiçbir okula, ile ya da ilçeye özel değil).
 */
const STUDENT_WORDS = [
  'öğrenci', 'sınav', 'lgs', 'yks', 'tyt', 'ayt', 'ydt', 'ösym', 'karne', 'tatil', 'yarıyıl', 'ara tatil', 'burs',
  'kayıt', 'nakil', 'yarışma', 'olimpiyat', 'ders', 'müfredat', 'eğitim öğretim', 'eğitim-öğretim', 'çalışma takvimi',
  'okul', 'mezun', 'tercih', 'e-okul', 'bilim', 'kitap', 'gençlik', 'çocuk', 'sınıf',
];
const STAFF_WORDS = [
  'atama', 'ataması', 'ihale', 'personel', 'sözleşmeli', 'norm kadro', 'görevde yükselme', 'kadro', 'maaş', 'disiplin',
  'yönetici görevlendirme', 'il müdürü', 'müdür yardımcısı', 'ücretli öğretmen', 'mülakat',
];

const fold = (s: string) => s.toLocaleLowerCase('tr-TR');
const has = (title: string, words: string[]) => words.some((w) => w && fold(title).includes(fold(w)));

export function parseKeywords(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

export function filterHeadlines(titles: string[], opts: { audience: 'all' | 'students'; keywords: string }): string[] {
  const own = parseKeywords(opts.keywords);
  return titles.filter((t) => {
    if (opts.audience === 'students' && (has(t, STAFF_WORDS) || !has(t, STUDENT_WORDS))) return false;
    if (own.length && !has(t, own)) return false;
    return true;
  });
}

/** Öğretmen kadrosu için ortak yardımcılar: önerilen listeler ve Türkçe'ye uygun ad karşılaştırma. */

/** Yeni okullara önerilen branşlar (MEB branş adlarına göre) */
export const DEFAULT_BRANCHES = [
  'Almanca',
  'Beden Eğitimi ve Spor',
  'Bilişim Teknolojileri',
  'Biyoloji',
  'Coğrafya',
  'Din Kültürü ve Ahlak Bilgisi',
  'Felsefe',
  'Fen Bilimleri',
  'Fizik',
  'Görsel Sanatlar',
  'İngilizce',
  'Kimya',
  'Matematik',
  'Müzik',
  'Okul Öncesi',
  'Özel Eğitim',
  'Rehberlik ve Psikolojik Danışmanlık',
  'Sınıf Öğretmenliği',
  'Sosyal Bilgiler',
  'Tarih',
  'Teknoloji ve Tasarım',
  'Türk Dili ve Edebiyatı',
  'Türkçe',
] as const;

/** Yeni okullara önerilen ünvanlar (Öğretmenlik Meslek Kanunu kariyer basamakları ve idari görevler) */
export const DEFAULT_TITLES = [
  'Öğretmen',
  'Uzman Öğretmen',
  'Başöğretmen',
  'Aday Öğretmen',
  'Sözleşmeli Öğretmen',
  'Ücretli Öğretmen',
  'Okul Müdürü',
  'Müdür Başyardımcısı',
  'Müdür Yardımcısı',
] as const;

/** "  ayşe   DEMİR " ve "Ayşe Demir" aynı kişi sayılır: boşluk ve büyük/küçük harf (Türkçe kurallarıyla) yok sayılır. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

/** Fazla boşlukları temizler; yazımı değiştirmez. */
export function tidyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Türkçe alfabeye göre sıralama karşılaştırıcısı (Ç, Ğ, İ, Ö, Ş, Ü doğru yerde) */
export const trCompare = (a: string, b: string): number => a.localeCompare(b, 'tr-TR', { sensitivity: 'base' });

/** Soyadına göre sıralama için: son kelime */
export function surnameOf(fullName: string): string {
  const parts = tidyName(fullName).split(' ');
  return parts[parts.length - 1] ?? '';
}

/**
 * Sınıf adlarını tek biçime getirir: "9/a", "9 A", "9A", "9. Sınıf A Şubesi" -> "9-A".
 * Tanınmayan biçimler (ör. "Anasınıfı") yalnızca boşlukları düzeltilip büyük harfe çevrilir.
 */
export function normalizeClassName(raw: string): string {
  const upper = raw.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
  const stripped = upper
    // \b Türkçe harfleri (Ş, İ) kelime karakteri saymadığı için Unicode harf sınıfıyla sınır kontrolü
    .replace(/(?<!\p{L})(SINIFI|SINIF|ŞUBESİ|ŞUBE)(?!\p{L})/gu, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(\d{1,2})\s*[-/ ]?\s*([A-ZÇĞİÖŞÜ])$/u.exec(stripped);
  return m ? `${m[1]}-${m[2]}` : upper;
}

/**
 * İşletmelerde mesleki eğitim dersi mi ("İşletmelerde Mesleki Eğitim", "İşletmede Beceri Eğitimi"): öğrenci o saatlerde
 * okulda değil işletmededir (pano "Şu an derste" kartında gösterilmez, ders programı ve devam çizelgesi bundan anlar).
 */
export function isInternshipSubject(subject: string): boolean {
  const s = subject.toLocaleLowerCase('tr-TR');
  return /işletme(lerde|de)\s+(mesleki|beceri)\s+eğitim/.test(s);
}

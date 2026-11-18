/**
 * Şifre gücü: 0–4 puan ve kullanıcıya bir sonraki adımı söyleyen ipucu.
 * Uzunluk, karakter çeşitliliği ve bariz zayıf kalıplar değerlendirilir.
 */
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Çok zayıf' | 'Zayıf' | 'Orta güçte' | 'İyi' | 'Güçlü';
  hint: string | null;
}

const COMMON = ['123456', '12345678', 'password', 'sifre', 'şifre', 'qwerty', '111111', 'payflow'];

export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: 'Çok zayıf', hint: 'En az 8 karakter kullan' };
  const lower = pw.toLocaleLowerCase('tr-TR');
  if (COMMON.some((c) => lower.includes(c)) || /^(.)\1+$/.test(pw)) {
    return { score: 0, label: 'Çok zayıf', hint: 'Tahmin edilmesi kolay; farklı bir şifre seç' };
  }
  const kinds = [/[a-zçğıöşü]/, /[A-ZÇĞİÖŞÜ]/, /\d/, /[^A-Za-z0-9çğıöşüÇĞİÖŞÜ]/].filter((r) => r.test(pw)).length;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (kinds >= 2) score++;
  if (kinds >= 3) score++;
  if (pw.length < 8) score = Math.min(score, 1);

  const s = score as PasswordStrength['score'];
  const label = (['Çok zayıf', 'Zayıf', 'Orta güçte', 'İyi', 'Güçlü'] as const)[s];
  let hint: string | null = null;
  if (pw.length < 8) hint = 'En az 8 karakter kullan';
  else if (!/\d/.test(pw)) hint = 'Bir rakam ekle';
  else if (!/[^A-Za-z0-9çğıöşüÇĞİÖŞÜ]/.test(pw)) hint = 'Bir sembol ekle (ör. !) → güçlü şifre';
  else if (pw.length < 12) hint = '12 karaktere çıkarırsan daha güçlü olur';
  return { score: s, label, hint };
}

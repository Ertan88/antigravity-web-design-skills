import { Kurus } from './money';

/**
 * Kullanıcının yazdığı tutarı kuruşa çevirir. Türkçe biçimi esas alır:
 *  "1.234,56" → 123456 · "845,3" → 84530 · "1500" → 150000 · "₺ 12.507" → 1250700
 * Tek nokta ve 1–2 haneli kesir varsa ("845.30") ondalık kabul edilir.
 * Geçersiz girdide null döner.
 */
export function parseAmount(input: string): Kurus | null {
  let s = input.replace(/[₺\s]/g, '').replace(/^TL|TL$/i, '');
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = (s.match(/\./g) ?? []).length;
    const decimalDot = dots === 1 && /\.\d{1,2}$/.test(s);
    if (!decimalDot) s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/**
 * Tuş takımı girişi: metin durumunu bir tuşla günceller.
 * Virgülden sonra en fazla 2 hane, başta gereksiz sıfır yok, 9 haneli lira sınırı.
 */
export function applyKey(current: string, key: string): string {
  if (key === '⌫') return current.slice(0, -1);
  if (key === ',') {
    if (current.includes(',')) return current;
    return (current || '0') + ',';
  }
  if (!/^\d$/.test(key)) return current;
  const [whole, frac] = current.split(',');
  if (frac !== undefined) return frac.length >= 2 ? current : current + key;
  if (whole === '0') return key;
  if (whole.length >= 9) return current;
  return current + key;
}

/** Tuş takımı metnini ekranda binlik ayırıcıyla gösterir: "12507,5" → "12.507,5" */
export function displayKeypad(current: string): string {
  if (!current) return '0';
  const [whole, frac] = current.split(',');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac === undefined ? grouped : `${grouped},${frac}`;
}

/** Aylık faiz yüzdesi: "3,11" veya "%3.11" → 0.0311 (0–20 arası). */
export function parseRate(s: string): number | null {
  const t = s.replace(/[%\s]/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n < 20 ? n / 100 : null;
}

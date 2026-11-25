import { zonedParts } from '@okulpano/shared';

/*
 * Gece sessiz saatleri: dakikalık işler (sınav hatırlatması, pano kopma bildirimi) seyrek çalışır, açık pano
 * bağlantıları son görülmeyi seyrek yazar. Böylece veritabanı gece boşta kalır.
 * - Ders ve akşam kursu olmayan saatlerdir; bütün okullarda aynıdır (okula özgü değildir).
 * - Hafta sonu sessiz sayılmaz: cumartesi sınav ve kurs olabilir; zil penceresi zaten okul gününe bakar.
 * - Kopma bildirimi gece hiç gönderilmez (ders saati dışı), bu yüzden seyrek yazmak bildirimi değiştirmez.
 */

/** Sessiz saatlerin başı ve sonu (yerel saat, sonu hariç) */
export const QUIET_FROM_HOUR = 23;
export const QUIET_TO_HOUR = 5;
/** Sessiz saatlerde dakikalık işlerin aralığı */
export const QUIET_INTERVAL_MS = 15 * 60_000;
/** Sessiz saatlerde açık pano bağlantısının son görülmeyi yazma aralığı (gündüz dakikada bir) */
export const QUIET_TOUCH_MS = 10 * 60_000;

/** Platformun saat dilimi: okullar kendi dilimini ayardan alır; yoksa Türkiye */
const QUIET_TZ = process.env.QUIET_HOURS_TZ || 'Europe/Istanbul';

export function isQuietHour(now: Date, timeZone = QUIET_TZ): boolean {
  const { hour } = zonedParts(now, timeZone);
  return hour >= QUIET_FROM_HOUR || hour < QUIET_TO_HOUR;
}

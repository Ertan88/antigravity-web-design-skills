/**
 * Duyurunun panoda kalma süresi.
 * - Süre elle girilmediyse metnin uzunluğuna göre hesaplanır (okuma süresi): kısa duyuru okulun varsayılan
 *   süresinde kalır, uzun duyuru daha uzun kalır; en çok okulun üst sınırı kadar (varsayılan 60 sn).
 * - Elle girilen süre üst sınırı aşarsa duyuru onaylayıcının onayına düşer (sunucu; onaylayıcı ekleyince düşmez).
 * Video duyuruları videonun kendi süresince kalır; bu hesap onlara uygulanmaz.
 */

/** Panodan okuma hızı: saniyede yaklaşık 2,2 kelime (uzaktan, ayakta okuma) ve göz gezdirme payı */
const WORDS_PER_SECOND = 2.2;
const LEAD_IN_SEC = 3;

export const DEFAULT_SLIDE_MAX_SEC = 60;

type SlideText = {
  title?: string | null;
  body?: string | null;
  design?: { fields?: Record<string, string> } | null;
};

/** Duyurudaki okunacak metnin kelime sayısı (başlık, metin, hazır tasarımın alanları) */
export function slideWordCount(s: SlideText): number {
  const parts = [s.title ?? '', s.body ?? '', ...Object.values(s.design?.fields ?? {})];
  return parts
    .join(' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Metnin okunması için gereken süre (saniye) */
export function readingSeconds(s: SlideText): number {
  const words = slideWordCount(s);
  return words ? Math.ceil(words / WORDS_PER_SECOND) + LEAD_IN_SEC : 0;
}

/**
 * Süresi girilmemiş (metin, görsel, tasarım) duyurunun panodaki süresi: okulun varsayılanından kısa olmaz,
 * okulun üst sınırından uzun olmaz.
 */
export function autoSlideSeconds(s: SlideText, defaultSec: number, maxSec: number = DEFAULT_SLIDE_MAX_SEC): number {
  const cap = Math.max(defaultSec, maxSec);
  return Math.min(cap, Math.max(defaultSec, readingSeconds(s)));
}

/** Panodaki gerçek süre: elle girildiyse o, girilmediyse okuma süresi */
export function slideSeconds(s: SlideText & { durationSec?: number | null }, defaultSec: number, maxSec: number = DEFAULT_SLIDE_MAX_SEC): number {
  return s.durationSec ?? autoSlideSeconds(s, defaultSec, maxSec);
}

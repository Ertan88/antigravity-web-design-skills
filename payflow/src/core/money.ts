/**
 * Para birimi yardımcıları.
 * Tüm tutarlar uygulama içinde KURUŞ cinsinden tam sayı (integer) olarak tutulur.
 * Böylece 0.1 + 0.2 gibi kayan nokta hataları ekstre toplamlarına sızmaz.
 */
export type Kurus = number;

export const tl = (lira: number): Kurus => Math.round(lira * 100);

export const toLira = (k: Kurus): number => k / 100;

/** Yüzdeyi kuruşa uygular ve en yakın kuruşa yuvarlar. */
export const applyRate = (amount: Kurus, rate: number): Kurus => Math.round(amount * rate);

const formatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 2425380 -> "₺24.253,80" ; negatifler "−₺1.421,50" */
export function formatTL(k: Kurus): string {
  const sign = k < 0 ? '−' : '';
  return `${sign}₺${formatter.format(Math.abs(k) / 100)}`;
}

export const sum = (values: Kurus[]): Kurus => values.reduce((a, b) => a + b, 0);

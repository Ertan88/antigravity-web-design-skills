import { Kurus, tl } from '../money';

/**
 * TCMB kredi kartı azami faiz oranları (aylık, TL, bireysel).
 * Kaynak: TCMB duyurusu, 1 Kasım 2026'dan itibaren geçerli (Ekim 2026'ya göre değişmedi).
 * Bunlar TAVAN oranlardır; bankalar altında oran uygulayabilir. Kullanıcı kart bazında
 * kendi oranını girebilir (CardRateOverride). Tablo her ay güncellenmelidir.
 */
export interface RateTier {
  /** Bu kademenin üst sınırı (dahil değil). null = sınırsız. */
  upTo: Kurus | null;
  contractual: number; // akdi faiz, aylık
  late: number; // gecikme faizi, aylık
}

export interface RateTable {
  effectiveFrom: string; // ISO tarih
  tiers: RateTier[];
  cashAdvance: number; // nakit çekim / avans aylık akdi faiz
}

export const TCMB_RATES_2026_11: RateTable = {
  effectiveFrom: '2026-11-01',
  tiers: [
    { upTo: tl(30_000), contractual: 0.0325, late: 0.0355 },
    { upTo: tl(180_000), contractual: 0.0375, late: 0.0405 },
    { upTo: null, contractual: 0.0425, late: 0.0455 },
  ],
  cashAdvance: 0.0425,
};

/** Faiz üzerinden alınan vergiler: KKDF %15 + BSMV %15. */
export const KKDF = 0.15;
export const BSMV = 0.15;
export const INTEREST_TAX_MULTIPLIER = 1 + KKDF + BSMV;

export interface CardRateOverride {
  contractual?: number;
  late?: number;
}

/** Dönem borcuna göre kademeyi seçer; kullanıcı kart oranı girdiyse onu kullanır. */
export function ratesFor(
  periodDebt: Kurus,
  override: CardRateOverride = {},
  table: RateTable = TCMB_RATES_2026_11,
): { contractual: number; late: number } {
  const tier =
    table.tiers.find((t) => t.upTo === null || periodDebt < t.upTo) ??
    table.tiers[table.tiers.length - 1];
  return {
    contractual: override.contractual ?? tier.contractual,
    late: override.late ?? tier.late,
  };
}

/**
 * Asgari ödeme oranı (BDDK): kart limiti 50.000 TL altında %20, üstünde %40.
 * Not: Yeni verilen kartlarda ilk yıl %40 uygulanır; bunu kart ayarı ile işaretleriz.
 */
export function minimumPaymentRate(limit: Kurus, isFirstYearCard = false): number {
  if (isFirstYearCard) return 0.4;
  return limit < tl(50_000) ? 0.2 : 0.4;
}

import { Kurus, applyRate, sum } from '../money';
import { BSMV, KKDF, CardRateOverride, minimumPaymentRate, ratesFor } from './rates';

/**
 * Bir kredi kartı ekstresini, bir önceki ekstre ve o ekstreye yapılan ödemelerden
 * hareketle TAHMİNİ olarak hesaplar.
 *
 * Mantık (Türkiye uygulaması, sadeleştirilmiş):
 *  - Önceki ekstrenin tamamı son ödeme tarihine kadar ödendiyse faiz yoktur.
 *  - Eksik ödenen kısım bir sonraki ekstreye DEVREDER.
 *  - Ödenmeyen kısmın asgari tutara kadar olan bölümüne GECİKME faizi,
 *    geri kalanına AKDİ faiz uygulanır.
 *  - Faiz tutarına %15 KKDF + %15 BSMV eklenir.
 *  - Bankalar faizi günlük işletir; burada `interestDays / 30` oranı ile yaklaşık hesaplarız.
 */
export interface PreviousStatement {
  total: Kurus; // önceki dönem borcu
  minimum: Kurus; // önceki asgari ödeme
  paid: Kurus; // son ödeme tarihine kadar yapılan toplam ödeme
}

export interface StatementInput {
  previous?: PreviousStatement;
  purchases: Kurus[]; // bu döneme ait tek çekim harcamalar
  installmentsDue: Kurus[]; // bu döneme düşen taksit tutarları
  fees?: Kurus[]; // kart aidatı vb.
  refunds?: Kurus[]; // iadeler (pozitif sayı olarak)
  limit: Kurus;
  isFirstYearCard?: boolean;
  rateOverride?: CardRateOverride;
  interestDays?: number; // varsayılan 30
}

export interface StatementResult {
  carriedPrincipal: Kurus; // devreden anapara
  contractualInterest: Kurus;
  lateInterest: Kurus;
  kkdf: Kurus;
  bsmv: Kurus;
  carriedTotal: Kurus; // devreden + faiz + vergiler
  newSpending: Kurus; // tek çekim + taksitler + ücretler - iadeler
  total: Kurus; // yeni dönem borcu
  minimum: Kurus; // yeni asgari ödeme
  minimumRate: number;
  appliedRates: { contractual: number; late: number };
  /** Tamamı ödenmezse, her geçen gün işleyecek tahmini faiz (vergiler dahil). */
  dailyInterestIfUnpaid: Kurus;
}

export function computeStatement(input: StatementInput): StatementResult {
  const days = input.interestDays ?? 30;
  const prev = input.previous;

  let carriedPrincipal = 0;
  let unpaidMinimum = 0;
  if (prev) {
    carriedPrincipal = Math.max(0, prev.total - prev.paid);
    unpaidMinimum = Math.min(carriedPrincipal, Math.max(0, prev.minimum - prev.paid));
  }

  // Kademe, faizin işlediği dönem borcuna (önceki ekstre toplamına) göre belirlenir.
  const appliedRates = ratesFor(prev?.total ?? 0, input.rateOverride);
  const period = days / 30;

  const contractualBase = carriedPrincipal - unpaidMinimum;
  const contractualInterest = applyRate(contractualBase, appliedRates.contractual * period);
  const lateInterest = applyRate(unpaidMinimum, appliedRates.late * period);
  const interest = contractualInterest + lateInterest;
  const kkdf = applyRate(interest, KKDF);
  const bsmv = applyRate(interest, BSMV);
  const carriedTotal = carriedPrincipal + interest + kkdf + bsmv;

  const newSpending =
    sum(input.purchases) +
    sum(input.installmentsDue) +
    sum(input.fees ?? []) -
    sum(input.refunds ?? []);

  const total = Math.max(0, carriedTotal + newSpending);
  const minimumRate = minimumPaymentRate(input.limit, input.isFirstYearCard);
  const minimum = Math.min(total, applyRate(total, minimumRate));

  const nextRates = ratesFor(total, input.rateOverride);
  const dailyInterestIfUnpaid = applyRate(
    total,
    (nextRates.contractual / 30) * (1 + KKDF + BSMV),
  );

  return {
    carriedPrincipal,
    contractualInterest,
    lateInterest,
    kkdf,
    bsmv,
    carriedTotal,
    newSpending,
    total,
    minimum,
    minimumRate,
    appliedRates,
    dailyInterestIfUnpaid,
  };
}

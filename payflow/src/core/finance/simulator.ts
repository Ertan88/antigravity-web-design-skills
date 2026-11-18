import { Kurus, applyRate } from '../money';
import { BSMV, KKDF } from './rates';

/**
 * Asgari Tuzağı Simülatörü: yeni harcama yapılmadığı varsayımıyla borcun kaç ayda
 * biteceğini ve toplam faizi (vergiler dahil) hesaplar.
 */
export interface PayoffResult {
  months: number; // ödeme sayısı; maxMonths'a ulaştıysa bitmedi demektir
  finished: boolean;
  totalInterest: Kurus; // KKDF + BSMV dahil
  totalPaid: Kurus;
  balances: Kurus[]; // her ödeme + faiz sonrası kalan borç
}

export type PaymentRule = (balance: Kurus, month: number) => Kurus;

export const fixedPayment = (amount: Kurus): PaymentRule => () => amount;

/** Her ay sadece asgari: bakiyenin oranı kadar, ama en az `floor` (borç küçükse tamamı). */
export const minimumOnly =
  (rate: number, floor: Kurus = 10_000): PaymentRule =>
  (balance) =>
    Math.max(applyRate(balance, rate), Math.min(balance, floor));

export function simulatePayoff(
  startBalance: Kurus,
  monthlyRate: number,
  rule: PaymentRule,
  maxMonths = 240,
): PayoffResult {
  const effective = monthlyRate * (1 + KKDF + BSMV);
  let balance = startBalance;
  let totalInterest = 0;
  let totalPaid = 0;
  let months = 0;
  const balances: Kurus[] = [];

  while (balance > 0 && months < maxMonths) {
    const pay = Math.min(rule(balance, months), balance);
    if (pay <= 0) break;
    balance -= pay;
    totalPaid += pay;
    months++;
    if (balance === 0) {
      balances.push(0);
      break;
    }
    const interest = applyRate(balance, effective);
    totalInterest += interest;
    balance += interest;
    balances.push(balance);
  }

  return { months, finished: balance === 0, totalInterest, totalPaid, balances };
}

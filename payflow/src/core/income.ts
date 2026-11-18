import { periodKey } from './dates';
import { clampedDate, startOfDay } from './finance/billingCycle';
import { AppSettings, IncomeSource } from './model';
import { Kurus } from './money';

export const incomeSources = (s: AppSettings): IncomeSource[] => s.incomes ?? [];

/**
 * Bir dönemde beklenen gelir: o ay girilmiş gerçek tutar; yoksa değişken gelirde son
 * (en fazla 3) girilen ayın ortalaması; o da yoksa kaynakta yazan tutar.
 */
export function expectedIncome(src: IncomeSource, s: AppSettings, period: string): { amount: Kurus; actual: boolean; estimated: boolean } {
  const log = s.incomeLog?.[src.id] ?? {};
  if (log[period] !== undefined) return { amount: log[period], actual: true, estimated: false };
  if (src.variable) {
    const recent = Object.keys(log)
      .filter((p) => p < period)
      .sort()
      .slice(-3)
      .map((p) => log[p]);
    if (recent.length) return { amount: Math.round(recent.reduce((a, b) => a + b, 0) / recent.length), actual: false, estimated: true };
    return { amount: src.amount, actual: false, estimated: true };
  }
  return { amount: src.amount, actual: false, estimated: false };
}

/** Kaynağın [from, to] aralığındaki yatış günleri. */
export function incomeDates(src: IncomeSource, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const start = startOfDay(from);
  for (let k = -1; k <= 14; k++) {
    const d = clampedDate(start.getFullYear(), start.getMonth() + k, src.day);
    if (d.getTime() > to.getTime()) break;
    if (d.getTime() >= start.getTime()) out.push(d);
  }
  return out;
}

/** Girilen bakiyeden sonra ve bugüne kadar yatmış (gerçek tutarı girilmiş) gelirler. */
export function incomeSince(s: AppSettings, since: Date, now: Date): Kurus {
  let sum = 0;
  for (const src of incomeSources(s)) {
    for (const d of incomeDates(src, since, now)) {
      if (d.getTime() <= since.getTime()) continue;
      const v = s.incomeLog?.[src.id]?.[periodKey(d)];
      if (v !== undefined) sum += v;
    }
  }
  return sum;
}

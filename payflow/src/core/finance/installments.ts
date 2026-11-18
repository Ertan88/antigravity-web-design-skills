import { Kurus } from '../money';
import { CardCycle, addCycles, statementCutFor } from './billingCycle';

export interface InstallmentPurchase {
  id: string;
  title: string;
  total: Kurus;
  count: number; // taksit sayısı (1 = tek çekim)
  date: Date; // alışveriş tarihi
}

export interface InstallmentLine {
  purchaseId: string;
  title: string;
  index: number; // 1-tabanlı: 3/6 için 3
  count: number;
  amount: Kurus;
  statementCut: Date;
}

/**
 * Taksitli alışverişi ekstrelere dağıtır.
 * Kuruş kalanı ilk taksite eklenir (ör. 1.000,00 / 3 = 333,34 + 333,33 + 333,33).
 * İlk taksit, alışveriş tarihinin düştüğü ekstreye girer.
 */
export function scheduleInstallments(p: InstallmentPurchase, cycle: CardCycle): InstallmentLine[] {
  if (p.count < 1 || !Number.isInteger(p.count)) throw new Error('Taksit sayısı pozitif tam sayı olmalı');
  const base = Math.floor(p.total / p.count);
  const remainder = p.total - base * p.count;
  const firstCut = statementCutFor(p.date, cycle);
  return Array.from({ length: p.count }, (_, i) => ({
    purchaseId: p.id,
    title: p.title,
    index: i + 1,
    count: p.count,
    amount: base + (i === 0 ? remainder : 0),
    statementCut: addCycles(firstCut, i, cycle),
  }));
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Belirli bir ekstreye düşen tüm taksit satırları. */
export function installmentsForStatement(
  purchases: InstallmentPurchase[],
  cut: Date,
  cycle: CardCycle,
): InstallmentLine[] {
  return purchases
    .flatMap((p) => scheduleInstallments(p, cycle))
    .filter((l) => sameDay(l.statementCut, cut));
}

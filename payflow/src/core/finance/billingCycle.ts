/**
 * Kart dönemleri: hesap kesim günü ve son ödeme günü.
 * Tarihler yerel saatle, gün hassasiyetinde çalışır (saat bilgisi 00:00).
 */
export interface CardCycle {
  cutDay: number; // 1–31, ay bu günden kısaysa ayın son günü kullanılır
  dueDay: number; // 1–31, kesimden sonraki ilk bu gün
}

const lastDayOfMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Ay kısa ise (ör. 31 → Şubat 28) ayın son gününe sabitler. */
export function clampedDate(year: number, month: number, day: number): Date {
  // month 12 veya -1 gibi taşmaları normalize et
  const norm = new Date(year, month, 1);
  const y = norm.getFullYear();
  const m = norm.getMonth();
  return new Date(y, m, Math.min(day, lastDayOfMonth(y, m)));
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Bir harcamanın hangi ekstreye gireceği: harcama tarihinden sonraki (veya aynı günkü)
 * ilk hesap kesim tarihi.
 */
export function statementCutFor(date: Date, cycle: CardCycle): Date {
  const d = startOfDay(date);
  const thisMonth = clampedDate(d.getFullYear(), d.getMonth(), cycle.cutDay);
  if (d.getTime() <= thisMonth.getTime()) return thisMonth;
  return clampedDate(d.getFullYear(), d.getMonth() + 1, cycle.cutDay);
}

/** Bir kesim tarihine ait son ödeme tarihi: kesimden sonraki ilk `dueDay`. */
export function dueDateFor(cut: Date, cycle: CardCycle): Date {
  const sameMonth = clampedDate(cut.getFullYear(), cut.getMonth(), cycle.dueDay);
  if (sameMonth.getTime() > cut.getTime()) return sameMonth;
  return clampedDate(cut.getFullYear(), cut.getMonth() + 1, cycle.dueDay);
}

/** Kesim tarihinden n ay sonraki kesim. */
export function addCycles(cut: Date, n: number, cycle: CardCycle): Date {
  return clampedDate(cut.getFullYear(), cut.getMonth() + n, cycle.cutDay);
}

/**
 * "Bugün hangi kartı kullanmalıyım?" — Bugün yapılacak harcamanın ödenmesine kadar
 * geçecek gün sayısı (faizsiz süre). En büyük olan kart önerilir.
 */
export function interestFreeDays(today: Date, cycle: CardCycle): number {
  const cut = statementCutFor(today, cycle);
  const due = dueDateFor(cut, cycle);
  return Math.round((due.getTime() - startOfDay(today).getTime()) / 86_400_000);
}

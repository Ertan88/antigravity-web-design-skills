import { fromISODate, periodKey, sameDay } from './dates';
import { CardCycle, addCycles, clampedDate, dueDateFor, startOfDay, statementCutFor } from './finance/billingCycle';
import { InstallmentLine, InstallmentPurchase, installmentsForStatement } from './finance/installments';
import { computeStatement, StatementResult } from './finance/statement';
import { Bill, CardPayment, CreditCard, Expense } from './model';
import { Kurus, sum } from './money';

export interface CardStatement {
  cut: Date;
  due: Date;
  result: StatementResult;
  singlePurchases: Kurus;
  installmentLines: InstallmentLine[];
  /** Bu ekstre kesildikten sonra, bir sonraki kesime kadar yapılan ödemeler. */
  paidAfterCut: Kurus;
  remaining: Kurus;
  closed: boolean; // kesim tarihi geçti mi
  isOpening: boolean;
}

const cycleOf = (c: CreditCard): CardCycle => ({ cutDay: c.cutDay, dueDay: c.dueDay });

/** Verilen tarihte veya ondan önceki son hesap kesim tarihi. */
export function lastCutOnOrBefore(date: Date, cycle: CardCycle): Date {
  const d = startOfDay(date);
  const c = statementCutFor(d, cycle);
  return c.getTime() === d.getTime() ? c : addCycles(c, -1, cycle);
}

const inRange = (iso: string, fromExclusive: Date, toInclusive: Date) => {
  const t = startOfDay(new Date(iso)).getTime();
  return t > fromExclusive.getTime() && t <= toInclusive.getTime();
};

/**
 * Kartın ekstre defteri: ilk hareketten bugünkü açık döneme kadar her ekstreyi,
 * bir öncekinin ödenmeyen kısmını faiziyle devrederek hesaplar (tahmini).
 * Ödemeler: (önceki kesim, bu kesim] arasında yapılanlar önceki ekstreye sayılır.
 */
export function cardLedger(card: CreditCard, expenses: Expense[], payments: CardPayment[], now: Date): CardStatement[] {
  const cycle = cycleOf(card);
  const today = startOfDay(now);
  const mine = expenses.filter((e) => e.source.type === 'card' && e.source.cardId === card.id);
  const pays = payments.filter((p) => p.cardId === card.id);

  const openCut = statementCutFor(today, cycle);
  const hasOpening = (card.openingStatementTotal ?? 0) > 0;
  const openingCut = hasOpening ? lastCutOnOrBefore(fromISODate(card.createdAt), cycle) : null;

  const candidates = [openCut.getTime()];
  if (openingCut) candidates.push(openingCut.getTime());
  for (const e of mine) candidates.push(statementCutFor(new Date(e.date), cycle).getTime());
  let cut = statementCutFor(new Date(Math.min(...candidates)), cycle);
  // Açılış ekstresinden önceki harcamalar açılış tutarına dahil sayılır.
  if (openingCut && cut.getTime() < openingCut.getTime()) cut = openingCut;

  const installmentPurchases: InstallmentPurchase[] = mine
    .filter((e) => e.installments > 1)
    .map((e) => ({ id: e.id, title: e.note || 'Taksitli alışveriş', total: e.amount, count: e.installments, date: new Date(e.date) }));

  const out: CardStatement[] = [];
  let guard = 0;
  while (cut.getTime() <= openCut.getTime() && guard++ < 240) {
    const nextCut = addCycles(cut, 1, cycle);
    const prev = out[out.length - 1];
    const isOpening = !!openingCut && sameDay(cut, openingCut);

    let result: StatementResult;
    let singlePurchases = 0;
    let lines: InstallmentLine[] = [];
    if (isOpening) {
      result = computeStatement({ purchases: [card.openingStatementTotal!], installmentsDue: [], limit: card.limit, isFirstYearCard: card.isFirstYear });
    } else {
      singlePurchases = sum(
        mine.filter((e) => e.installments <= 1 && sameDay(statementCutFor(new Date(e.date), cycle), cut)).map((e) => e.amount),
      );
      lines = installmentsForStatement(installmentPurchases, cut, cycle);
      result = computeStatement({
        previous: prev
          ? { total: prev.result.total, minimum: prev.result.minimum, paid: prev.paidAfterCut }
          : undefined,
        purchases: [singlePurchases],
        installmentsDue: lines.map((l) => l.amount),
        limit: card.limit,
        isFirstYearCard: card.isFirstYear,
        rateOverride: card.rateOverride,
      });
    }

    const paidAfterCut =
      sum(pays.filter((p) => inRange(p.date, cut, nextCut)).map((p) => p.amount)) + (isOpening ? card.openingPaid ?? 0 : 0);
    out.push({
      cut,
      due: dueDateFor(cut, cycle),
      result,
      singlePurchases,
      installmentLines: lines,
      paidAfterCut,
      remaining: Math.max(0, result.total - paidAfterCut),
      closed: cut.getTime() <= today.getTime(),
      isOpening,
    });
    cut = nextCut;
  }
  return out;
}

export interface CardDue {
  statement: CardStatement;
  amount: Kurus;
  due: Date;
  projected: boolean; // dönem henüz kesilmedi
}

/**
 * Kartın şu an öne çıkan ödemesi: kesilmiş ve son ödeme günü geçmemiş ekstrenin kalanı;
 * yoksa açık dönemin tahmini toplamı.
 */
export function cardCurrentDue(ledger: CardStatement[], now: Date): CardDue | null {
  const today = startOfDay(now).getTime();
  const closed = [...ledger].reverse().find((s) => s.closed);
  if (closed && closed.due.getTime() >= today && closed.remaining > 0) {
    return { statement: closed, amount: closed.remaining, due: closed.due, projected: false };
  }
  const open = ledger.find((s) => !s.closed);
  if (open && open.result.total > 0) return { statement: open, amount: open.result.total, due: open.due, projected: true };
  return null;
}

export const statementInterest = (r: StatementResult): Kurus => r.contractualInterest + r.lateInterest + r.kkdf + r.bsmv;

/** Faturanın bir sonraki (veya gecikmiş) ödeme tarihi; ödenmişse null. */
export function billNextDue(bill: Bill, now: Date): { due: Date; period: string } | null {
  const today = startOfDay(now);
  const created = fromISODate(bill.createdAt);
  const paid = (p: string) => bill.paidPeriods.includes(p);

  if (bill.recurrence.type === 'once') {
    if (paid('once')) return null;
    return { due: fromISODate(bill.recurrence.dueDate), period: 'once' };
  }

  const day = bill.recurrence.dueDay;
  for (const offset of [-1, 0, 1, 2]) {
    const d = clampedDate(today.getFullYear(), today.getMonth() + offset, day);
    if (d.getTime() < created.getTime()) continue; // eklenmeden önceki dönemler sayılmaz
    const p = periodKey(d);
    if (!paid(p)) return { due: d, period: p };
  }
  return null;
}

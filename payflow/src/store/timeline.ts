import { Category } from '../core/categories';
import { periodKey } from '../core/dates';
import { clampedDate, startOfDay } from '../core/finance/billingCycle';
import { ratesFor } from '../core/finance/rates';
import { billNextDue, cardLedger } from '../core/ledger';
import { AppState } from '../core/model';
import { Kurus } from '../core/money';
import { CARD_CATEGORY, findCategory } from './selectors';

/** Zaman Nehri: önümüzdeki N günün para giriş/çıkışları ve tahmini bakiye. */
export interface FlowEvent {
  key: string;
  date: Date;
  title: string;
  amount: Kurus; // çıkış negatif, giriş pozitif
  category: Category;
  kind: 'bill' | 'rent' | 'card' | 'salary';
  refId?: string;
  projected: boolean;
  /** Kart için: bu ödemenin asgari tutarı (öneri hesabında). */
  minimum?: Kurus;
  balanceAfter?: Kurus;
}

export const SALARY_CATEGORY: Category = {
  id: 'salary', name: 'Maaş', kind: 'income', icon: 'wallet', color: '#3EE6B0', colorLight: '#0A7A59', builtIn: true,
};

export function flowEvents(s: AppState, now: Date, days: number): FlowEvent[] {
  const today = startOfDay(now);
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, 23, 59);
  const within = (d: Date) => d.getTime() <= horizon.getTime();
  const out: FlowEvent[] = [];

  for (const b of s.bills) {
    const first = billNextDue(b, now);
    if (!first) continue;
    const cat = findCategory(s, b.typeId);
    const push = (d: Date, period: string) =>
      out.push({ key: `bill:${b.id}:${period}`, date: d, title: b.title, amount: -b.amount, category: cat, kind: b.typeId === 'rent' ? 'rent' : 'bill', refId: b.id, projected: b.variableAmount });
    if (within(first.due)) push(first.due, first.period);
    if (b.recurrence.type === 'monthly') {
      for (let k = 1; k <= Math.ceil(days / 28) + 1; k++) {
        const d = clampedDate(first.due.getFullYear(), first.due.getMonth() + k, b.recurrence.dueDay);
        const p = periodKey(d);
        if (!within(d)) break;
        if (!b.paidPeriods.includes(p)) push(d, p);
      }
    }
  }

  for (const c of s.cards) {
    const ledger = cardLedger(c, s.expenses, s.cardPayments, now);
    const closed = [...ledger].reverse().find((x) => x.closed);
    const open = ledger.find((x) => !x.closed);
    const closedShown = !!closed && closed.due.getTime() >= today.getTime() && closed.remaining > 0;
    if (closed && closedShown && within(closed.due)) {
      out.push({ key: `card:${c.id}:${closed.cut.getTime()}`, date: closed.due, title: `${c.name} ekstresi`, amount: -closed.remaining, category: CARD_CATEGORY, kind: 'card', refId: c.id, projected: false, minimum: Math.max(0, closed.result.minimum - closed.paidAfterCut) });
    }
    if (open && within(open.due)) {
      // Önceki ekstre tamamen ödenecek varsayımıyla açık dönemin yalnızca yeni harcamaları.
      const amount = closedShown ? open.result.newSpending : open.result.total;
      if (amount > 0) out.push({ key: `card:${c.id}:${open.cut.getTime()}`, date: open.due, title: `${c.name} (dönem içi)`, amount: -amount, category: CARD_CATEGORY, kind: 'card', refId: c.id, projected: true, minimum: Math.round(amount * open.result.minimumRate) });
    }
  }

  const { salaryDay, salaryAmount } = s.settings;
  if (salaryDay && salaryAmount) {
    for (let k = 0; k <= Math.ceil(days / 28) + 1; k++) {
      const d = clampedDate(today.getFullYear(), today.getMonth() + k, salaryDay);
      if (d.getTime() < today.getTime() || !within(d)) continue;
      out.push({ key: `salary:${periodKey(d)}`, date: d, title: 'Maaş', amount: salaryAmount, category: SALARY_CATEGORY, kind: 'salary', projected: false });
    }
  }

  // Aynı gün: önce gelir, sonra gider (maaş günü ödemesi bakiyeyi gereksiz eksiye düşürmesin).
  return out.sort((a, b) => a.date.getTime() - b.date.getTime() || b.amount - a.amount);
}

/**
 * Başlangıç bakiyesi: kullanıcının girdiği bakiye, o andan sonraki nakit/banka kartı
 * harcamaları ve kart ödemeleri düşülerek bugüne taşınır.
 */
export function currentBalance(s: AppState): Kurus | null {
  const b = s.settings.balance;
  if (!b) return null;
  const since = new Date(b.asOf).getTime();
  const spent = s.expenses.filter((e) => e.source.type !== 'card' && new Date(e.date).getTime() > since).reduce((a, e) => a + e.amount, 0);
  const paid = s.cardPayments.filter((p) => new Date(p.date).getTime() > since).reduce((a, p) => a + p.amount, 0);
  return b.amount - spent - paid;
}

export function withBalances(events: FlowEvent[], start: Kurus): FlowEvent[] {
  let bal = start;
  return events.map((e) => {
    bal += e.amount;
    return { ...e, balanceAfter: bal };
  });
}

export interface Shortfall {
  date: Date;
  lowest: Kurus;
  /** Kart ödemesinin bir kısmını maaştan sonraya bırakma önerisi. */
  suggestion?: { cardTitle: string; defer: Kurus; cost: Kurus };
}

/** Bakiyenin ilk eksiye düştüğü an ve (mümkünse) faiz maliyetli öneri. */
export function findShortfall(s: AppState, events: FlowEvent[]): Shortfall | null {
  const idx = events.findIndex((e) => (e.balanceAfter ?? 0) < 0);
  if (idx < 0) return null;
  const nextSalary = events.findIndex((e, i) => i > idx && e.kind === 'salary');
  const lowestRun = events.slice(idx, nextSalary < 0 ? undefined : nextSalary);
  const lowest = Math.min(...lowestRun.map((e) => e.balanceAfter ?? 0));
  const deficit = -lowest;
  const result: Shortfall = { date: events[idx].date, lowest };
  if (nextSalary < 0) return result;

  const card = events
    .slice(0, nextSalary)
    .filter((e) => e.kind === 'card')
    .find((e) => -e.amount - deficit >= (e.minimum ?? 0));
  if (card) {
    const cardModel = s.cards.find((c) => c.id === card.refId);
    const rate = ratesFor(-card.amount, cardModel?.rateOverride).contractual;
    result.suggestion = { cardTitle: card.title.replace(/ ekstresi$/, ''), defer: deficit, cost: Math.round(deficit * rate * 1.3) };
  }
  return result;
}

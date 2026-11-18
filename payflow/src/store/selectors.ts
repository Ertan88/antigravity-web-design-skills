import { BILL_TYPES, Category, DAILY_CATEGORIES } from '../core/categories';
import { endOfMonth, monthName, sameDay } from '../core/dates';
import { billNextDue, cardCurrentDue, cardLedger, statementInterest } from '../core/ledger';
import { AppState, CreditCard } from '../core/model';
import { Kurus, sum } from '../core/money';
import { daysUntil } from '../core/schedule';

export const CARD_CATEGORY: Category = {
  id: 'credit-card',
  name: 'Kredi kartı',
  kind: 'card',
  icon: 'card',
  color: '#8EADFF',
  colorLight: '#2C57CF',
  builtIn: true,
};

const UNKNOWN: Category = { id: 'unknown', name: 'Diğer', kind: 'daily', icon: 'wallet', color: '#A8B4CC', colorLight: '#46536B', builtIn: true };

export const allCategories = (s: AppState): Category[] => [...BILL_TYPES, ...DAILY_CATEGORIES, ...s.customCategories];

export function findCategory(s: AppState, id: string): Category {
  return allCategories(s).find((c) => c.id === id) ?? UNKNOWN;
}

export interface DueItem {
  key: string;
  kind: 'bill' | 'rent' | 'card';
  refId: string;
  title: string;
  subtitle: string;
  category: Category;
  amount: Kurus;
  due: Date;
  daysLeft: number;
  /** Fatura için 'Ödedim' işaretlenecek dönem. */
  period?: string;
  interest: Kurus;
  projected: boolean;
}

export function dueItems(s: AppState, now: Date): DueItem[] {
  const items: DueItem[] = [];

  for (const b of s.bills) {
    const next = billNextDue(b, now);
    if (!next) continue;
    const cat = findCategory(s, b.typeId);
    items.push({
      key: `bill:${b.id}:${next.period}`,
      kind: b.typeId === 'rent' ? 'rent' : 'bill',
      refId: b.id,
      title: b.title,
      subtitle: [b.institution, b.shared ? 'Ev bütçesi' : null, b.variableAmount ? 'tutar değişken ≈' : null].filter(Boolean).join(' · ') || cat.name,
      category: cat,
      amount: b.amount,
      due: next.due,
      daysLeft: daysUntil(next.due, now),
      period: next.period,
      interest: 0,
      projected: false,
    });
  }

  for (const c of s.cards) {
    const d = cardCurrentDue(cardLedger(c, s.expenses, s.cardPayments, now), now);
    if (!d) continue;
    items.push({
      key: `card:${c.id}:${d.due.getTime()}`,
      kind: 'card',
      refId: c.id,
      title: c.name,
      subtitle: d.projected ? `${monthName(d.statement.cut)} dönemi · tahmini` : `${monthName(d.statement.cut)} ekstresi${statementInterest(d.statement.result) > 0 ? ' · faiz dahil ≈' : ''}`,
      category: CARD_CATEGORY,
      amount: d.amount,
      due: d.due,
      daysLeft: daysUntil(d.due, now),
      interest: statementInterest(d.statement.result),
      projected: d.projected,
    });
  }

  return items.sort((a, b) => a.due.getTime() - b.due.getTime());
}

export interface HomeSummary {
  monthTotal: Kurus;
  byGroup: { cards: Kurus; bills: Kurus; rent: Kurus };
  interestThisMonth: Kurus;
  healthScore: number;
  upcoming: DueItem[];
  overdueCount: number;
  today: { category: Category; amount: Kurus }[];
  todayTotal: Kurus;
  isEmpty: boolean;
}

export function homeSummary(s: AppState, now: Date): HomeSummary {
  const items = dueItems(s, now);
  const eom = endOfMonth(now).getTime();
  const thisMonth = items.filter((i) => i.due.getTime() <= eom);
  const group = (k: DueItem['kind']) => sum(thisMonth.filter((i) => i.kind === k).map((i) => i.amount));
  const overdueCount = items.filter((i) => i.daysLeft < 0).length;
  const interestThisMonth = sum(thisMonth.map((i) => i.interest));

  const todays = s.expenses.filter((e) => sameDay(new Date(e.date), now));
  const byCat = new Map<string, Kurus>();
  for (const e of todays) byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount);
  const today = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, amount]) => ({ category: findCategory(s, id), amount }));

  return {
    monthTotal: sum(thisMonth.map((i) => i.amount)),
    byGroup: { cards: group('card'), bills: group('bill'), rent: group('rent') },
    interestThisMonth,
    healthScore: healthScore(overdueCount, interestThisMonth),
    upcoming: items.slice(0, 4),
    overdueCount,
    today,
    todayTotal: sum(todays.map((e) => e.amount)),
    isEmpty: s.cards.length === 0 && s.bills.length === 0 && s.expenses.length === 0,
  };
}

/**
 * Geçici, sade skor: gecikmiş her ödeme −15, faiz ödeniyorsa −10.
 * Adım 7'de zamanında ödeme oranı ve tam ödeme alışkanlığıyla gerçek skora dönüşecek.
 */
export function healthScore(overdue: number, interest: Kurus): number {
  return Math.max(0, Math.min(100, 100 - overdue * 15 - (interest > 0 ? 10 : 0)));
}

export const creditCards = (s: AppState): CreditCard[] => s.cards;

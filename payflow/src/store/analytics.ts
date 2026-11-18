import { Category } from '../core/categories';
import { fromISODate, periodKey, toISODate, uid } from '../core/dates';
import { clampedDate, startOfDay } from '../core/finance/billingCycle';
import { cardLedger, statementInterest } from '../core/ledger';
import { AppState, Bill, ME } from '../core/model';
import { Kurus, sum } from '../core/money';
import { DEFAULT_REMINDERS } from '../core/reminders';
import { dueItems, findCategory } from './selectors';

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const inMonth = (d: Date, m: Date) => d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();

/** Faturanın bir dönemine ait son ödeme tarihi. */
export function billDueForPeriod(b: Bill, period: string): Date {
  if (b.recurrence.type === 'once') return fromISODate(b.recurrence.dueDate);
  const [y, m] = period.split('-').map(Number);
  return clampedDate(y, m - 1, b.recurrence.dueDay);
}

// ───────────────────────────── Ödeme Sağlığı Skoru ─────────────────────────────

export interface HealthReport {
  score: number;
  label: 'Çok iyi' | 'İyi gidiyor' | 'Dikkat' | 'Riskli';
  onTime: number; // zamanında ödenen
  late: number; // geç ödenen veya ödenmeyen (vadesi geçmiş)
  onTimeRate: number | null;
  fullStatements: number;
  cardStatements: number;
  interestPaid: Kurus; // son 3 ay
  overdueNow: number;
  /** Puanı en çok düşüren konu için tek cümlelik öneri. */
  tip: string | null;
}

/**
 * Son 6 ay: faturalar (ödendi anı ≤ son ödeme günü) ve kart ekstreleri (son ödeme gününe
 * kadar asgari ödendi mi, tamamı ödendi mi), son 3 ay faiz, şu an gecikmede olanlar.
 * 100'den başlar: zamanında ödeme oranı ağırlık 50, tam ödeme alışkanlığı 25, faiz ≤25, gecikme 10/adet.
 */
export function healthReport(s: AppState, now: Date): HealthReport {
  const today = startOfDay(now);
  const windowStart = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
  let onTime = 0;
  let late = 0;

  for (const b of s.bills) {
    const created = fromISODate(b.createdAt);
    const periods = b.recurrence.type === 'once' ? ['once'] : Array.from({ length: 7 }, (_, i) => periodKey(new Date(today.getFullYear(), today.getMonth() - 6 + i, 1)));
    for (const p of periods) {
      const due = billDueForPeriod(b, p);
      if (due < created || due < windowStart || due >= today) continue;
      const paidAt = b.paidLog?.[p];
      if (b.paidPeriods.includes(p) && (!paidAt || startOfDay(new Date(paidAt)) <= due)) onTime++;
      else late++;
    }
  }

  let full = 0;
  let statements = 0;
  let interestPaid = 0;
  const interestFrom = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  for (const c of s.cards) {
    for (const st of cardLedger(c, s.expenses, s.cardPayments, now)) {
      if (st.closed && st.cut >= interestFrom) interestPaid += statementInterest(st.result);
      if (!st.closed || st.due >= today || st.due < windowStart || st.result.total <= 0) continue;
      statements++;
      if (st.paidAfterCut >= st.result.minimum) onTime++;
      else late++;
      if (st.paidAfterCut >= st.result.total) full++;
    }
  }

  const overdueNow = dueItems(s, now).filter((i) => i.daysLeft < 0).length;
  const onTimeRate = onTime + late ? onTime / (onTime + late) : null;
  const fullRate = statements ? full / statements : null;

  const penalties = {
    late: onTimeRate === null ? 0 : (1 - onTimeRate) * 50,
    full: fullRate === null ? 0 : (1 - fullRate) * 25,
    interest: interestPaid > 0 ? Math.min(25, 5 + Math.floor(interestPaid / 20_000)) : 0,
    overdue: Math.min(30, overdueNow * 10),
  };
  const score = Math.max(0, Math.min(100, Math.round(100 - penalties.late - penalties.full - penalties.interest - penalties.overdue)));
  const label = score >= 85 ? 'Çok iyi' : score >= 70 ? 'İyi gidiyor' : score >= 50 ? 'Dikkat' : 'Riskli';

  const worst = (Object.entries(penalties) as [keyof typeof penalties, number][]).sort((a, b) => b[1] - a[1])[0];
  const tips: Record<keyof typeof penalties, string> = {
    overdue: 'Gecikmiş ödemelerini kapat; her biri skoru 10 puan düşürüyor.',
    late: 'Son ödeme gününden önce öde; hatırlatmaları 3 gün öncesine de kur.',
    full: 'Kart ekstrelerini tamamen ödemek faizi sıfırlar ve skoru en çok yükselten adımdır.',
    interest: 'Faiz ödüyorsun; Asgari Tuzağı Simülatörü ile en ucuz geri ödeme planını gör.',
  };

  return { score, label, onTime, late, onTimeRate, fullStatements: full, cardStatements: statements, interestPaid, overdueNow, tip: worst[1] > 0 ? tips[worst[0]] : null };
}

// ───────────────────────────── Aylık rapor ─────────────────────────────

export interface CategorySpend {
  category: Category;
  amount: Kurus;
}

export interface MonthReport {
  month: Date;
  total: Kurus;
  byCategory: CategorySpend[];
  interest: Kurus;
  bills: Kurus;
  spending: Kurus;
  previousTotal: Kurus;
  change: number | null; // önceki aya göre oran (0.12 = %12 artış)
  transactions: { date: Date; title: string; category: string; source: string; amount: Kurus }[];
}

const INTEREST_CATEGORY: Category = { id: 'interest', name: 'Faiz ve vergiler', kind: 'card', icon: 'card', color: '#FF7A7A', colorLight: '#B02E2E', builtIn: true };

const sourceLabel = (s: AppState, e: AppState['expenses'][number]) =>
  e.source.type === 'cash' ? 'Nakit' : e.source.type === 'debit' ? 'Banka kartı' : (s.cards.find((c) => c.id === (e.source as { cardId: string }).cardId)?.name ?? 'Kredi kartı');

/**
 * Ayın gerçek harcaması: tüm harcamalar (kategoriye göre) + o döneme ait faturalar (türüne göre)
 * + o ay kesilen ekstrelerdeki faiz ve vergiler. Kart ekstre toplamı ayrıca eklenmez (çift sayım olmasın).
 */
export function monthReport(s: AppState, month: Date, now: Date): MonthReport {
  const key = periodKey(month);
  const map = new Map<string, Kurus>();
  const add = (id: string, amt: Kurus) => map.set(id, (map.get(id) ?? 0) + amt);
  const transactions: MonthReport['transactions'] = [];

  let spending = 0;
  for (const e of s.expenses) {
    const d = new Date(e.date);
    if (!inMonth(d, month)) continue;
    add(e.categoryId, e.amount);
    spending += e.amount;
    transactions.push({ date: d, title: e.note || findCategory(s, e.categoryId).name, category: findCategory(s, e.categoryId).name, source: sourceLabel(s, e), amount: e.amount });
  }

  let bills = 0;
  for (const b of s.bills) {
    const period = b.recurrence.type === 'once' ? (inMonth(fromISODate(b.recurrence.dueDate), month) ? 'once' : null) : key;
    if (!period) continue;
    const due = billDueForPeriod(b, period);
    if (due < fromISODate(b.createdAt) && !b.paidPeriods.includes(period)) continue;
    add(b.typeId, b.amount);
    bills += b.amount;
    transactions.push({ date: due, title: b.title, category: findCategory(s, b.typeId).name, source: b.paidPeriods.includes(period) ? 'Fatura · ödendi' : 'Fatura · bekliyor', amount: b.amount });
  }

  let interest = 0;
  for (const c of s.cards) {
    for (const st of cardLedger(c, s.expenses, s.cardPayments, now)) if (inMonth(st.cut, month)) interest += statementInterest(st.result);
  }
  if (interest > 0) transactions.push({ date: monthEnd(month), title: 'Kart faizi ve vergileri', category: INTEREST_CATEGORY.name, source: 'Kredi kartı', amount: interest });

  const byCategory = [...map.entries()].map(([id, amount]) => ({ category: findCategory(s, id), amount }));
  if (interest > 0) byCategory.push({ category: INTEREST_CATEGORY, amount: interest });
  byCategory.sort((a, b) => b.amount - a.amount);

  const total = spending + bills + interest;
  const prevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const previousTotal = quickTotal(s, prevMonth, now);

  return {
    month: monthStart(month),
    total,
    byCategory,
    interest,
    bills,
    spending,
    previousTotal,
    change: previousTotal > 0 ? (total - previousTotal) / previousTotal : null,
    transactions: transactions.sort((a, b) => a.date.getTime() - b.date.getTime()),
  };
}

function quickTotal(s: AppState, month: Date, now: Date): Kurus {
  const key = periodKey(month);
  const exp = sum(s.expenses.filter((e) => inMonth(new Date(e.date), month)).map((e) => e.amount));
  const bills = sum(
    s.bills
      .filter((b) => (b.recurrence.type === 'once' ? inMonth(fromISODate(b.recurrence.dueDate), month) : billDueForPeriod(b, key) >= fromISODate(b.createdAt) || b.paidPeriods.includes(key)))
      .map((b) => b.amount),
  );
  let interest = 0;
  for (const c of s.cards) for (const st of cardLedger(c, s.expenses, s.cardPayments, now)) if (inMonth(st.cut, month)) interest += statementInterest(st.result);
  return exp + bills + interest;
}

// ───────────────────────────── Abonelik dedektörü ─────────────────────────────

export interface Subscription {
  key: string;
  name: string;
  monthly: Kurus;
  category: Category;
  source: 'bill' | 'detected';
  months: number; // kaç ayda görüldü
  lastDate: Date;
  dayOfMonth: number;
}

/**
 * Abonelikler: "Abonelik" türündeki faturalar + aynı ad/kategori ve benzer tutarla
 * (±%10) ardışık aylarda, ayın benzer gününde (±4 gün) tekrarlanan harcamalar.
 */
export function detectSubscriptions(s: AppState, now: Date): Subscription[] {
  const out: Subscription[] = s.bills
    .filter((b) => b.typeId === 'subscription')
    .map((b) => ({
      key: `bill:${b.id}`,
      name: b.title,
      monthly: b.amount,
      category: findCategory(s, b.typeId),
      source: 'bill' as const,
      months: Math.max(1, b.paidPeriods.length),
      lastDate: now,
      dayOfMonth: b.recurrence.type === 'monthly' ? b.recurrence.dueDay : fromISODate(b.recurrence.dueDate).getDate(),
    }));

  const since = new Date(now.getFullYear(), now.getMonth() - 4, 1);
  const groups = new Map<string, AppState['expenses']>();
  for (const e of s.expenses) {
    if (new Date(e.date) < since || e.installments > 1) continue;
    const name = (e.note ?? '').trim().toLocaleLowerCase('tr-TR');
    const k = name ? `${e.categoryId}|${name}` : `${e.categoryId}|#${Math.round(e.amount / 1000)}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const billNames = new Set(out.map((o) => o.name.toLocaleLowerCase('tr-TR')));
  for (const [k, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(sorted.map((e) => periodKey(new Date(e.date))));
    if (months.size < 2) continue;
    const amounts = sorted.map((e) => e.amount);
    const avg = Math.round(sum(amounts) / amounts.length);
    if (amounts.some((a) => Math.abs(a - avg) > avg * 0.1)) continue;
    const days = sorted.map((e) => new Date(e.date).getDate());
    if (Math.max(...days) - Math.min(...days) > 8) continue;
    const last = sorted[sorted.length - 1];
    const name = last.note?.trim() || findCategory(s, last.categoryId).name;
    if (billNames.has(name.toLocaleLowerCase('tr-TR'))) continue;
    out.push({ key: `exp:${k}`, name, monthly: avg, category: findCategory(s, last.categoryId), source: 'detected', months: months.size, lastDate: new Date(last.date), dayOfMonth: new Date(last.date).getDate() });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

/** Tespit edilen aboneliği hatırlatmalı aylık faturaya dönüştürür. */
export function subscriptionToBill(sub: Subscription, now: Date): Bill {
  return {
    id: uid('bill'),
    typeId: 'subscription',
    title: sub.name,
    amount: sub.monthly,
    variableAmount: false,
    recurrence: { type: 'monthly', dueDay: sub.dayOfMonth },
    reminders: { ...DEFAULT_REMINDERS, offsets: ['D-1'] },
    shared: false,
    paidPeriods: [],
    createdAt: toISODate(now),
  };
}

// ───────────────────────────── Ev bütçesi ─────────────────────────────

export interface HouseholdSplit {
  people: { name: string; paid: Kurus; share: Kurus; balance: Kurus }[];
  total: Kurus;
  settlements: { from: string; to: string; amount: Kurus }[];
}

/** Paylaşılan faturalarda ayın kim-ne-ödedi dengesi ve eşitleme önerisi (eşit paylaşım). */
export function householdSplit(s: AppState, month: Date): HouseholdSplit | null {
  const members = s.settings.household?.members ?? [];
  if (!members.length) return null;
  const names = [ME, ...members];
  const key = periodKey(month);
  const paid = new Map<string, Kurus>(names.map((n) => [n, 0]));
  let total = 0;
  for (const b of s.bills) {
    if (!b.shared || !b.paidPeriods.includes(key)) continue;
    const who = b.paidBy?.[key] ?? ME;
    paid.set(who, (paid.get(who) ?? 0) + b.amount);
    total += b.amount;
  }
  const share = Math.round(total / names.length);
  const people = names.map((name) => ({ name, paid: paid.get(name) ?? 0, share, balance: (paid.get(name) ?? 0) - share }));

  const debtors = people.filter((p) => p.balance < 0).map((p) => ({ ...p, left: -p.balance }));
  const creditors = people.filter((p) => p.balance > 0).map((p) => ({ ...p, left: p.balance }));
  const settlements: HouseholdSplit['settlements'] = [];
  for (const d of debtors) {
    for (const c of creditors) {
      if (d.left <= 0) break;
      const amt = Math.min(d.left, c.left);
      if (amt <= 50) continue; // 50 kuruştan küçük farkları yoksay
      settlements.push({ from: d.name, to: c.name, amount: amt });
      d.left -= amt;
      c.left -= amt;
    }
  }
  return { people, total, settlements };
}


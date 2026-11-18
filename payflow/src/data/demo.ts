import { BILL_TYPES, Category, DAILY_CATEGORIES } from '../core/categories';
import { computeStatement, StatementResult } from '../core/finance/statement';
import { Kurus, sum, tl } from '../core/money';

/**
 * Örnek veri — Adım 3'te gerçek, cihazda saklanan verilerle değiştirilecek.
 * Tarihler "bugüne" göre üretilir; böylece uygulama her gün mantıklı görünür.
 * Kart ekstresi gerçek finans motoruyla hesaplanır.
 */
export interface UpcomingPayment {
  id: string;
  title: string;
  subtitle: string;
  category: Category;
  amount: Kurus;
  due: Date;
  kind: 'bill' | 'card' | 'rent';
}

export interface HomeSummary {
  monthTotal: Kurus;
  byGroup: { cards: Kurus; bills: Kurus; rent: Kurus };
  interestThisMonth: Kurus;
  healthScore: number;
  upcoming: UpcomingPayment[];
  today: { category: Category; amount: Kurus }[];
  todayTotal: Kurus;
  statement: StatementResult;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const bill = (id: string) => BILL_TYPES.find((c) => c.id === id)!;
const daily = (id: string) => DAILY_CATEGORIES.find((c) => c.id === id)!;

export const CARD_CATEGORY: Category = {
  id: 'credit-card',
  name: 'Kredi kartı',
  kind: 'card',
  icon: 'card',
  color: '#8EADFF',
  colorLight: '#2C57CF',
  builtIn: true,
};

export function buildDemoSummary(now: Date): HomeSummary {
  const statement = computeStatement({
    previous: { total: tl(20_000), minimum: tl(4_000), paid: tl(8_000) },
    purchases: [tl(9_426.8)],
    installmentsDue: [tl(1_450), tl(860)],
    limit: tl(45_000),
  });

  const monthlyBills: Kurus[] = [845.3, 312.4, 1_940, 449.9, 399, 2_500, 229.99, 99.99, 49.99].map(tl);
  const rent = tl(7_500);
  const bills = sum(monthlyBills);

  const upcoming: UpcomingPayment[] = [
    { id: 'p1', title: 'Elektrik', subtitle: 'Ev', category: bill('electricity'), amount: tl(845.3), due: addDays(now, 2), kind: 'bill' },
    { id: 'p2', title: 'Maaş Kartım', subtitle: 'Kasım ekstresi · faiz dahil ≈', category: CARD_CATEGORY, amount: statement.total, due: addDays(now, 11), kind: 'card' },
    { id: 'p3', title: 'Kira', subtitle: 'Ev bütçesi · 2 kişi', category: bill('rent'), amount: rent, due: addDays(now, 12), kind: 'rent' },
  ];

  const today = [
    { category: daily('grocery'), amount: tl(214.5) },
    { category: daily('cafe'), amount: tl(92) },
    { category: daily('transport'), amount: tl(79.9) },
  ];

  return {
    monthTotal: statement.total + bills + rent,
    byGroup: { cards: statement.total, bills, rent },
    interestThisMonth: statement.contractualInterest + statement.lateInterest + statement.kkdf + statement.bsmv,
    healthScore: 82,
    upcoming,
    today,
    todayTotal: sum(today.map((t) => t.amount)),
    statement,
  };
}

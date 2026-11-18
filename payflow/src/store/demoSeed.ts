import { toISODate } from '../core/dates';
import { lastCutOnOrBefore } from '../core/ledger';
import { AppState, Bill } from '../core/model';
import { tl } from '../core/money';
import { DEFAULT_REMINDERS } from '../core/reminders';
import { initialState } from './reducer';

/**
 * "Örnek verilerle dene" — boş uygulamayı tasarımdaki senaryoyla doldurur.
 * Kart: son ekstre 20.000 TL, 8.000 TL ödenmiş → kalan faiziyle bu döneme devreder.
 * Tarihler bugüne göre üretilir.
 */
export function demoState(now: Date): AppState {
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const at = (offset: number, h = 12) => {
    const d = day(offset);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  // Kesim gününü, bir önceki ekstreyi geçen ay kesilmiş olacak şekilde seç: bugünden 1 gün sonra.
  const cutDay = day(1).getDate();
  const dueDay = day(11).getDate();
  // Açılış ekstresi: bugünden önceki son kesim (geçen ay).
  const openingCut = lastCutOnOrBefore(day(-1), { cutDay, dueDay });

  const bill = (id: string, typeId: string, title: string, amount: number, dueOffset: number, extra: Partial<Bill> = {}): Bill => ({
    id,
    typeId,
    title,
    amount: tl(amount),
    variableAmount: false,
    recurrence: { type: 'monthly', dueDay: day(dueOffset).getDate() },
    reminders: DEFAULT_REMINDERS,
    shared: false,
    paidPeriods: [],
    createdAt: toISODate(day(-1)),
    ...extra,
  });

  const endOfToday = day(0);
  endOfToday.setHours(23, 59, 0, 0);

  return {
    ...initialState,
    settings: {
      ...initialState.settings,
      salaryDay: day(27).getDate(),
      salaryAmount: tl(52_000),
      balance: { amount: tl(31_480), asOf: endOfToday.toISOString() },
    },
    cards: [
      {
        id: 'demo-card',
        name: 'Maaş Kartım',
        last4: '4821',
        limit: tl(45_000),
        cutDay,
        dueDay,
        color: '#1E3A8A',
        isFirstYear: false,
        openingStatementTotal: tl(20_000),
        openingPaid: tl(8_000),
        reminders: DEFAULT_REMINDERS,
        createdAt: toISODate(openingCut),
      },
    ],
    bills: [
      bill('demo-ele', 'electricity', 'Elektrik', 845.3, 2, { institution: 'Ev', variableAmount: true }),
      bill('demo-water', 'water', 'Su', 312.4, 5),
      bill('demo-rent', 'rent', 'Kira', 7_500, 12, { shared: true }),
      bill('demo-net', 'internet', 'İnternet', 449.9, 14),
    ],
    expenses: [
      { id: 'demo-e1', amount: tl(9_426.8), categoryId: 'grocery', date: at(-3), source: { type: 'card', cardId: 'demo-card' }, installments: 1, note: 'Kasım alışverişleri' },
      { id: 'demo-e2', amount: tl(8_700), categoryId: 'education', date: at(-70), source: { type: 'card', cardId: 'demo-card' }, installments: 6, note: 'Telefon' },
      { id: 'demo-e3', amount: tl(214.5), categoryId: 'grocery', date: at(0, 10), source: { type: 'debit' }, installments: 1 },
      { id: 'demo-e4', amount: tl(92), categoryId: 'cafe', date: at(0, 9), source: { type: 'cash' }, installments: 1 },
      { id: 'demo-e5', amount: tl(79.9), categoryId: 'transport', date: at(0, 8), source: { type: 'debit' }, installments: 1 },
    ],
  };
}

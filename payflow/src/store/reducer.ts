import { Category } from '../core/categories';
import { AppState, Bill, CardPayment, CreditCard, Expense } from '../core/model';
import { DEFAULT_REMINDERS } from '../core/reminders';

export const initialState: AppState = {
  version: 1,
  cards: [],
  bills: [],
  expenses: [],
  cardPayments: [],
  customCategories: [],
  settings: { defaultReminders: DEFAULT_REMINDERS },
};

export type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'reset' }
  | { type: 'card/add'; card: CreditCard }
  | { type: 'card/remove'; id: string }
  | { type: 'bill/add'; bill: Bill }
  | { type: 'bill/remove'; id: string }
  | { type: 'bill/markPaid'; id: string; period: string }
  | { type: 'bill/unmarkPaid'; id: string; period: string }
  | { type: 'expense/add'; expense: Expense }
  | { type: 'expense/remove'; id: string }
  | { type: 'cardPayment/add'; payment: CardPayment }
  | { type: 'category/add'; category: Category };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return migrate(action.state);
    case 'reset':
      return initialState;
    case 'card/add':
      return { ...state, cards: [...state.cards, action.card] };
    case 'card/remove':
      // Kartın harcama ve ödemeleri de silinir; nakit/banka kartı harcamaları kalır.
      return {
        ...state,
        cards: state.cards.filter((c) => c.id !== action.id),
        expenses: state.expenses.filter((e) => !(e.source.type === 'card' && e.source.cardId === action.id)),
        cardPayments: state.cardPayments.filter((p) => p.cardId !== action.id),
      };
    case 'bill/add':
      return { ...state, bills: [...state.bills, action.bill] };
    case 'bill/remove':
      return { ...state, bills: state.bills.filter((b) => b.id !== action.id) };
    case 'bill/markPaid':
      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.id && !b.paidPeriods.includes(action.period) ? { ...b, paidPeriods: [...b.paidPeriods, action.period] } : b,
        ),
      };
    case 'bill/unmarkPaid':
      return {
        ...state,
        bills: state.bills.map((b) => (b.id === action.id ? { ...b, paidPeriods: b.paidPeriods.filter((p) => p !== action.period) } : b)),
      };
    case 'expense/add':
      return { ...state, expenses: [...state.expenses, action.expense] };
    case 'expense/remove':
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.id) };
    case 'cardPayment/add':
      return { ...state, cardPayments: [...state.cardPayments, action.payment] };
    case 'category/add':
      return { ...state, customCategories: [...state.customCategories, action.category] };
    default:
      return state;
  }
}

/** Saklanan veriyi güncel şemaya taşır; bozuk/eksik alanlara karşı korur. */
export function migrate(raw: unknown): AppState {
  const s = (raw ?? {}) as Partial<AppState>;
  if (s.version !== 1) return initialState;
  return {
    version: 1,
    cards: Array.isArray(s.cards) ? s.cards : [],
    bills: Array.isArray(s.bills) ? s.bills : [],
    expenses: Array.isArray(s.expenses) ? s.expenses : [],
    cardPayments: Array.isArray(s.cardPayments) ? s.cardPayments : [],
    customCategories: Array.isArray(s.customCategories) ? s.customCategories : [],
    settings: { defaultReminders: DEFAULT_REMINDERS, ...(s.settings ?? {}) },
  };
}

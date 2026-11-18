import type { Category } from './categories';
import type { CardRateOverride } from './finance/rates';
import type { Kurus } from './money';
import type { ReminderSettings } from './reminders';

/**
 * Kalıcı veri modeli. Tarihler metin olarak saklanır:
 *  - gün hassasiyetli alanlar 'YYYY-MM-DD' (yerel tarih),
 *  - an hassasiyetli alanlar ISO 8601 (Date.toISOString).
 */
export interface CreditCard {
  id: string;
  name: string;
  last4: string;
  limit: Kurus;
  cutDay: number;
  dueDay: number;
  color: string;
  isFirstYear: boolean;
  rateOverride?: CardRateOverride;
  /** Uygulamaya eklenmeden önceki son ekstrenin borcu (varsa). */
  openingStatementTotal?: Kurus;
  /** O ekstreye uygulamaya eklenmeden önce yapılmış ödeme. */
  openingPaid?: Kurus;
  reminders: ReminderSettings;
  createdAt: string; // YYYY-MM-DD
}

export type BillRecurrence = { type: 'monthly'; dueDay: number } | { type: 'once'; dueDate: string };

export interface Bill {
  id: string;
  typeId: string; // fatura türü veya özel kategori id'si
  title: string;
  institution?: string;
  subscriberNo?: string;
  amount: Kurus;
  variableAmount: boolean;
  recurrence: BillRecurrence;
  reminders: ReminderSettings;
  shared: boolean;
  /** Ödendi işaretlenen dönemler: aylıklarda 'YYYY-MM', tek seferlikte 'once'. */
  paidPeriods: string[];
  createdAt: string; // YYYY-MM-DD
}

export type PaymentSource = { type: 'cash' } | { type: 'debit' } | { type: 'card'; cardId: string };

export interface Expense {
  id: string;
  amount: Kurus;
  categoryId: string;
  date: string; // ISO an
  source: PaymentSource;
  installments: number; // 1 = tek çekim (sadece kart için anlamlı)
  note?: string;
}

export interface CardPayment {
  id: string;
  cardId: string;
  amount: Kurus;
  date: string; // ISO an
}

export interface AppSettings {
  salaryDay?: number;
  salaryAmount?: Kurus;
  /** Zaman Nehri bakiye çizgisi için kullanıcının girdiği hesap bakiyesi. */
  balance?: { amount: Kurus; asOf: string }; // asOf: ISO an
  defaultReminders: ReminderSettings;
}

export interface AppState {
  version: 1;
  cards: CreditCard[];
  bills: Bill[];
  expenses: Expense[];
  cardPayments: CardPayment[];
  customCategories: Category[];
  settings: AppSettings;
}

export const CARD_COLORS = ['#1E3A8A', '#5B2A86', '#0F5F4A', '#7A2E2E', '#1F2937', '#8A5A00'];

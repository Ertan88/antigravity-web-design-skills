import { describe, expect, it } from '@jest/globals';
import { billNextDue, cardCurrentDue, cardLedger, lastCutOnOrBefore, statementInterest } from '../ledger';
import { Bill, CreditCard, Expense } from '../model';
import { tl } from '../money';
import { applyKey, displayKeypad, parseAmount } from '../parse';
import { DEFAULT_REMINDERS } from '../reminders';

const card = (over: Partial<CreditCard> = {}): CreditCard => ({
  id: 'c1', name: 'Maaş Kartım', last4: '4821', limit: tl(45_000), cutDay: 18, dueDay: 28, color: '#1E3A8A',
  isFirstYear: false, reminders: DEFAULT_REMINDERS, createdAt: '2026-11-01', ...over,
});
const exp = (amount: number, date: string, installments = 1, cardId = 'c1'): Expense => ({
  id: `${date}-${amount}`, amount: tl(amount), categoryId: 'grocery', date: new Date(date).toISOString(),
  source: { type: 'card', cardId }, installments,
});

describe('kart defteri', () => {
  it('kullanıcının senaryosu: açılış 20.000, 8.000 ödeme → Kasım ekstresi devir + harcama', () => {
    const c = card({ openingStatementTotal: tl(20_000), openingPaid: tl(8_000), createdAt: '2026-10-25' });
    const ledger = cardLedger(c, [exp(9_426.8, '2026-11-05T12:00:00'), exp(8_700, '2026-08-25T12:00:00', 6)], [], new Date(2026, 10, 17));
    expect(ledger.map((s) => s.cut.getMonth())).toEqual([9, 10]); // Ekim açılış, Kasım açık
    const [oct, nov] = ledger;
    expect(oct.isOpening && oct.remaining === tl(12_000)).toBe(true);
    expect(nov.result.carriedTotal).toBe(tl(12_507));
    expect(nov.installmentLines.map((l) => `${l.index}/${l.count}`)).toEqual(['3/6']);
    expect(nov.result.total).toBe(tl(12_507 + 9_426.8 + 1_450));
    expect(statementInterest(nov.result)).toBe(tl(507));

    const due = cardCurrentDue(ledger, new Date(2026, 10, 17))!;
    expect(due.projected).toBe(true);
    expect(due.due).toEqual(new Date(2026, 10, 28));
  });

  it('kesilmiş ekstre son ödeme gününe kadar öne çıkar, ödeme kalandan düşer', () => {
    const c = card();
    const ledger = cardLedger(c, [exp(5_000, '2026-11-10T12:00:00')], [{ id: 'p', cardId: 'c1', amount: tl(2_000), date: new Date(2026, 10, 20).toISOString() }], new Date(2026, 10, 22));
    const due = cardCurrentDue(ledger, new Date(2026, 10, 22))!;
    expect(due.projected).toBe(false);
    expect(due.amount).toBe(tl(3_000));
    expect(due.due).toEqual(new Date(2026, 10, 28));
  });

  it('tamamı ödenen ekstre faiz doğurmaz, açık dönem gösterilir', () => {
    const c = card();
    const pays = [{ id: 'p', cardId: 'c1', amount: tl(5_000), date: new Date(2026, 10, 25).toISOString() }];
    const ledger = cardLedger(c, [exp(5_000, '2026-11-10T12:00:00'), exp(300, '2026-11-24T12:00:00')], pays, new Date(2026, 11, 2));
    const dec = ledger[ledger.length - 1];
    expect(dec.result.carriedTotal).toBe(0);
    expect(dec.result.total).toBe(tl(300));
    expect(cardCurrentDue(ledger, new Date(2026, 11, 2))!.amount).toBe(tl(300));
  });

  it('başka kartın harcaması karışmaz; hareket yoksa ödeme yok', () => {
    const ledger = cardLedger(card(), [exp(999, '2026-11-10T12:00:00', 1, 'other')], [], new Date(2026, 10, 12));
    expect(cardCurrentDue(ledger, new Date(2026, 10, 12))).toBeNull();
  });

  it('son kesim tarihi', () => {
    expect(lastCutOnOrBefore(new Date(2026, 10, 17), { cutDay: 18, dueDay: 28 })).toEqual(new Date(2026, 9, 18));
    expect(lastCutOnOrBefore(new Date(2026, 10, 18), { cutDay: 18, dueDay: 28 })).toEqual(new Date(2026, 10, 18));
  });
});

describe('fatura vadesi', () => {
  const bill = (over: Partial<Bill> = {}): Bill => ({
    id: 'b', typeId: 'electricity', title: 'Elektrik', amount: tl(845.3), variableAmount: false,
    recurrence: { type: 'monthly', dueDay: 19 }, reminders: DEFAULT_REMINDERS, shared: false, paidPeriods: [],
    createdAt: '2026-11-01', ...over,
  });
  const now = new Date(2026, 10, 17);
  it('bu ayın vadesi', () => expect(billNextDue(bill(), now)).toEqual({ due: new Date(2026, 10, 19), period: '2026-11' }));
  it('geçen ay ödenmediyse gecikmiş olarak döner', () =>
    expect(billNextDue(bill({ createdAt: '2026-10-01', recurrence: { type: 'monthly', dueDay: 10 } }), now)?.period).toBe('2026-10'));
  it('ödendi işaretlenince sonraki aya geçer', () =>
    expect(billNextDue(bill({ paidPeriods: ['2026-11'] }), now)?.period).toBe('2026-12'));
  it('eklenmeden önceki dönem sayılmaz', () =>
    expect(billNextDue(bill({ createdAt: '2026-11-15', recurrence: { type: 'monthly', dueDay: 10 } }), now)?.period).toBe('2026-12'));
  it('ay sonu kırpılır (31 → 30 Kasım)', () =>
    expect(billNextDue(bill({ recurrence: { type: 'monthly', dueDay: 31 }, createdAt: '2026-11-01' }), now)?.due).toEqual(new Date(2026, 10, 30)));
  it('tek seferlik', () => {
    expect(billNextDue(bill({ recurrence: { type: 'once', dueDate: '2026-12-05' } }), now)?.due).toEqual(new Date(2026, 11, 5));
    expect(billNextDue(bill({ recurrence: { type: 'once', dueDate: '2026-12-05' }, paidPeriods: ['once'] }), now)).toBeNull();
  });
});

describe('tutar girişi', () => {
  it('Türkçe biçimleri okur', () => {
    expect(parseAmount('1.234,56')).toBe(123_456);
    expect(parseAmount('845,3')).toBe(84_530);
    expect(parseAmount('1500')).toBe(150_000);
    expect(parseAmount('₺ 12.507')).toBe(1_250_700);
    expect(parseAmount('845.30')).toBe(84_530);
    expect(parseAmount('1.000.000')).toBe(100_000_000);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1,234,5')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
  it('tuş takımı', () => {
    const type = (keys: string[]) => keys.reduce(applyKey, '');
    expect(type(['0', '2', '1', '4', ',', '5', '0', '9'])).toBe('214,50');
    expect(type([',', '5'])).toBe('0,5');
    expect(type(['1', '2', '⌫'])).toBe('1');
    expect(displayKeypad('1250750,5')).toBe('1.250.750,5');
    expect(parseAmount(displayKeypad('214,50'))).toBe(21_450);
  });
});

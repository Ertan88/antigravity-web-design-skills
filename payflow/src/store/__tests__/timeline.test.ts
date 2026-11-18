import { describe, expect, it } from '@jest/globals';
import { toISODate } from '../../core/dates';
import { carryPreview, cardLedger, dailyCarryInterest } from '../../core/ledger';
import { tl } from '../../core/money';
import { demoState } from '../demoSeed';
import { reducer } from '../reducer';
import { currentBalance, findShortfall, flowEvents, withBalances } from '../timeline';

const now = new Date(2026, 10, 17, 15);

describe('Zaman Nehri', () => {
  const s = demoState(now);
  const events = withBalances(flowEvents(s, now, 30), currentBalance(s)!);

  it('30 günlük olaylar tarih sırasında; maaş gelir olarak', () => {
    expect(events.map((e) => `${e.date.getDate()} ${e.title}`)).toEqual([
      '19 Elektrik',
      '22 Su',
      '28 Maaş Kartım (dönem içi)',
      '29 Kira',
      '30 Ek ders',
      '1 İnternet',
      '14 Maaş',
    ]);
    const maas = events.find((e) => e.title === 'Maaş')!;
    expect(maas).toMatchObject({ kind: 'salary', amount: tl(46_000), projected: true });
  });

  it('bakiye zinciri ve eksiye düşüş + faiz maliyetli öneri', () => {
    expect(events[2].balanceAfter).toBe(tl(31_480 - 845.3 - 312.4 - 23_383.8));
    const sf = findShortfall(s, events)!;
    expect(sf.date).toEqual(new Date(2026, 10, 29));
    // Kira sonrası −561,50; ertesi gün ek ders yatıyor
    expect(sf.lowest).toBe(tl(-561.5));
    expect(sf.suggestion).toEqual({ cardTitle: 'Maaş Kartım (dönem içi)', defer: tl(561.5), cost: tl(23.72) });
  });

  it('girilen bakiyeden sonraki nakit harcama ve kart ödemesi düşülür', () => {
    const later = new Date(now.getTime() + 3 * 86_400_000).toISOString();
    let st = reducer(s, { type: 'expense/add', expense: { id: 'x', amount: tl(100), categoryId: 'cafe', date: later, source: { type: 'cash' }, installments: 1 } });
    st = reducer(st, { type: 'cardPayment/add', payment: { id: 'p', cardId: 'demo-card', amount: tl(1_000), date: later } });
    expect(currentBalance(st)).toBe(tl(31_480 - 100 - 1_000));
  });

  it('ödenen fatura akıştan çıkar', () => {
    const st = reducer(s, { type: 'bill/markPaid', id: 'demo-ele', period: '2026-11' });
    expect(flowEvents(st, now, 45).filter((e) => e.title === 'Elektrik').map((e) => toISODate(e.date))).toEqual(['2026-12-19']);
  });
});

describe('kart yardımcıları', () => {
  const s = demoState(now);
  const card = s.cards[0];
  const ledger = cardLedger(card, s.expenses, s.cardPayments, now);
  const open = ledger[ledger.length - 1];

  it('devreden anaparaya günlük faiz: 12.000 × %3,25 / 30 × 1,3', () => {
    expect(dailyCarryInterest(open)).toBe(tl(16.9));
  });

  it('ödeme önizlemesi: tamamı → faiz yok; asgari altı → uyarı', () => {
    expect(carryPreview(card, open, open.result.total)).toMatchObject({ carried: 0, interest: 0, belowMinimum: false });
    const half = carryPreview(card, open, tl(10_000));
    expect(half.carried).toBeGreaterThan(open.result.total - tl(10_000));
    expect(carryPreview(card, open, tl(1_000)).belowMinimum).toBe(true);
  });

  it('fazla ödeme sonraki ekstreden düşer', () => {
    const st = reducer(s, { type: 'cardPayment/add', payment: { id: 'p', cardId: 'demo-card', amount: open.result.total + tl(500), date: new Date(2026, 10, 20).toISOString() } });
    st.expenses.push({ id: 'n', amount: tl(2_000), categoryId: 'cafe', date: new Date(2026, 10, 25).toISOString(), source: { type: 'card', cardId: 'demo-card' }, installments: 1 });
    const l = cardLedger(card, st.expenses, st.cardPayments, new Date(2026, 10, 26));
    const dec = l[l.length - 1];
    expect(dec.result.carriedTotal).toBe(0);
    // 2.000 yeni harcama + 4/6 taksit 1.450 − 500 alacak
    expect(dec.result.total).toBe(tl(2_000 + 1_450 - 500));
  });
});

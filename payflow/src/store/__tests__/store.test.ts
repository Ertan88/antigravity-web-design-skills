import { describe, expect, it } from '@jest/globals';
import { tl } from '../../core/money';
import { demoState } from '../demoSeed';
import { initialState, migrate, reducer } from '../reducer';
import { dueItems, homeSummary } from '../selectors';

describe('veri katmanı', () => {
  it('fatura ödendi işaretlenir, tekrar işaretleme çoğaltmaz', () => {
    let s = demoState(new Date(2026, 10, 17));
    s = reducer(s, { type: 'bill/markPaid', id: 'demo-ele', period: '2026-11' });
    s = reducer(s, { type: 'bill/markPaid', id: 'demo-ele', period: '2026-11' });
    expect(s.bills.find((b) => b.id === 'demo-ele')!.paidPeriods).toEqual(['2026-11']);
  });

  it('kart silinince ona ait harcamalar da silinir', () => {
    const s = reducer(demoState(new Date(2026, 10, 17)), { type: 'card/remove', id: 'demo-card' });
    expect(s.cards).toHaveLength(0);
    expect(s.expenses.every((e) => e.source.type !== 'card')).toBe(true);
    expect(s.expenses.length).toBe(3);
  });

  it('bozuk veya eski veri güvenle başlangıca döner', () => {
    expect(migrate(null)).toEqual(initialState);
    expect(migrate({ version: 99 })).toEqual(initialState);
    expect(migrate({ version: 1, cards: 'x' }).cards).toEqual([]);
  });
});

describe('ana sayfa özeti', () => {
  it('boş uygulama', () => {
    const h = homeSummary(initialState, new Date(2026, 10, 17));
    expect(h.isEmpty).toBe(true);
    expect(h.monthTotal).toBe(0);
    expect(h.healthScore).toBe(100);
  });

  it('örnek veri: kart devri faizle birlikte hesaplanır', () => {
    const now = new Date(2026, 10, 17, 15);
    const h = homeSummary(demoState(now), now);
    const card = h.upcoming.find((i) => i.kind === 'card')!;
    expect(card.amount).toBe(tl(12_507 + 9_426.8 + 1_450));
    expect(card.daysLeft).toBe(11);
    expect(h.interestThisMonth).toBe(tl(507));
    expect(h.todayTotal).toBe(tl(386.4));
    expect(h.upcoming[0].title).toBe('Elektrik');
    expect(h.upcoming[0].daysLeft).toBe(2);
  });

  it('ödenen fatura listeden düşer', () => {
    const now = new Date(2026, 10, 17);
    const s = reducer(demoState(now), { type: 'bill/markPaid', id: 'demo-ele', period: '2026-11' });
    const ele = dueItems(s, now).find((i) => i.refId === 'demo-ele')!;
    expect(ele.period).toBe('2026-12');
  });
});

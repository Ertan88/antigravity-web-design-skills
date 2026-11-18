import { describe, expect, it } from '@jest/globals';
import { AppState, Bill } from '../../core/model';
import { tl } from '../../core/money';
import { DEFAULT_REMINDERS } from '../../core/reminders';
import { detectSubscriptions, healthReport, householdSplit, monthReport, subscriptionToBill } from '../analytics';
import { demoState } from '../demoSeed';
import { monthCsv, monthHtml } from '../exportReport';
import { initialState, reducer } from '../reducer';

const now = new Date(2026, 10, 17, 15);
const bill = (over: Partial<Bill>): Bill => ({
  id: 'b', typeId: 'electricity', title: 'Elektrik', amount: tl(800), variableAmount: false,
  recurrence: { type: 'monthly', dueDay: 10 }, reminders: DEFAULT_REMINDERS, shared: false, paidPeriods: [],
  createdAt: '2026-08-01', ...over,
});

describe('Ödeme Sağlığı Skoru', () => {
  it('veri yokken 100', () => {
    expect(healthReport(initialState, now)).toMatchObject({ score: 100, label: 'Çok iyi', onTimeRate: null, tip: null });
  });

  it('zamanında / geç ödenen faturalar oranı', () => {
    const s: AppState = {
      ...initialState,
      bills: [
        bill({
          paidPeriods: ['2026-08', '2026-09', '2026-10', '2026-11'],
          paidLog: { '2026-08': '2026-08-09T10:00:00Z', '2026-09': '2026-09-10T10:00:00Z', '2026-10': '2026-10-14T10:00:00Z', '2026-11': '2026-11-02T10:00:00Z' },
        }),
      ],
    };
    const h = healthReport(s, now);
    expect(h).toMatchObject({ onTime: 3, late: 1, overdueNow: 0 });
    expect(h.score).toBe(Math.round(100 - 0.25 * 50));
    expect(h.tip).toMatch(/Son ödeme gününden önce/);
  });

  it('ödenmeyen geçmiş dönem hem geç sayılır hem gecikme cezası alır', () => {
    const s: AppState = { ...initialState, bills: [bill({ createdAt: '2026-10-01', paidPeriods: [] })] };
    const h = healthReport(s, now);
    expect(h).toMatchObject({ onTime: 0, late: 2, overdueNow: 1 });
    expect(h.score).toBe(100 - 50 - 10);
    expect(h.label).toBe('Riskli');
  });

  it('örnek veri: kart faizi ve tam ödenmeyen ekstre skoru düşürür', () => {
    const h = healthReport(demoState(now), now);
    expect(h.cardStatements).toBe(1);
    expect(h.fullStatements).toBe(0);
    expect(h.score).toBeLessThan(80);
  });
});

describe('aylık rapor', () => {
  it('harcama + o dönemin faturaları + faiz; çift sayım yok', () => {
    const s = demoState(now);
    const r = monthReport(s, now, now);
    expect(r.spending).toBe(tl(9_426.8 + 214.5 + 92 + 79.9));
    // İnternetin vadesi ayın 1'i; fatura 1 Kasım'dan sonra eklendiği için Kasım dönemi sayılmaz.
    expect(r.bills).toBe(tl(845.3 + 312.4 + 7_500));
    expect(r.interest).toBe(tl(507));
    expect(r.total).toBe(r.spending + r.bills + r.interest);
    expect(r.byCategory[0].category.name).toBe('Market');
    expect(r.byCategory.find((c) => c.category.name === 'Faiz ve vergiler')!.amount).toBe(tl(507));
    // telefon taksitli harcaması 70 gün önce: bu aya düşmez
    expect(r.transactions.some((t) => t.title === 'Telefon')).toBe(false);
  });

  it('CSV: Excel için ; ayraç, virgüllü ondalık, BOM; PDF HTML güvenli', () => {
    const s = demoState(now);
    s.expenses[0].note = 'Market; "büyük" alışveriş';
    const r = monthReport(s, now, now);
    const csv = monthCsv(r);
    expect(csv.startsWith('﻿Tarih;Açıklama;Kategori;Kaynak;Tutar (TL)')).toBe(true);
    expect(csv).toContain('"Market; ""büyük"" alışveriş";Market;Maaş Kartım;9426,80');
    const html = monthHtml(r, healthReport(s, now));
    expect(html).toContain('Kasım 2026 raporu');
    expect(html).not.toContain('<script');
  });
});

describe('abonelik dedektörü', () => {
  it('ardışık aylarda benzer tutar ve günde tekrar eden harcamayı bulur; faturaya çevirir', () => {
    const s: AppState = {
      ...initialState,
      expenses: [8, 9, 10].map((m) => ({
        id: `v${m}`, amount: tl(229.99), categoryId: 'education', date: new Date(2026, m, 3, 12).toISOString(),
        source: { type: 'card' as const, cardId: 'c' }, installments: 1, note: 'Video platformu',
      })).concat([{ id: 'x', amount: tl(500), categoryId: 'grocery', date: new Date(2026, 9, 20).toISOString(), source: { type: 'cash' }, installments: 1, note: 'Video platformu' } as never]),
      bills: [bill({ id: 'm', typeId: 'subscription', title: 'Müzik', amount: tl(99.99) })],
    };
    const subs = detectSubscriptions(s, now);
    expect(subs.map((x) => [x.name, x.monthly, x.source])).toEqual([
      ['Video platformu', tl(229.99), 'detected'],
      ['Müzik', tl(99.99), 'bill'],
    ]);
    const b = subscriptionToBill(subs[0], now);
    expect(b).toMatchObject({ typeId: 'subscription', title: 'Video platformu', amount: tl(229.99), recurrence: { type: 'monthly', dueDay: 3 } });
  });

  it('düzensiz tutarlar abonelik sayılmaz', () => {
    const s: AppState = {
      ...initialState,
      expenses: [tl(100), tl(180)].map((a, i) => ({ id: `${i}`, amount: a, categoryId: 'cafe', date: new Date(2026, 9 + i, 5).toISOString(), source: { type: 'cash' }, installments: 1, note: 'Kahve' })),
    };
    expect(detectSubscriptions(s, now)).toEqual([]);
  });
});

describe('ev bütçesi', () => {
  it('kim ne ödedi ve eşitleme', () => {
    let s: AppState = {
      ...initialState,
      settings: { ...initialState.settings, household: { members: ['Ayşe'] } },
      bills: [bill({ id: 'k', typeId: 'rent', title: 'Kira', amount: tl(7_500), shared: true }), bill({ id: 'e', shared: true, amount: tl(500) })],
    };
    s = reducer(s, { type: 'bill/markPaid', id: 'k', period: '2026-11', paidBy: 'Ben' });
    s = reducer(s, { type: 'bill/markPaid', id: 'e', period: '2026-11', paidBy: 'Ayşe' });
    const h = householdSplit(s, now)!;
    expect(h.total).toBe(tl(8_000));
    expect(h.people).toEqual([
      { name: 'Ben', paid: tl(7_500), share: tl(4_000), balance: tl(3_500) },
      { name: 'Ayşe', paid: tl(500), share: tl(4_000), balance: tl(-3_500) },
    ]);
    expect(h.settlements).toEqual([{ from: 'Ayşe', to: 'Ben', amount: tl(3_500) }]);
    expect(householdSplit(initialState, now)).toBeNull();
  });

  it('ödeme geri alınınca kayıtlar temizlenir', () => {
    let s: AppState = { ...initialState, bills: [bill({ shared: true })] };
    s = reducer(s, { type: 'bill/markPaid', id: 'b', period: '2026-11', paidBy: 'Ayşe' });
    s = reducer(s, { type: 'bill/unmarkPaid', id: 'b', period: '2026-11' });
    expect(s.bills[0]).toMatchObject({ paidPeriods: [], paidLog: {}, paidBy: {} });
  });
});

import { describe, expect, it } from '@jest/globals';
import { formatTL, tl } from '../money';
import { minimumPaymentRate, ratesFor } from '../finance/rates';
import { computeStatement } from '../finance/statement';
import { dueDateFor, interestFreeDays, statementCutFor } from '../finance/billingCycle';
import { installmentsForStatement, scheduleInstallments } from '../finance/installments';
import { fixedPayment, minimumOnly, simulatePayoff } from '../finance/simulator';
import { planReminders } from '../reminders';
import { createCustomCategory } from '../categories';

describe('faiz kademeleri (TCMB Kasım 2026)', () => {
  it('dönem borcuna göre doğru kademeyi seçer', () => {
    expect(ratesFor(tl(29_999.99)).contractual).toBe(0.0325);
    expect(ratesFor(tl(30_000)).contractual).toBe(0.0375);
    expect(ratesFor(tl(180_000)).contractual).toBe(0.0425);
    expect(ratesFor(tl(10_000)).late).toBe(0.0355);
  });
  it('kullanıcının kart oranı tavanı ezer', () => {
    expect(ratesFor(tl(10_000), { contractual: 0.03 }).contractual).toBe(0.03);
  });
  it('asgari ödeme oranı limite göre', () => {
    expect(minimumPaymentRate(tl(45_000))).toBe(0.2);
    expect(minimumPaymentRate(tl(50_000))).toBe(0.4);
    expect(minimumPaymentRate(tl(10_000), true)).toBe(0.4);
  });
});

describe('ekstre devri', () => {
  it('kullanıcının örneği: 20.000 ekstre, 8.000 ödeme → 12.507 devreder', () => {
    const r = computeStatement({
      previous: { total: tl(20_000), minimum: tl(4_000), paid: tl(8_000) },
      purchases: [tl(9_426.8)],
      installmentsDue: [tl(1_450), tl(860)],
      limit: tl(45_000),
    });
    expect(r.carriedPrincipal).toBe(tl(12_000));
    expect(r.contractualInterest).toBe(tl(390));
    expect(r.lateInterest).toBe(0);
    expect(r.kkdf).toBe(tl(58.5));
    expect(r.bsmv).toBe(tl(58.5));
    expect(r.carriedTotal).toBe(tl(12_507));
    expect(r.total).toBe(tl(24_243.8));
    expect(r.minimum).toBe(tl(4_848.76));
    expect(formatTL(r.total)).toBe('₺24.243,80');
  });

  it('tamamı ödenirse faiz yok', () => {
    const r = computeStatement({
      previous: { total: tl(20_000), minimum: tl(4_000), paid: tl(20_000) },
      purchases: [tl(1_000)],
      installmentsDue: [],
      limit: tl(45_000),
    });
    expect(r.carriedTotal).toBe(0);
    expect(r.total).toBe(tl(1_000));
  });

  it('asgari altı ödemede eksik asgariye gecikme, kalana akdi faiz', () => {
    const r = computeStatement({
      previous: { total: tl(20_000), minimum: tl(4_000), paid: tl(2_000) },
      purchases: [],
      installmentsDue: [],
      limit: tl(45_000),
    });
    expect(r.lateInterest).toBe(tl(71)); // 2.000 × %3,55
    expect(r.contractualInterest).toBe(tl(520)); // 16.000 × %3,25
    expect(r.kkdf).toBe(tl(88.65));
    expect(r.carriedTotal).toBe(tl(18_000 + 591 + 88.65 * 2));
  });

  it('günlük faiz pro-rata hesaplanır', () => {
    const r = computeStatement({
      previous: { total: tl(20_000), minimum: tl(4_000), paid: tl(8_000) },
      purchases: [],
      installmentsDue: [],
      limit: tl(45_000),
      interestDays: 15,
    });
    expect(r.contractualInterest).toBe(tl(195));
  });

  it('iadeler borcu azaltır, negatif olmaz', () => {
    const r = computeStatement({ purchases: [tl(100)], installmentsDue: [], refunds: [tl(300)], limit: tl(10_000) });
    expect(r.total).toBe(0);
  });
});

describe('dönem tarihleri', () => {
  const cycle = { cutDay: 18, dueDay: 28 };
  it('kesimden önceki harcama bu ayın ekstresine girer', () => {
    expect(statementCutFor(new Date(2026, 10, 17), cycle)).toEqual(new Date(2026, 10, 18));
    expect(statementCutFor(new Date(2026, 10, 18), cycle)).toEqual(new Date(2026, 10, 18));
    expect(statementCutFor(new Date(2026, 10, 19), cycle)).toEqual(new Date(2026, 11, 18));
  });
  it('son ödeme tarihi kesimden sonraki ilk gündür, ay sonuna kırpılır', () => {
    expect(dueDateFor(new Date(2026, 10, 18), cycle)).toEqual(new Date(2026, 10, 28));
    const late = { cutDay: 25, dueDay: 5 };
    expect(dueDateFor(new Date(2026, 10, 25), late)).toEqual(new Date(2026, 11, 5));
    const c31 = { cutDay: 31, dueDay: 10 };
    expect(statementCutFor(new Date(2027, 1, 10), c31)).toEqual(new Date(2027, 1, 28));
  });
  it('faizsiz gün sayısı: kesimin ertesi günü harcama en uzun süreyi verir', () => {
    expect(interestFreeDays(new Date(2026, 10, 19), cycle)).toBe(39);
    expect(interestFreeDays(new Date(2026, 10, 18), cycle)).toBe(10);
  });
});

describe('taksitler', () => {
  const cycle = { cutDay: 18, dueDay: 28 };
  it('kuruş kalanı ilk taksite eklenir ve ekstrelere dağılır', () => {
    const lines = scheduleInstallments({ id: 'a', title: 'Koltuk', total: tl(1_000), count: 3, date: new Date(2026, 9, 20) }, cycle);
    expect(lines.map((l) => l.amount)).toEqual([33_334, 33_333, 33_333]);
    expect(lines[0].statementCut).toEqual(new Date(2026, 10, 18));
    expect(lines[2].statementCut).toEqual(new Date(2027, 0, 18));
  });
  it('belirli ekstreye düşen taksitleri bulur', () => {
    const p = [
      { id: 't', title: 'Telefon', total: tl(8_700), count: 6, date: new Date(2026, 7, 25) },
      { id: 'k', title: 'Koltuk', total: tl(3_440), count: 4, date: new Date(2026, 9, 1) },
    ];
    const lines = installmentsForStatement(p, new Date(2026, 10, 18), cycle);
    expect(lines.map((l) => `${l.title} ${l.index}/${l.count}`)).toEqual(['Telefon 3/6', 'Koltuk 2/4']);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(tl(2_310));
  });
});

describe('simülatör', () => {
  it('tamamı ödenirse 1 ayda biter, faiz 0', () => {
    const r = simulatePayoff(tl(24_243.8), 0.0325, fixedPayment(tl(24_243.8)));
    expect(r).toMatchObject({ months: 1, finished: true, totalInterest: 0 });
  });
  it('sadece asgari ödemek çok daha pahalıdır', () => {
    const half = simulatePayoff(tl(24_243.8), 0.0325, fixedPayment(tl(12_121.9)));
    const min = simulatePayoff(tl(24_243.8), 0.0325, minimumOnly(0.2));
    expect(half.finished && min.finished).toBe(true);
    expect(min.months).toBeGreaterThan(half.months);
    expect(min.totalInterest).toBeGreaterThan(half.totalInterest * 5);
  });
  it('faizi karşılamayan ödeme bitmez', () => {
    const r = simulatePayoff(tl(24_243.8), 0.0325, fixedPayment(tl(500)), 60);
    expect(r.finished).toBe(false);
  });
});

describe('hatırlatmalar', () => {
  it('3 gün, 1 gün önce ve son gün belirlenen saatte; geçmişi atlar', () => {
    const due = new Date(2026, 10, 19);
    const now = new Date(2026, 10, 17, 12, 0);
    const r = planReminders(due, { offsets: ['D-3', 'D-1', 'D0'], hour: 9, minute: 30 }, now);
    expect(r.map((x) => x.offset)).toEqual(['D-1', 'D0']);
    expect(r[0].fireAt).toEqual(new Date(2026, 10, 18, 9, 30));
  });
});

describe('özel kategori', () => {
  it('Türkçe adı korur, boş adı reddeder', () => {
    const cat = createCustomCategory({ name: ' Evcil Dostum ', kind: 'daily', icon: 'paw', colorIndex: 9 });
    expect(cat.name).toBe('Evcil Dostum');
    expect(cat.id.startsWith('custom-evcil-dostum-')).toBe(true);
    expect(cat.color).toBe('#F2C46D');
    expect(() => createCustomCategory({ name: '  ', kind: 'daily', icon: 'paw', colorIndex: 0 })).toThrow();
  });
});

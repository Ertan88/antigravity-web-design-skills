import { describe, expect, it } from '@jest/globals';
import { demoState } from '../../store/demoSeed';
import { reducer } from '../../store/reducer';
import { tl } from '../../core/money';
import { buildInbox, buildNotificationPlan, planSignature, unreadCount } from '../plan';

const now = new Date(2026, 10, 17, 15);

describe('bildirim planı', () => {
  const s = demoState(now);
  const plan = buildNotificationPlan(s, now);

  it('zamana göre sıralı; geçmiş saatler atlanır', () => {
    const times = plan.map((p) => p.fireAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times.every((t) => t > now.getTime())).toBe(true);
  });

  it('elektrik: 1 gün önce ve son gün 09:30, Türkçe metin ve Ödedim kategorisi', () => {
    const ele = plan.filter((p) => p.data.refId === 'demo-ele' && p.data.period === '2026-11');
    expect(ele.map((p) => p.title)).toEqual(['Elektrik: yarın son gün', 'Elektrik: bugün son gün']);
    expect(ele[0].fireAt).toEqual(new Date(2026, 10, 18, 9, 30));
    expect(ele[1].body).toBe('≈ ₺845,30 · son ödeme 19 Kasım. Gecikme faizi işlemeden öde.');
    expect(ele[1].category).toBe('bill-reminder');
    expect(ele[1].data).toEqual({ kind: 'bill', refId: 'demo-ele', period: '2026-11' });
  });

  it('kart: kalan ve asgari tutar, Ödeme kaydet kategorisi + ekstre kesim bildirimi', () => {
    const card = plan.filter((p) => p.data.kind === 'card');
    expect(card[0].title).toBe('Maaş Kartım ekstresi: 3 gün kaldı');
    expect(card[0].fireAt).toEqual(new Date(2026, 10, 25, 9, 30));
    expect(card[0].body).toBe('≈ ₺23.383,80 · asgari ₺4.676,76 · son ödeme 28 Kasım');
    expect(card[0].category).toBe('card-reminder');
    const cut = plan.find((p) => p.data.kind === 'statement')!;
    expect(cut.title).toBe('Maaş Kartım: Kasım ekstren kesildi');
    expect(cut.fireAt).toEqual(new Date(2026, 10, 18, 9, 30));
  });

  it('ödenen fatura ve kapatılan hatırlatmalar plandan çıkar', () => {
    let st = reducer(s, { type: 'bill/markPaid', id: 'demo-ele', period: '2026-11' });
    st = { ...st, bills: st.bills.map((b) => (b.id === 'demo-rent' ? { ...b, reminders: { ...b.reminders, offsets: [] } } : b)) };
    const p2 = buildNotificationPlan(st, now);
    expect(p2.filter((p) => p.data.refId === 'demo-ele' && p.data.period === '2026-11')).toHaveLength(0);
    expect(p2.filter((p) => p.data.refId === 'demo-rent')).toHaveLength(0);
    expect(planSignature(p2)).not.toBe(planSignature(plan));
  });

  it('iOS sınırı için en yakın N tanesi', () => {
    expect(buildNotificationPlan(s, now, { max: 3 })).toHaveLength(3);
    expect(planSignature(buildNotificationPlan(s, now))).toBe(planSignature(plan));
  });
});

describe('bildirim kutusu ve gelir hatırlatmaları', () => {
  it('yalnızca geçmiş hatırlatmalar, en yeni üstte, durumla', () => {
    const s = demoState(now);
    s.bills = s.bills.map((b) => (b.id === 'demo-water' ? { ...b, recurrence: { type: 'monthly' as const, dueDay: 15 }, createdAt: '2026-10-01' } : b));
    s.bills = s.bills.map((b) => (b.id === 'demo-water' ? { ...b, paidPeriods: ['2026-11'], paidLog: { '2026-11': '2026-11-14T10:00:00Z' } } : b));
    const inbox = buildInbox(s, now);
    expect(inbox.every((i) => i.fireAt.getTime() <= now.getTime())).toBe(true);
    const water = inbox.filter((i) => i.data.refId === 'demo-water' && i.data.period === '2026-11');
    expect(water.map((w) => w.title)).toEqual(['Su: bugün son gün', 'Su: yarın son gün', 'Su: 3 gün kaldı']);
    expect(water.every((w) => w.status === 'paid')).toBe(true);
    const oct = inbox.filter((i) => i.data.refId === 'demo-water' && i.data.period === '2026-10');
    expect(oct.every((w) => w.status === 'overdue')).toBe(true);
    expect(unreadCount(inbox, now.toISOString())).toBe(0);
    expect(unreadCount(inbox)).toBe(inbox.length);
  });

  it('değişken gelir: yattığı gün "yattı mı?"; tutar girilince planlanmaz', () => {
    const s = demoState(now);
    const extra = buildNotificationPlan(s, now).filter((p) => p.data.kind === 'income');
    expect(extra[0]).toMatchObject({ title: 'Ek ders yattı mı?', data: { refId: 'demo-extra', period: '2026-11' } });
    const logged = reducer(s, { type: 'income/log', id: 'demo-extra', period: '2026-11', amount: tl(6_400) });
    expect(buildNotificationPlan(logged, now).some((p) => p.id === 'income:demo-extra:2026-11')).toBe(false);
  });
});

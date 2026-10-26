import { describe, expect, it } from 'vitest';
import { applyDayPlan, dayPlanLabel, type DayPlan } from './control.ts';
import { generatePeriods } from './bell.ts';
import { resolveScreenDisplay } from './screen.ts';

const day = generatePeriods({ firstStart: '08:30', lessonMin: 40, breakMin: 10, count: 6, lunchAfter: 4, lunchMin: 45 });
const plan = (p: Partial<DayPlan>): DayPlan => ({ date: '2026-10-26', mode: 'normal', lessonMin: null, shifts: [], note: null, ...p });

describe('günün planı', () => {
  it('plan yoksa zil saatleri aynen kalır', () => {
    expect(applyDayPlan(day, null)).toEqual(day);
    expect(applyDayPlan(day, plan({}))).toEqual(day);
  });

  it('kısaltılmış gün: dersler kısalır, teneffüs ve öğle arası süreleri korunur', () => {
    const short = applyDayPlan(day, plan({ mode: 'short', lessonMin: 30 }));
    expect(short.map((p) => `${p.no} ${p.start}-${p.end}`)).toEqual([
      '1 08:30-09:00',
      '2 09:10-09:40',
      '3 09:50-10:20',
      '4 10:30-11:00',
      // 4. dersten sonra 45 dk öğle arası
      '5 11:45-12:15',
      '6 12:25-12:55',
    ]);
  });

  it('kısaltılmış günde süre verilmezse 30 dakika kullanılır', () => {
    expect(applyDayPlan(day, plan({ mode: 'short' }))[0]).toMatchObject({ start: '08:30', end: '09:00' });
  });

  it('zil kaydırma: süren dersin bitişi ve sonraki dersler kayar, öncekiler kalır', () => {
    // 2. ders 09:20-10:00; 09:45'te tören uzadı, +10 dk
    const shifted = applyDayPlan(day, plan({ shifts: [{ from: '09:45', minutes: 10 }] }));
    expect(shifted[0]).toMatchObject({ start: '08:30', end: '09:10' });
    expect(shifted[1]).toMatchObject({ start: '09:20', end: '10:10' });
    expect(shifted[2]).toMatchObject({ start: '10:20', end: '11:00' });
    expect(shifted[5]!.end).toBe('14:05');
  });

  it('kaydırmalar art arda uygulanır, geri alınabilir', () => {
    const back = applyDayPlan(day, plan({ shifts: [{ from: '09:45', minutes: 10 }, { from: '09:50', minutes: -10 }] }));
    expect(back[2]).toMatchObject({ start: '10:10', end: '10:50' });
  });

  it('panoda görünen etiket', () => {
    expect(dayPlanLabel(null)).toBeNull();
    expect(dayPlanLabel(plan({}))).toBeNull();
    expect(dayPlanLabel(plan({ mode: 'exam' }))).toBe('Sınav günü');
    expect(dayPlanLabel(plan({ shifts: [{ from: '09:00', minutes: 5 }, { from: '10:00', minutes: 10 }] }))).toBe('Zil +15 dk');
    expect(dayPlanLabel(plan({ mode: 'ceremony', shifts: [{ from: '09:00', minutes: -5 }] }))).toBe('Tören / özel gün · Zil −5 dk');
  });
});

describe('ekran biçimi', () => {
  it('tam ekran saat modu tanınır', () => {
    expect(resolveScreenDisplay({ mode: 'clock' }).mode).toBe('clock');
    expect(resolveScreenDisplay({ mode: 'video' as never }).mode).toBe('board');
  });
});

import { describe, expect, it } from '@jest/globals';
import { AppSettings, IncomeSource } from '../model';
import { tl } from '../money';
import { DEFAULT_REMINDERS } from '../reminders';
import { expectedIncome, incomeSince } from '../income';
import { migrate, reducer, initialState } from '../../store/reducer';

const ek: IncomeSource = { id: 'ek', name: 'Ek ders', day: 1, amount: tl(6_000), variable: true };
const maas: IncomeSource = { id: 'maas', name: 'Maaş', day: 15, amount: tl(46_000), variable: false };
const settings = (log: Record<string, Record<string, number>> = {}): AppSettings => ({ defaultReminders: DEFAULT_REMINDERS, incomes: [ek, maas], incomeLog: log });

describe('değişken gelir', () => {
  it('kayıt yoksa ilk tahmin; kayıt varsa son 3 ayın ortalaması; o ayın kaydı varsa gerçek tutar', () => {
    expect(expectedIncome(ek, settings(), '2026-11')).toEqual({ amount: tl(6_000), actual: false, estimated: true });
    const s = settings({ ek: { '2026-07': tl(1_000), '2026-08': tl(5_000), '2026-09': tl(6_000), '2026-10': tl(7_000) } });
    expect(expectedIncome(ek, s, '2026-11')).toEqual({ amount: tl(6_000), actual: false, estimated: true });
    const s2 = settings({ ek: { '2026-11': tl(6_431.2) } });
    expect(expectedIncome(ek, s2, '2026-11')).toEqual({ amount: tl(6_431.2), actual: true, estimated: false });
    expect(expectedIncome(maas, s2, '2026-11')).toEqual({ amount: tl(46_000), actual: false, estimated: false });
  });

  it('bakiye girildikten sonra yatıp tutarı girilen gelir bakiyeye eklenir', () => {
    const s = settings({ ek: { '2026-12': tl(6_200) } });
    expect(incomeSince(s, new Date(2026, 10, 20), new Date(2026, 11, 3))).toBe(tl(6_200));
    expect(incomeSince(s, new Date(2026, 11, 2), new Date(2026, 11, 3))).toBe(0);
  });

  it('eski tek maaş kaydı gelir kaynağına taşınır; kayıt eklenip silinebilir', () => {
    const m = migrate({ ...initialState, settings: { defaultReminders: DEFAULT_REMINDERS, salaryDay: 15, salaryAmount: tl(50_000) } });
    expect(m.settings.incomes).toEqual([{ id: 'salary', name: 'Maaş', day: 15, amount: tl(50_000), variable: false }]);
    let st = reducer(m, { type: 'income/log', id: 'salary', period: '2026-11', amount: tl(49_000) });
    expect(st.settings.incomeLog).toEqual({ salary: { '2026-11': tl(49_000) } });
    st = reducer(st, { type: 'income/log', id: 'salary', period: '2026-11', amount: null });
    expect(st.settings.incomeLog).toEqual({ salary: {} });
  });
});

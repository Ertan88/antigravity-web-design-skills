import { describe, expect, it } from 'vitest';
import { normalizeTime, planConflict, planSentence, presetEnd, untilChoiceOf, endOfDay, hasAdvancedPlan } from './announcementPlan.ts';

const any = { days: [], from: null, to: null, phase: 'any' as const };
const now = new Date(2026, 10, 12, 10, 30); // 12 Kasım 2026 Perşembe 10.30

describe('yayın planı (Nerede ve ne zaman)', () => {
  it('hazır süreler seçilen gün sayısı sonunda gece yarısı biter; düzenlemede doğru çip bulunur', () => {
    expect(presetEnd(1, now)).toEqual(new Date(2026, 10, 13));
    expect(presetEnd(7, now)).toEqual(new Date(2026, 10, 19));
    expect(untilChoiceOf(new Date(2026, 10, 19), now)).toBe('7');
    expect(untilChoiceOf(null, now)).toBe('none');
    expect(untilChoiceOf(new Date(2026, 10, 25, 17, 0), now)).toBe('date');
    expect(endOfDay(new Date(2026, 10, 20, 15, 0))).toEqual(new Date(2026, 10, 21));
  });

  it('tek cümlelik açıklama: panolar, bitiş, günler, saatler ve zil durumu', () => {
    expect(planSentence(null, new Date(2026, 10, 19), any, [])).toBe('Bütün panolarda, 18 Kasım Çarşamba gününün sonuna kadar gösterilir.');
    expect(planSentence(null, null, { days: [1, 2, 3, 4, 5], from: '12:00', to: '13:30', phase: 'break' }, ['Kantin'])).toBe(
      'Kantin panosunda, süresiz, hafta içi her gün, 12:00–13:30 saatleri arasında, yalnızca teneffüs ve öğle arasında gösterilir.',
    );
  });

  it('birbirini dışlayan seçimler uyarılır', () => {
    // 13–14 Kasım (Cuma, Cumartesi) ama yalnızca Pazartesi
    expect(planConflict(new Date(2026, 10, 13), new Date(2026, 10, 15), { ...any, days: [1] }, now)).toMatch(/hiç görünmez/);
    expect(planConflict(null, new Date(2026, 10, 19), { ...any, days: [1] }, now)).toBeNull();
    expect(planConflict(null, null, { ...any, days: [1] }, now)).toBeNull();
    // Gelişmiş ayar olmasa da: geçmiş bitiş ve başlangıçtan önceki bitiş uyarılır
    expect(planConflict(null, new Date(2026, 10, 10), any, now)).toMatch(/geçmiş/);
    expect(planConflict(new Date(2026, 10, 20), new Date(2026, 10, 18), any, now)).toMatch(/başlangıçtan önce/);
    expect(planConflict(new Date(2026, 10, 1), new Date(2026, 10, 18), any, now)).toBeNull();
  });

  it('gelişmiş zamanlama kullanılmış mı; saat yazımı', () => {
    expect(hasAdvancedPlan(null, any, now)).toBe(false);
    expect(hasAdvancedPlan(null, { ...any, phase: 'break' }, now)).toBe(true);
    expect(hasAdvancedPlan(new Date(2026, 10, 14), any, now)).toBe(true);
    expect(normalizeTime('8.30')).toBe('08:30');
    expect(normalizeTime('1245')).toBe('12:45');
    expect(normalizeTime('25:00')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { dueTrialReminder, slugify, trialStatus } from './subscription.ts';

const day = 86400_000;
const now = Date.parse('2026-10-27T09:00:00Z');

describe('deneme süresi', () => {
  it('kalan günü ve bitişi hesaplar; ücretli pakette yoktur', () => {
    expect(trialStatus({ plan: 'trial', trialEndsAt: new Date(now + 6.5 * day) }, now)).toMatchObject({ expired: false, daysLeft: 7 });
    expect(trialStatus({ plan: 'trial', trialEndsAt: new Date(now - 1000) }, now)).toMatchObject({ expired: true, daysLeft: 0 });
    expect(trialStatus({ plan: 'pro', trialEndsAt: new Date(now - day) }, now)).toBeNull();
  });

  it('hatırlatmalar 7, 3, 1 gün kala ve bitince bir kez gider', () => {
    const at = (d: number) => trialStatus({ plan: 'trial', trialEndsAt: new Date(now + d * day) }, now);
    expect(dueTrialReminder(at(10), null)).toBeNull();
    expect(dueTrialReminder(at(7), null)).toBe(7);
    expect(dueTrialReminder(at(6), 7)).toBeNull();
    expect(dueTrialReminder(at(2), 7)).toBe(3);
    // Sunucu birkaç gün kapalı kaldıysa yalnızca en güncel eşik gider
    expect(dueTrialReminder(at(1), 7)).toBe(1);
    expect(dueTrialReminder(at(-1), 1)).toBe(0);
    expect(dueTrialReminder(at(-5), 0)).toBeNull();
  });

  it('okul adından kısa ad üretir', () => {
    expect(slugify('Şehit Öğretmen İlkokulu')).toBe('sehit-ogretmen-ilkokulu');
    expect(slugify('  Çağlayan  Anadolu Lisesi!  ')).toBe('caglayan-anadolu-lisesi');
  });
});

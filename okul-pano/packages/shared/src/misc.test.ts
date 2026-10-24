import { describe, expect, it } from 'vitest';
import { formatPersonName, isWithinWindow, weatherInfo } from './display.ts';
import { effectivePermissions, hasPermission } from './permissions.ts';
import { announcementSchema, pairScreenSchema } from './schemas.ts';
import { countdown, formatDuration, isBirthdayToday, upcomingMonthDays, zonedParts } from './time.ts';
import { parseYouTubeUrl } from './youtube.ts';

describe('zonedParts', () => {
  it('cihaz saat diliminden bağımsız olarak okulun yerel saatini verir', () => {
    // 2026-10-29 06:30 UTC = 09:30 İstanbul (UTC+3), Perşembe
    const p = zonedParts(new Date('2026-10-29T06:30:00Z'), 'Europe/Istanbul');
    expect(p).toMatchObject({ isoDate: '2026-10-29', weekday: 4, hour: 9, minute: 30, monthDay: '10-29' });
  });

  it('gün dönümünü saat dilimine göre hesaplar', () => {
    const p = zonedParts(new Date('2026-12-31T22:30:00Z'), 'Europe/Istanbul');
    expect(p.isoDate).toBe('2027-01-01');
    expect(upcomingMonthDays(new Date('2026-12-30T12:00:00Z'), 'Europe/Istanbul', 3)).toEqual([
      '12-30',
      '12-31',
      '01-01',
    ]);
  });
});

describe('süre biçimleri', () => {
  it('geri sayımı gün/saat/dakikaya böler', () => {
    const now = Date.parse('2026-10-24T09:00:00Z');
    expect(countdown(now + (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000, now)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      done: false,
    });
    expect(countdown(now - 1000, now).done).toBe(true);
  });

  it('kalan süreyi MM:SS biçiminde verir', () => {
    expect(formatDuration(14 * 60 + 5)).toBe('14:05');
    expect(formatDuration(3723)).toBe('1:02:03');
  });
});

describe('doğum günleri', () => {
  it('29 Şubat doğumlularını artık olmayan yılda 28 Şubat günü kutlar', () => {
    const feb28 = zonedParts(new Date('2027-02-28T09:00:00Z'), 'Europe/Istanbul');
    expect(isBirthdayToday('02-29', feb28)).toBe(true);
    const feb28Leap = zonedParts(new Date('2028-02-28T09:00:00Z'), 'Europe/Istanbul');
    expect(isBirthdayToday('02-29', feb28Leap)).toBe(false);
  });

  it('isimleri KVKK dostu biçimde kısaltır', () => {
    expect(formatPersonName('Ayşe Nur Yılmaz', 'initial')).toBe('Ayşe Nur Y.');
    expect(formatPersonName('ali ışık', 'initial')).toBe('ali I.');
    expect(formatPersonName('Mehmet', 'initial')).toBe('Mehmet');
    expect(formatPersonName('Ayşe Nur Yılmaz', 'full')).toBe('Ayşe Nur Yılmaz');
  });
});

describe('parseYouTubeUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s', (url, id) => {
    expect(parseYouTubeUrl(url)?.id).toBe(id);
  });

  it('başlangıç zamanını okur, geçersiz bağlantıyı reddeder', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toEqual({ id: 'dQw4w9WgXcQ', start: 90 });
    expect(parseYouTubeUrl('https://vimeo.com/123')).toBeNull();
    expect(parseYouTubeUrl('https://youtube.com/watch?v=kisa')).toBeNull();
  });
});

describe('yetkiler', () => {
  it('yönetici her şeye, editör yalnızca verilen yetkilere sahiptir', () => {
    expect(hasPermission('admin', [], 'users.manage')).toBe(true);
    expect(hasPermission('editor', ['announcements.manage'], 'announcements.manage')).toBe(true);
    expect(hasPermission('editor', ['announcements.manage'], 'ticker.manage')).toBe(false);
  });

  it('editöre kullanıcı yönetimi yetkisi verilse bile etkisizdir', () => {
    expect(effectivePermissions('editor', ['users.manage', 'ticker.manage'])).toEqual(['ticker.manage']);
  });
});

describe('şemalar', () => {
  it('video duyurusu geçerli YouTube bağlantısı ister', () => {
    const bad = announcementSchema.safeParse({ title: 'Tören', kind: 'video', youtubeUrl: 'https://example.com' });
    expect(bad.success).toBe(false);
    const ok = announcementSchema.safeParse({ title: 'Tören', kind: 'video', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(ok.success).toBe(true);
  });

  it('eşleştirme kodunu normalize eder', () => {
    expect(pairScreenSchema.parse({ code: 'k7p-4qx', name: 'Giriş holü' }).code).toBe('K7P4QX');
  });

  it('yayın aralığını kontrol eder', () => {
    const now = Date.parse('2026-10-24T09:00:00Z');
    expect(isWithinWindow(now, null, null)).toBe(true);
    expect(isWithinWindow(now, '2026-10-25T00:00:00Z', null)).toBe(false);
    expect(isWithinWindow(now, null, '2026-10-24T09:00:00Z')).toBe(false);
  });

  it('hava durumu kodlarını Türkçeleştirir', () => {
    expect(weatherInfo(0, true)).toEqual({ label: 'Açık', icon: 'sun' });
    expect(weatherInfo(63, true).label).toBe('Yağmurlu');
  });
});

import { describe, expect, it } from 'vitest';
import { announcementOnAir } from './display.ts';
import { quoteOfDay, todayInHistory } from './tickerContent.ts';
import { weatherAlerts } from './weather.ts';

const at = (hm: string) => Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(3, 5)) * 60;

describe('duyuru yayın akışı', () => {
  it('kısıtsız duyuru her zaman yayında', () => {
    expect(announcementOnAir(null, { weekday: 3, secondsOfDay: at('10:00'), phase: 'lesson' })).toBe(true);
  });
  it('yalnızca teneffüste', () => {
    const s = { days: [], from: null, to: null, phase: 'break' as const };
    expect(announcementOnAir(s, { weekday: 1, secondsOfDay: at('10:00'), phase: 'break' })).toBe(true);
    expect(announcementOnAir(s, { weekday: 1, secondsOfDay: at('10:00'), phase: 'lesson' })).toBe(false);
    expect(announcementOnAir(s, { weekday: 1, secondsOfDay: at('20:00'), phase: 'other' })).toBe(false);
  });
  it('gün ve saat aralığı', () => {
    const s = { days: [1, 3], from: '12:00', to: '13:30', phase: 'any' as const };
    expect(announcementOnAir(s, { weekday: 3, secondsOfDay: at('12:30'), phase: 'other' })).toBe(true);
    expect(announcementOnAir(s, { weekday: 2, secondsOfDay: at('12:30'), phase: 'other' })).toBe(false);
    expect(announcementOnAir(s, { weekday: 1, secondsOfDay: at('13:30'), phase: 'other' })).toBe(false);
    expect(announcementOnAir(s, { weekday: 1, secondsOfDay: at('11:59'), phase: 'other' })).toBe(false);
  });
});

describe('hava durumu uyarıları', () => {
  const base = { weatherCode: [1, 1], tempMax: [20, 20], tempMin: [10, 10], snowfall: [0, 0], gustMax: [10, 10] };
  it('sakin havada uyarı yok', () => expect(weatherAlerts(base)).toEqual([]));
  it('yarın yoğun kar', () => {
    expect(weatherAlerts({ ...base, snowfall: [0, 12], weatherCode: [3, 75] })).toEqual([{ kind: 'snow', day: 'tomorrow', text: 'Yarın yoğun kar yağışı bekleniyor' }]);
  });
  it('aşırı sıcak ve fırtına', () => {
    const a = weatherAlerts({ ...base, tempMax: [38, 30], gustMax: [70, 10] });
    expect(a.map((x) => x.kind)).toEqual(['heat', 'storm']);
  });
});

describe('kayan yazı içerikleri', () => {
  it('bugün tarihte', () => {
    expect(todayInHistory('10-29')[0]).toContain('Cumhuriyet');
    expect(todayInHistory('02-30')).toEqual([]);
  });
  it('günün sözü gün içinde sabit, ertesi gün değişir', () => {
    expect(quoteOfDay('2026-10-29')).toEqual(quoteOfDay('2026-10-29'));
    expect(quoteOfDay('2026-10-29')).not.toEqual(quoteOfDay('2026-10-30'));
  });
});

describe('birleşik kartlar', () => {
  it('düzende birleşik kart tutulur, tek kartı kalan düz karta döner, tekrarlar ayıklanır', async () => {
    const { cleanLayout, layoutModules } = await import('./layout.ts');
    const { boardLayoutSchema } = await import('./schemas.ts');
    const l = cleanLayout({ left: ['duties', ['leaves', 'birthdays']], right: ['bell', ['events', 'events' as never], 'book'] });
    expect(l).toEqual({ left: ['duties', ['leaves', 'birthdays']], right: ['bell', 'events', 'book'] });
    expect(layoutModules(l)).toEqual(['duties', 'leaves', 'birthdays', 'bell', 'events', 'book']);
    expect(boardLayoutSchema.safeParse({ left: [['leaves', 'birthdays']], right: ['leaves'] }).success).toBe(false);
    expect(boardLayoutSchema.safeParse({ left: [['leaves', 'birthdays']], right: ['bell'] }).success).toBe(true);
  });
});

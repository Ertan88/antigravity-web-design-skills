import { describe, expect, it } from 'vitest';
import { isSleepTime, resolveScreenDisplay } from './screen.ts';

const settings = { sleepMode: 'screensaver' as const, sleepAfterMin: 30, sleepBeforeMin: 30, sleepOffDays: true };
const periods = [
  { no: 1, start: '08:30', end: '09:10' },
  { no: 2, start: '09:20', end: '15:00' },
];
const at = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h! * 3600 + m! * 60;
};

describe('isSleepTime', () => {
  it('ders saatlerinde ve yarım saat öncesi/sonrasında uyanık', () => {
    expect(isSleepTime({ settings, periods, secondsOfDay: at('08:00'), offDay: false })).toBe(false);
    expect(isSleepTime({ settings, periods, secondsOfDay: at('12:00'), offDay: false })).toBe(false);
    expect(isSleepTime({ settings, periods, secondsOfDay: at('15:29'), offDay: false })).toBe(false);
  });
  it('gece uyur', () => {
    expect(isSleepTime({ settings, periods, secondsOfDay: at('07:59'), offDay: false })).toBe(true);
    expect(isSleepTime({ settings, periods, secondsOfDay: at('15:30'), offDay: false })).toBe(true);
    expect(isSleepTime({ settings, periods, secondsOfDay: at('23:00'), offDay: false })).toBe(true);
  });
  it('hafta sonu ayara göre, kapalıyken hiç', () => {
    expect(isSleepTime({ settings, periods: null, secondsOfDay: at('12:00'), offDay: true })).toBe(true);
    expect(isSleepTime({ settings: { ...settings, sleepOffDays: false }, periods: null, secondsOfDay: at('12:00'), offDay: true })).toBe(false);
    expect(isSleepTime({ settings: { ...settings, sleepMode: 'off' }, periods, secondsOfDay: at('23:00'), offDay: false })).toBe(false);
  });
  it('zil çizelgesi yoksa iş günü uyumaz', () => {
    expect(isSleepTime({ settings, periods: null, secondsOfDay: at('23:00'), offDay: false })).toBe(false);
  });
});

describe('resolveScreenDisplay', () => {
  it('varsayılanlar ve sınırlar', () => {
    expect(resolveScreenDisplay(null).mode).toBe('board');
    expect(resolveScreenDisplay({ mode: 'wall' as never }).mode).toBe('board');
    expect(resolveScreenDisplay({ orientation: 'portrait', mode: 'slides' })).toEqual({ orientation: 'portrait', mode: 'slides' });
  });
});

import { describe, expect, it } from 'vitest';
import { calendarLeaves } from './calendarLeaves.ts';

const cal = {
  lessonsStart: '2026-09-14',
  term1End: '2027-01-22',
  term2Start: '2027-02-08',
  lessonsEnd: '2027-06-25',
  breaks: [
    { name: 'Birinci Dönem Ara Tatili', start: '2026-11-16', end: '2026-11-20' },
    { name: 'İkinci Dönem Ara Tatili', start: '2027-03-08', end: '2027-03-12' },
  ],
};

describe('takvim yaprakları', () => {
  const leaves = calendarLeaves(cal, 2026);
  const byName = (n: string) => leaves.find((l) => l.name === n)!;

  it('MEB tarihleri ve tatiller sıralı, iki dönemde', () => {
    const dates = leaves.map((l) => l.start);
    expect([...dates].sort()).toEqual(dates);
    expect(byName('Dersler başlar').group).toBe(1);
    expect(byName('2. dönem başlar').group).toBe(2);
    expect(byName('1. dönem ara tatili')).toMatchObject({ start: '2026-11-16', end: '2026-11-20', note: '5 gün' });
    expect(byName('Yarıyıl tatili').note).toBe('2 hafta');
  });

  it('bayram günleri tek satır, arife notta; okul tatiline denk gelen belirtilir', () => {
    const ramazan = byName('Ramazan Bayramı');
    expect(ramazan).toMatchObject({ kind: 'religious', start: '2027-03-09', end: '2027-03-11', group: 2 });
    expect(ramazan.note).toContain('arife 8 Mart öğleden sonra');
    expect(ramazan.note).toContain('ara tatili içinde');
    expect(byName('Kurban Bayramı')).toMatchObject({ start: '2027-05-16', end: '2027-05-19' });
    const cumhuriyet = byName('Cumhuriyet Bayramı');
    expect(cumhuriyet).toMatchObject({ kind: 'official', start: '2026-10-29' });
    expect(cumhuriyet.note).toContain('arife 28 Ekim');
    // 1 Mayıs 2027 cumartesi
    expect(byName('Emek ve Dayanışma Günü').note).toBe('hafta sonuna denk geliyor');
    // Yaz tatilindeki günler
    expect(byName('Zafer Bayramı').note).toBe('yaz tatili içinde');
    expect(leaves.some((l) => l.name.includes('Arifesi'))).toBe(false);
    // 19 Mayıs 2027 Kurban Bayramı'nın 4. günü: ikisi de görünür
    expect(byName("Atatürk'ü Anma, Gençlik ve Spor Bayramı")).toMatchObject({ start: '2027-05-19', kind: 'official', note: 'Kurban Bayramı içinde' });
    expect(byName('Kurban Bayramı').end).toBe('2027-05-19');
  });
});

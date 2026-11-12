import { describe, expect, it } from 'vitest';
import { autoSlideSeconds, readingSeconds, slideSeconds, slideWordCount } from './slideDuration.ts';

describe('duyuru süresi (okuma süresi)', () => {
  it('kelimeleri sayar: başlık, metin ve hazır tasarım alanları; noktalama kelime sayılmaz', () => {
    expect(slideWordCount({ title: 'Veli toplantısı', body: 'Cumartesi 10.00 — konferans salonunda.' })).toBe(6);
    expect(slideWordCount({ title: 'Kitap', design: { fields: { a: 'Haftanın kitabı', b: 'Küçük Prens' } } })).toBe(5);
  });

  it('kısa duyuru okulun varsayılanında kalır, uzun duyuru uzar, en çok üst sınıra kadar', () => {
    const short = { title: 'Bayramınız kutlu olsun' };
    expect(autoSlideSeconds(short, 10)).toBe(10);
    const medium = { title: 'Sınav kaygısı', body: Array(58).fill('kelime').join(' ') };
    expect(readingSeconds(medium)).toBe(Math.ceil(60 / 2.2) + 3);
    expect(autoSlideSeconds(medium, 10)).toBe(31);
    const long = { title: 'Uzun', body: Array(400).fill('kelime').join(' ') };
    expect(autoSlideSeconds(long, 10)).toBe(60);
    expect(autoSlideSeconds(long, 10, 45)).toBe(45);
  });

  it('elle girilen süre olduğu gibi kullanılır; varsayılan üst sınırdan uzunsa üst sınır varsayılana çekilir', () => {
    expect(slideSeconds({ title: 'X', durationSec: 90 }, 10)).toBe(90);
    expect(autoSlideSeconds({ title: 'Uzun ' + Array(400).fill('k').join(' ') }, 80, 60)).toBe(80);
  });
});

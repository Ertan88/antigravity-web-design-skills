import { describe, expect, it } from 'vitest';
import { academicHolidays, academicYearOf, isCalendarTitle, parseMebCalendar, seminarPeriods, semesterBreak, validateAcademicCalendar } from './academicCalendar.ts';

// MEB duyurusu üslubu (2025-2026)
const MEB_2025 = `2025-2026 Eğitim Öğretim Yılı Çalışma Takvimi Açıklandı.
Millî Eğitim Bakanlığı, 2025-2026 eğitim öğretim yılı çalışma takvimini belirledi. Buna göre öğretmenlerin mesleki
çalışmaları 1 Eylül 2025 Pazartesi günü başlayacak. Okul öncesi ve 1. sınıflarda uyum haftası 1-5 Eylül 2025 tarihlerinde yapılacak.
2025-2026 eğitim ve öğretim yılında dersler 8 Eylül 2025 Pazartesi günü başlayacak. Birinci dönem ara tatili 10-14 Kasım 2025
tarihleri arasında yapılacak. Birinci dönem 16 Ocak 2026 Cuma günü sona erecek. Yarıyıl tatili 19 Ocak 2026 Pazartesi günü
başlayacak ve 30 Ocak 2026 Cuma günü sona erecek. İkinci dönem 2 Şubat 2026 Pazartesi günü başlayacak. İkinci dönem ara tatili
16-20 Mart 2026 tarihleri arasında yapılacak. 2025-2026 eğitim öğretim yılı 26 Haziran 2026 Cuma günü sona erecek.
Öğretmenlerin yıl sonu mesleki çalışmaları 29-30 Haziran 2026 tarihlerinde yapılacak.`;

// Haber üslubu (2026-2027): aralıklar tek cümlede, yıl yazılmayan tarihler
const NEWS_2026 = `MEB, 2026-2027 eğitim öğretim yılı takvimini belirledi. Okullarda dersler 14 Eylül Pazartesi günü başlayacak.
Birinci dönem ara tatili 16-20 Kasım 2026, ikinci dönem ara tatili ise 8-12 Mart 2027 tarihlerinde yapılacak.
Birinci dönem 22 Ocak 2027'de sona erecek; yarıyıl tatili 25 Ocak-5 Şubat 2027 tarihleri arasında olacak.
Ders yılı 25 Haziran 2027 Cuma günü sona erecek. Öğretmenler 28-30 Haziran 2027'de mesleki çalışma yapacak.`;

describe('MEB çalışma takvimi', () => {
  it('MEB duyurusunu okur; öğretmen mesleki çalışması ve uyum haftası karışmaz', () => {
    expect(parseMebCalendar(MEB_2025, 2025)).toEqual({
      lessonsStart: '2025-09-08',
      term1End: '2026-01-16',
      term2Start: '2026-02-02',
      lessonsEnd: '2026-06-26',
      breaks: [
        { name: 'Birinci Dönem Ara Tatili', start: '2025-11-10', end: '2025-11-14' },
        { name: 'İkinci Dönem Ara Tatili', start: '2026-03-16', end: '2026-03-20' },
      ],
      // "mesleki çalışmaları 1 Eylül'de başlayacak" (bitiş: derslerden önceki cuma) ve "yıl sonu mesleki çalışmaları 29-30 Haziran"
      seminars: [
        { start: '2025-09-01', end: '2025-09-05' },
        { start: '2026-06-29', end: '2026-06-30' },
      ],
    });
  });

  it('haber üslubunu da okur (yılsız tarih, tek cümlede iki ara tatil, aralık yarıyıl)', () => {
    expect(parseMebCalendar(NEWS_2026, 2026)).toEqual({
      lessonsStart: '2026-09-14',
      term1End: '2027-01-22',
      term2Start: '2027-02-08',
      lessonsEnd: '2027-06-25',
      breaks: [
        { name: 'Birinci Dönem Ara Tatili', start: '2026-11-16', end: '2026-11-20' },
        { name: 'İkinci Dönem Ara Tatili', start: '2027-03-08', end: '2027-03-12' },
      ],
      // "Öğretmenler 28-30 Haziran 2027'de mesleki çalışma yapacak": anahtar söz tarihten sonra
      seminars: [{ start: '2027-06-28', end: '2027-06-30' }],
    });
  });

  it('takvim olmayan ya da başka yılın metninde null', () => {
    expect(parseMebCalendar('Bakan okulları ziyaret etti.', 2026)).toBeNull();
    expect(parseMebCalendar(MEB_2025, 2026)).toBeNull();
  });

  it('tatil günleri: ara tatiller, yarıyıl ve yaz tatili; seminer günleri tatil değil', () => {
    const cal = parseMebCalendar(NEWS_2026, 2026)!;
    const days = new Map(academicHolidays(cal, 2026).map((d) => [d.date, d.name]));
    expect(days.get('2026-11-18')).toBe('Birinci Dönem Ara Tatili');
    expect(days.get('2027-01-25')).toBe(days.get('2027-02-05'));
    expect(days.get('2027-02-05')).toBe('Yarıyıl Tatili');
    // Hafta sonu kenarları kırpılır: MEB'in duyurduğu gibi 25 Ocak – 5 Şubat
    expect(days.has('2027-01-23')).toBe(false);
    expect(semesterBreak(cal)).toEqual({ start: '2027-01-25', end: '2027-02-05' });
    expect(days.has('2027-02-08')).toBe(false);
    // Ders yılı 25 Haziran'da biter; 28-30 Haziran öğretmenlerin mesleki çalışması: listede yok, yaz tatili 1 Temmuz'da başlar
    expect(days.has('2027-06-28')).toBe(false);
    expect(days.has('2027-06-30')).toBe(false);
    expect(days.get('2027-07-01')).toBe('Yaz Tatili');
    expect(days.get('2027-08-31')).toBe('Yaz Tatili');
    expect(days.has('2027-09-01')).toBe(false);
  });

  it('seminer duyuruda yoksa kuraldan: 1 Eylül – derslerden önceki gün ve ders yılı sonu – 30 Haziran', () => {
    const cal = { lessonsStart: '2026-09-14', term1End: '2027-01-22', term2Start: '2027-02-08', lessonsEnd: '2027-06-25', breaks: [] };
    expect(seminarPeriods(cal, 2026)).toEqual([
      { start: '2026-09-01', end: '2026-09-11' },
      { start: '2027-06-28', end: '2027-06-30' },
    ]);
    const days = new Map(academicHolidays(cal, 2026).map((d) => [d.date, d.name]));
    expect(days.has('2026-09-01')).toBe(false);
    expect(days.has('2026-09-11')).toBe(false);
    expect(days.has('2027-06-29')).toBe(false);
    expect(days.has('2026-09-14')).toBe(false);
    expect(days.get('2027-07-01')).toBe('Yaz Tatili');
    // Dersler 1 Eylül'de başlıyorsa yıl başı semineri yok
    expect(seminarPeriods({ ...cal, lessonsStart: '2026-09-01' }, 2026)).toEqual([{ start: '2027-06-28', end: '2027-06-30' }]);
  });

  it('eğitim yılı ve başlık', () => {
    expect(academicYearOf('2027-03-10')).toBe(2026);
    expect(academicYearOf('2026-09-01')).toBe(2026);
    expect(isCalendarTitle('2026-2027 EĞİTİM ÖĞRETİM YILI TAKVİMİ AÇIKLANDI', 2026)).toBe(true);
    expect(isCalendarTitle('2026-2027 LGS başvuruları', 2026)).toBe(false);
    expect(validateAcademicCalendar({ lessonsStart: '2026-09-14', term1End: '2026-09-01', term2Start: '2027-02-08', lessonsEnd: '2027-06-25', breaks: [] }, 2026)).toMatch(/Sıra/);
  });
});

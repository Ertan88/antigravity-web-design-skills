/**
 * Kayan yazıya eklenebilen hazır içerik: "Bugün tarihte" ve "Günün sözü".
 * Tarihler yalnızca kesin bilinen olaylardan seçildi; o güne kayıt yoksa bir şey eklenmez.
 */
const HISTORY: Record<string, string[]> = {
  '01-10': ['1921 · I. İnönü Muharebesi kazanıldı'],
  '01-30': ['1923 · Türk-Yunan nüfus mübadelesi sözleşmesi imzalandı'],
  '02-15': ['1564 · Galileo Galilei doğdu'],
  '02-17': ['1926 · Türk Medeni Kanunu kabul edildi'],
  '03-03': ['1924 · Tevhid-i Tedrisat Kanunu kabul edildi, halifelik kaldırıldı'],
  '03-08': ['Dünya Kadınlar Günü'],
  '03-12': ['1921 · İstiklal Marşı TBMM\'de kabul edildi'],
  '03-14': ['Tıp Bayramı · 1827\'de ilk modern tıp okulu açıldı', '1879 · Albert Einstein doğdu'],
  '03-18': ['1915 · Çanakkale Deniz Zaferi kazanıldı'],
  '03-21': ['Dünya Ormancılık Günü ve Nevruz'],
  '03-22': ['Dünya Su Günü'],
  '04-07': ['Dünya Sağlık Günü'],
  '04-12': ['1961 · Yuri Gagarin uzaya çıkan ilk insan oldu'],
  '04-17': ['1940 · Köy Enstitüleri kuruldu'],
  '04-22': ['Dünya Günü'],
  '04-23': ['1920 · Türkiye Büyük Millet Meclisi açıldı', 'Dünya Kitap Günü'],
  '05-18': ['Uluslararası Müzeler Günü'],
  '05-19': ['1919 · Mustafa Kemal Samsun\'a çıktı, Millî Mücadele başladı'],
  '05-29': ['1453 · İstanbul fethedildi'],
  '06-05': ['Dünya Çevre Günü'],
  '06-21': ['1934 · Soyadı Kanunu kabul edildi'],
  '06-22': ['1919 · Amasya Genelgesi yayımlandı'],
  '07-10': ['1856 · Nikola Tesla doğdu'],
  '07-15': ['Demokrasi ve Millî Birlik Günü'],
  '07-20': ['1969 · İnsanlık Ay\'a ilk kez ayak bastı'],
  '07-23': ['1919 · Erzurum Kongresi toplandı'],
  '07-24': ['1923 · Lozan Antlaşması imzalandı'],
  '08-26': ['1071 · Malazgirt Meydan Muharebesi kazanıldı', '1922 · Büyük Taarruz başladı'],
  '08-30': ['1922 · Başkomutanlık Meydan Muharebesi kazanıldı'],
  '09-04': ['1919 · Sivas Kongresi toplandı'],
  '09-08': ['1946 · Nobel ödüllü bilim insanı Aziz Sancar doğdu'],
  '09-09': ['1922 · İzmir düşman işgalinden kurtuldu'],
  '09-13': ['1921 · Sakarya Meydan Muharebesi zaferle sonuçlandı'],
  '09-26': ['Dil Bayramı · 1932\'de ilk Türk Dil Kurultayı toplandı'],
  '10-01': ['Dünya Yaşlılar Günü'],
  '10-04': ['Dünya Hayvanları Koruma Günü', '1957 · İlk yapay uydu Sputnik uzaya fırlatıldı'],
  '10-06': ['1923 · İstanbul işgalden kurtuldu'],
  '10-11': ['1910 · Matematikçi Cahit Arf doğdu'],
  '10-13': ['1923 · Ankara başkent oldu'],
  '10-16': ['Dünya Gıda Günü'],
  '10-29': ['1923 · Cumhuriyet ilan edildi'],
  '11-01': ['1922 · Saltanat kaldırıldı', '1928 · Türk Harfleri Kanunu kabul edildi'],
  '11-07': ['1867 · Marie Curie doğdu'],
  '11-10': ['1938 · Gazi Mustafa Kemal Atatürk aramızdan ayrıldı'],
  '11-20': ['Dünya Çocuk Hakları Günü'],
  '11-24': ['Öğretmenler Günü · 1934\'te Mustafa Kemal\'e "Atatürk" soyadı verildi'],
  '12-03': ['Dünya Engelliler Günü'],
  '12-05': ['1934 · Türk kadınına milletvekili seçme ve seçilme hakkı tanındı'],
  '12-10': ['İnsan Hakları Günü'],
  '12-17': ['1273 · Mevlânâ Celâleddîn-i Rûmî\'nin vefatı (Şeb-i Arûs)'],
};

const QUOTES: { text: string; by: string }[] = [
  { text: 'Hayatta en hakiki mürşit ilimdir.', by: 'Mustafa Kemal Atatürk' },
  { text: 'Öğretmenler! Yeni nesil sizin eseriniz olacaktır.', by: 'Mustafa Kemal Atatürk' },
  { text: 'Yurtta sulh, cihanda sulh.', by: 'Mustafa Kemal Atatürk' },
  { text: 'Egemenlik kayıtsız şartsız milletindir.', by: 'Mustafa Kemal Atatürk' },
  { text: 'Sanatsız kalan bir milletin hayat damarlarından biri kopmuş olur.', by: 'Mustafa Kemal Atatürk' },
  { text: 'Muhtaç olduğun kudret, damarlarındaki asil kanda mevcuttur.', by: 'Mustafa Kemal Atatürk' },
  { text: 'Küçük hanımlar, küçük beyler! Sizler hepiniz geleceğin bir gülü, yıldızı, bir ikbal ışığısınız.', by: 'Mustafa Kemal Atatürk' },
  { text: 'Benim naçiz vücudum elbet bir gün toprak olacaktır, ancak Türkiye Cumhuriyeti ilelebet payidar kalacaktır.', by: 'Mustafa Kemal Atatürk' },
  { text: 'Gelin tanış olalım, işi kolay kılalım; sevelim sevilelim, dünya kimseye kalmaz.', by: 'Yunus Emre' },
  { text: 'Ya olduğun gibi görün, ya göründüğün gibi ol.', by: 'Mevlânâ' },
  { text: 'Yaşamak bir ağaç gibi tek ve hür ve bir orman gibi kardeşçesine.', by: 'Nâzım Hikmet' },
  { text: 'Hayal gücü bilgiden daha önemlidir.', by: 'Albert Einstein' },
  { text: 'Eğitim, dünyayı değiştirmek için kullanabileceğiniz en güçlü silahtır.', by: 'Nelson Mandela' },
  { text: 'Damlaya damlaya göl olur.', by: 'Atasözü' },
  { text: 'İşleyen demir ışıldar.', by: 'Atasözü' },
  { text: 'Bir elin nesi var, iki elin sesi var.', by: 'Atasözü' },
  { text: 'Ağaç yaşken eğilir.', by: 'Atasözü' },
  { text: 'Sakla samanı, gelir zamanı.', by: 'Atasözü' },
  { text: 'Bilgi güçtür.', by: 'Francis Bacon' },
  { text: 'Ne kadar bilirsen bil, söylediklerin karşındakinin anlayabildiği kadardır.', by: 'Mevlânâ' },
];

/** "Bugün tarihte": o güne ait kayıtlar (AA-GG) */
export function todayInHistory(monthDay: string): string[] {
  return HISTORY[monthDay] ?? [];
}

/** Günün sözü: tarihe göre sırayla değişir, aynı gün bütün panolarda aynıdır */
export function quoteOfDay(isoDate: string): { text: string; by: string } {
  const day = Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
  return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length]!;
}

import { describe, expect, it } from 'vitest';
import type { PdfItem } from '../src/lib/sheets/eokul.ts';
import { parsePersonnelPages, personnelBranch, personnelTitle } from '../src/lib/sheets/eokulPersonnel.ts';

/*
 * e-Okul "Personel Listesi" PDF'i: sayfanın metin parçaları elle kurulur (uydurma adlar). Gerçek okulun listesi
 * depoya konmaz. Türkçe harfler PDF'teki gibi ayrı parçalara bölünür ("Ö" + "ğ" + "retmen").
 */
const W = 3.2; // karakter başına yaklaşık genişlik (gerçek PDF: "Müdür Yard" 236 → 266)
function piece(str: string, x: number, y: number, bold = false): PdfItem {
  return { str, x, y, w: str.length * W, bold };
}
/** Metni Türkçe harflerden bölerek bitişik parçalar üretir (PDF'teki gibi) */
function split(text: string, x: number, y: number, bold = false): PdfItem[] {
  const out: PdfItem[] = [];
  let cur = x;
  for (const part of text.split(/([ÇĞİÖŞÜçğıöşü])/u).filter(Boolean)) {
    out.push(piece(part, cur, y, bold));
    cur += part.length * W;
  }
  return out;
}
function page(people: [string, string, string, string][], footer?: string): PdfItem[] {
  const items: PdfItem[] = [
    ...split('T.C.', 302, 792, true),
    ...split('ÖRNEK İLİ VALİLİĞİ', 273, 779, true),
    ...split('Örnek / Deneme Mesleki ve Teknik Anadolu Lisesi Müdürlüğü', 180, 765, true),
    ...split('Personel Listesi', 279, 753, true),
    ...split('ADI SOYADI', 35, 726, true),
    ...split('GÖREVİ', 238, 726, true),
    ...split('KADRO DURUMU', 318, 726, true),
    ...split('BRANŞI', 393, 726, true),
  ];
  let y = 713;
  for (const [name, title, status, branch] of people) {
    items.push(...split(name, 35, y), ...split(title, 236, y), ...split(status, 319, y), ...split(branch, 393, y));
    y -= 14.4;
  }
  if (footer) items.push(...split(footer, 136, 629, true));
  items.push(piece('26/11/2026', 468, 67), piece('09:59:52', 528, 67));
  return items;
}

describe('e-Okul personel listesi PDF', () => {
  const pages = [
    page([
      ['DENİZ KARA', 'Müdür', 'KADROLU', 'Bilişim Teknolojileri'],
      ['AYŞE NUR YILMAZ', 'Müdür Yardımcısı', 'KADROLU', 'Türk Dili ve Edebiyatı'],
      ['ÇAĞLAR ÖZTÜRK', 'Atölye Şefi', 'GÖREVLENDİRME', 'Makine Teknolojisi / Makine ve Tasarım Teknolojisi /'],
      ['ŞULE İNCE', 'Laboratuar Şefi', 'GÖREVLENDİRME', 'Elektrik-Elektronik Teknolojisi / Elektronik'],
      ['ALİ VELİ', 'Öğretmen', 'KADROLU', 'Beden Eğitimi'],
    ]),
    page(
      [
        ['GÜLAY ÜNAL', 'Öğretmen', 'KADROLU', 'Din Kültürü ve Ahlâk Bilgisi'],
        ['HASAN ER', 'Öğretmen', 'İLSİS DIŞI', '-'],
        ['ZEYNEP AK', 'Öğretmen', 'KADROLU', 'Rehberlik'],
      ],
      'Toplam Personel Sayısı: 8',
    ),
  ];

  it('ad, görev ve branş okunur; kadro durumu kullanılmaz; başlık ve alt bilgi atlanır', () => {
    const r = parsePersonnelPages(pages);
    expect(r.issues).toEqual([]);
    expect(r.rows.map(({ fullName, title, branch }) => [fullName, title, branch])).toEqual([
      ['Deniz KARA', 'Okul Müdürü', 'Bilişim Teknolojileri'],
      ['Ayşe Nur YILMAZ', 'Müdür Yardımcısı', 'Türk Dili ve Edebiyatı'],
      ['Çağlar ÖZTÜRK', 'Atölye Şefi', 'Makine Teknolojisi'],
      ['Şule İNCE', 'Laboratuar Şefi', 'Elektrik-Elektronik Teknolojisi'],
      ['Ali VELİ', 'Öğretmen', 'Beden Eğitimi ve Spor'],
      ['Gülay ÜNAL', 'Öğretmen', 'Din Kültürü ve Ahlak Bilgisi'],
      ['Hasan ER', 'Öğretmen', null],
      ['Zeynep AK', 'Öğretmen', 'Rehberlik ve Psikolojik Danışmanlık'],
    ]);
  });

  it('toplam kişi sayısı tutmazsa uyarır', () => {
    const r = parsePersonnelPages([pages[0]!, page([['GÜLAY ÜNAL', 'Öğretmen', 'KADROLU', 'Fizik']], 'Toplam Personel Sayısı: 9')]);
    expect(r.issues.map((i) => i.message)).toEqual(['Listede 9 kişi yazıyor, 6 kişi okunabildi. Eksik satırları kontrol edin.']);
  });

  it('personel listesi değilse açıklayıcı hata verir', () => {
    expect(() => parsePersonnelPages([[piece('Sınıf Listesi', 100, 700)]])).toThrow(/personel listesi bulunamadı/);
  });

  it('görev ve branş eşleştirme', () => {
    expect(personnelTitle('Müdür')).toBe('Okul Müdürü');
    expect(personnelTitle('Müdür Yardımcısı')).toBe('Müdür Yardımcısı');
    expect(personnelBranch('Kimya / Kimya Teknolojisi')).toBe('Kimya');
    expect(personnelBranch('İngilizce')).toBe('İngilizce');
    expect(personnelBranch(' - ')).toBeNull();
  });
});

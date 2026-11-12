import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

/*
 * İşletmelerde mesleki eğitim formları (PDF). Her form A5 boyutundadır; iki form bir A4 kâğıda sığar ve ortadan kesilir:
 * günlük rehberlik formu ve aylık rehberlik raporu A5 dikey (A4 yatayda yan yana), aylık devam çizelgesi A5 yatay
 * (A4 dikeyde alt alta). Türkçe karakterler için yazı tipi gömülür (Liberation, SIL OFL). Yazdırırken ölçek
 * "Gerçek boyut" olmalıdır.
 */

const PT = 72 / 25.4; // 1 mm
const A4_LONG = 297 * PT;
const A4_SHORT = 210 * PT;
const A5_LONG = A4_SHORT; // 210 mm
const A5_SHORT = A4_LONG / 2; // 148,5 mm

const fontDir = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  // Kaynak: src/lib -> ../../assets, derlenmiş: dist -> ../assets
  return [resolve(here, '../../assets/fonts'), resolve(here, '../assets/fonts')].find((d) => existsSync(d)) ?? resolve(here, '../../assets/fonts');
})();

type Doc = PDFKit.PDFDocument;

function newDoc(layout: 'portrait' | 'landscape', title: string): Doc {
  const doc = new PDFDocument({ size: 'A4', layout, margin: 0, autoFirstPage: false, info: { Title: title, Creator: 'Okul Yayın' } });
  doc.registerFont('sans', `${fontDir}/LiberationSans-Regular.ttf`);
  doc.registerFont('sans-b', `${fontDir}/LiberationSans-Bold.ttf`);
  doc.registerFont('sans-i', `${fontDir}/LiberationSans-Italic.ttf`);
  doc.registerFont('sans-bi', `${fontDir}/LiberationSans-BoldItalic.ttf`);
  doc.registerFont('serif', `${fontDir}/LiberationSerif-Regular.ttf`);
  doc.registerFont('serif-b', `${fontDir}/LiberationSerif-Bold.ttf`);
  return doc;
}

function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const parts: Buffer[] = [];
    doc.on('data', (c: Buffer) => parts.push(c));
    doc.on('end', () => ok(Buffer.concat(parts)));
    doc.on('error', fail);
    doc.end();
  });
}

/** İki A5'i ayıran kesik çizgi ve makas işareti */
function cutLine(doc: Doc, vertical: boolean) {
  doc.save().lineWidth(0.4).strokeColor('#9a9a9a').dash(3, { space: 3 });
  if (vertical) doc.moveTo(A4_LONG / 2, 8).lineTo(A4_LONG / 2, A4_SHORT - 8).stroke();
  else doc.moveTo(8, A4_LONG / 2).lineTo(A4_SHORT - 8, A4_LONG / 2).stroke();
  doc.undash().restore();
}

/** Formları ikişer ikişer A4 sayfalara dizer */
async function twoUp<T>(items: T[], layout: 'portrait' | 'landscape', title: string, draw: (doc: Doc, item: T, x: number, y: number) => void) {
  const doc = newDoc(layout, title);
  // A5 dikey formlar A4 yatayda yan yana; A5 yatay formlar A4 dikeyde alt alta
  const sideBySide = layout === 'landscape';
  for (let i = 0; i < items.length; i += 2) {
    doc.addPage();
    draw(doc, items[i]!, 0, 0);
    if (items[i + 1]) draw(doc, items[i + 1]!, sideBySide ? A5_SHORT : 0, sideBySide ? 0 : A5_SHORT);
    cutLine(doc, sideBySide);
  }
  if (!items.length) {
    doc.addPage();
    doc.font('sans').fontSize(11).text('Yazdırılacak form yok.', 40, 40);
  }
  return toBuffer(doc);
}

const up = (s: string | null | undefined) => (s ?? '').toLocaleUpperCase('tr-TR');

/* ---------- Günlük rehberlik formu (A5 dikey) ---------- */

export interface DailyForm {
  /** "OKUL ADI PROGRAM" */
  schoolLine: string;
  business: string;
  students: number;
  responsible: number;
  address: string;
  area: string;
  /** GG.AA.YYYY */
  date: string;
  contact: string;
  teacher: string;
  manager: string;
}

function drawDaily(doc: Doc, f: DailyForm, ox: number, oy: number) {
  const m = 9 * PT;
  const x = ox + m;
  const y = oy + 8 * PT;
  const w = A5_SHORT - 2 * m;
  const h = A5_LONG - 16 * PT;
  const pad = 8;
  const lw = 0.9;
  doc.lineWidth(lw).strokeColor('#000').fillColor('#000');
  doc.rect(x, y, w, h).stroke();
  const hline = (yy: number) => doc.moveTo(x, yy).lineTo(x + w, yy).stroke();

  // Başlık
  let cy = y + 7;
  doc.font('sans-b').fontSize(9.2);
  doc.text('İŞLETMELERDE MESLEKİ EĞİTİM GÜNLÜK REHBERLİK FORMU', x + pad, cy, { width: w - 2 * pad, align: 'center' });
  cy = doc.y + 3;
  doc.text(up(f.schoolLine), x + pad, cy, { width: w - 2 * pad, align: 'center' });
  cy = doc.y + 6;
  hline(cy);

  // Bilgiler
  const labelW = 150;
  const rows: [string, string][] = [
    ['İşletmenin Adı / Öğrenci Sayısı', `${up(f.business)} / ${f.students}`],
    ['İzlemede Sorumlu Olduğu Öğrenci Sayısı', String(f.responsible)],
    ['İşletme Adresi', f.address],
    ['Meslek Alan/Dalı', up(f.area)],
    ['Görev Tarihi', f.date],
  ];
  cy += 6;
  for (const [label, value] of rows) {
    doc.font('sans').fontSize(8.2).text(label, x + pad, cy, { width: labelW - 4 });
    const lh = doc.y - cy;
    doc.text(':', x + pad + labelW, cy);
    doc.font('sans-b').fontSize(8.2).text(value || '', x + pad + labelW + 8, cy, { width: w - 2 * pad - labelW - 8 });
    cy = Math.max(cy + lh, doc.y) + 4;
  }
  cy += 2;
  hline(cy);

  // Alt bölümler aşağıdan yukarıya: açıklama, imzalar
  const noteH = 62;
  const sigH = 92;
  const noteY = y + h - noteH;
  const sigY = noteY - sigH;
  hline(sigY);
  hline(noteY);

  // Gövde
  doc.font('sans-b').fontSize(8.6).text('Aylık Rehberlik Formuna Göre :', x + pad, cy + 7, { underline: true });
  const bodyTop = doc.y + 6;
  const prompts = [
    'İşletmede mesleki eğitim gören öğrencilerin eğitimini olumsuz yönde etkileyen hususlar : (varsa yazınız)',
    'Belirlenen aksaklıklarla ilgili yapılan rehberlik ve alınan önlemler :',
    'Aylık Rehberlik formunda belirtilmesinde yarar görülen hususlar:',
  ];
  const step = (sigY - bodyTop) / prompts.length;
  prompts.forEach((p, i) => doc.font('sans').fontSize(8.2).text(p, x + pad + 12, bodyTop + i * step, { width: w - 2 * pad - 12 }));

  // İmzalar
  const colW = w / 3;
  const sig: [string, string][] = [
    ['İşletme Eğitim Yetkilisi', f.contact],
    ['Koordinatör Öğretmen', up(f.teacher)],
    ['Koordinatör Müdür Yardımcısı', up(f.manager)],
  ];
  sig.forEach(([title, name], i) => {
    const sx = x + i * colW + 2;
    doc.font('sans').fontSize(8).text(title, sx, sigY + 12, { width: colW - 4, align: 'center' });
    doc.font('sans-b').fontSize(8).text(name || ' ', sx, sigY + 32, { width: colW - 4, align: 'center' });
    doc.font('sans').fontSize(8).text('İmza/Kaşe', sx, sigY + 52, { width: colW - 4, align: 'center' });
  });

  // Açıklama
  doc.font('sans').fontSize(7.2);
  doc.text(
    "AÇIKLAMALAR : Bu form koordinatör öğretmen tarafından her görev haftası başında koordinatör Md. Yrd.'ndan alınır. Görev sonrasında okula geldiği gün içinde imzaları tamamlanmış olarak Koordinatör Md. Yrd.'na teslim edilir.",
    x + pad,
    noteY + 6,
    { width: w - 2 * pad },
  );
  doc.text('Bu form "Aylık Rehberlik Formu"nun doldurulmasında esas alınır ve rapora eklenir.', x + pad, doc.y + 4, { width: w - 2 * pad });
}

export const dailyFormsPdf = (forms: DailyForm[]) => twoUp(forms, 'landscape', 'Günlük rehberlik formu', drawDaily);

/* ---------- Aylık devam-devamsızlık bildirim çizelgesi (A5 yatay) ---------- */

export interface AttendanceForm {
  business: string;
  phone: string;
  email: string;
  /** "KASIM 2026" */
  month: string;
  /** Ayın gün sayısı */
  daysInMonth: number;
  /** 0 tabanlı gün dizisi: hafta sonu mu */
  weekend: boolean[];
  /** Belgenin düzenlendiği tarih (GG.AA.YYYY ya da boş) */
  issued: string;
  contact: string;
  manager: string;
  /** En çok 5 öğrenci (fazlası sonraki sayfada aynı başlıkla) */
  students: { name: string; no: string; area: string; cells: [string, string][]; excused: string; unexcused: string }[];
}

export const ATTENDANCE_ROWS = 5;

function drawAttendance(doc: Doc, f: AttendanceForm, ox: number, oy: number) {
  const mx = 9 * PT;
  const x = ox + mx;
  const w = A5_LONG - 2 * mx;
  const top = oy + 7 * PT;
  const bottom = oy + A5_SHORT - 7 * PT;
  doc.lineWidth(0.6).strokeColor('#000').fillColor('#000');

  // Başlık (üstte noktalı çizgi)
  const tw = w * 0.66;
  doc.save().lineWidth(0.5).dash(0.6, { space: 1.4 }).moveTo(x + (w - tw) / 2, top).lineTo(x + (w + tw) / 2, top).stroke().undash().restore();
  doc.font('serif-b').fontSize(8.4).text('ÖĞRENCİLERİN İŞLETMELERDE MESLEKİ EĞİTİMİ AYLIK DEVAM- DEVAMSIZLIK BİLDİRİM ÇİZELGESİ', x, top + 3, { width: w, align: 'center' });
  let cy = doc.y + 3;

  // Sütunlar
  const nameW = 84;
  const narrow = 13;
  const totW = 27;
  const dayW = (w - nameW - narrow * 3 - totW * 2) / 31;
  const dayX = (i: number) => x + nameW + narrow * 3 + i * dayW;
  const totX = dayX(31);

  // Yükseklikler: kalan alan öğrenci satırlarına ve imza bölümüne paylaştırılır
  const hdrH = 10;
  const valH = 15;
  const ogH = 10;
  const colHdrH = 30;
  const noteH = 20;
  const sigH = 58;
  const avail = bottom - cy - hdrH - valH - ogH - colHdrH - noteH - sigH;
  const rowH = Math.min(19, avail / (ATTENDANCE_ROWS * 2));

  const cell = (cx: number, cyy: number, cw: number, ch: number) => doc.rect(cx, cyy, cw, ch).stroke();
  const ctext = (s: string, cx: number, cyy: number, cw: number, ch: number, font = 'serif', size = 6.5) => {
    doc.font(font).fontSize(size);
    const th = doc.heightOfString(s || ' ', { width: cw - 2 });
    doc.text(s, cx + 1, cyy + (ch - th) / 2 + 0.5, { width: cw - 2, align: 'center', lineBreak: true });
  };

  // İşletme bilgileri: 5 bölüm (gün sütunlarına hizalı değil, oranla)
  const segs: [string, string, number][] = [
    ['İŞLETME ADI', up(f.business), 0.22],
    ['İŞLETME TEL.', f.phone, 0.19],
    ['İŞLETME E-POSTA', f.email, 0.21],
    ['Ait Olduğu Ay', f.month, 0.17],
    ['Belgenin Düzenlendiği Tarih:', f.issued, 0.21],
  ];
  let sx = x;
  for (const [label, value, ratio] of segs) {
    const sw = w * ratio;
    cell(sx, cy, sw, hdrH);
    cell(sx, cy + hdrH, sw, valH);
    ctext(label, sx, cy, sw, hdrH, 'serif-b', 6.2);
    ctext(value, sx, cy + hdrH, sw, valH, 'serif-b', 7);
    sx += sw;
  }
  cy += hdrH + valH;

  // Öğrenci başlıkları
  const left4 = nameW + narrow * 3;
  cell(x, cy, left4, ogH);
  ctext('ÖĞRENCİNİN', x, cy, left4, ogH, 'serif-b', 8);
  cell(x, cy + ogH, nameW, colHdrH);
  ctext('ADI SOYADI', x, cy + ogH, nameW, colHdrH, 'serif-b', 7.5);
  ['NUMARA', 'ALANI', 'GÜNLER'].forEach((t, i) => {
    const cx = x + nameW + i * narrow;
    cell(cx, cy + ogH, narrow, colHdrH);
    doc.save();
    doc.font('serif-b').fontSize(4.6);
    const tw2 = doc.widthOfString(t);
    doc.rotate(-90, { origin: [cx + narrow / 2, cy + ogH + colHdrH / 2] });
    doc.text(t, cx + narrow / 2 - tw2 / 2, cy + ogH + colHdrH / 2 - 2.6, { lineBreak: false });
    doc.restore();
  });
  for (let i = 0; i < 31; i++) {
    cell(dayX(i), cy, dayW, ogH + colHdrH);
    if (i >= f.daysInMonth) doc.save().fillColor('#d9d9d9').rect(dayX(i) + 0.3, cy + 0.3, dayW - 0.6, ogH + colHdrH - 0.6).fill().restore();
    ctext(String(i + 1), dayX(i), cy, dayW, ogH + colHdrH, 'serif-b', 6);
  }
  cell(totX, cy, totW * 2, ogH);
  ctext('TOPLAM DEVAMSIZLIĞI', totX, cy, totW * 2, ogH, 'serif-b', 5);
  cell(totX, cy + ogH, totW, colHdrH);
  cell(totX + totW, cy + ogH, totW, colHdrH);
  ctext('ÖZÜRLÜ', totX, cy + ogH, totW, colHdrH, 'serif-b', 4.4);
  ctext('ÖZÜRSÜZ', totX + totW, cy + ogH, totW, colHdrH, 'serif-b', 4.4);
  cy += ogH + colHdrH;

  // Öğrenci satırları (her öğrenci için S ve Ö)
  for (let r = 0; r < ATTENDANCE_ROWS; r++) {
    const s = f.students[r];
    cell(x, cy, nameW, rowH * 2);
    cell(x + nameW, cy, narrow, rowH * 2);
    cell(x + nameW + narrow, cy, narrow, rowH * 2);
    if (s) {
      doc.font('serif').fontSize(6.8);
      const th = doc.heightOfString(s.name, { width: nameW - 5 });
      doc.text(s.name, x + 3, cy + rowH - th / 2, { width: nameW - 5 });
      ctext(s.no, x + nameW, cy, narrow, rowH * 2, 'serif', s.no.length > 4 ? 3.6 : 4.4);
      ctext(s.area, x + nameW + narrow, cy, narrow, rowH * 2, 'serif', s.area.length > 3 ? 3.2 : s.area.length > 2 ? 3.8 : 4.6);
    }
    ['S', 'Ö'].forEach((half, hi) => {
      const ry = cy + hi * rowH;
      cell(x + nameW + narrow * 2, ry, narrow, rowH);
      ctext(half, x + nameW + narrow * 2, ry, narrow, rowH, 'serif', 5.5);
      for (let i = 0; i < 31; i++) {
        const gray = i >= f.daysInMonth || f.weekend[i];
        if (gray) doc.save().fillColor(i >= f.daysInMonth ? '#d9d9d9' : '#ececec').rect(dayX(i) + 0.3, ry + 0.3, dayW - 0.6, rowH - 0.6).fill().restore();
        cell(dayX(i), ry, dayW, rowH);
        const v = s?.cells[i]?.[hi] ?? '';
        if (v) ctext(v, dayX(i), ry, dayW, rowH, 'serif', 6.2);
      }
    });
    cell(totX, cy, totW, rowH * 2);
    cell(totX + totW, cy, totW, rowH * 2);
    if (s) {
      ctext(s.excused, totX, cy, totW, rowH * 2, 'serif', 6.5);
      ctext(s.unexcused, totX + totW, cy, totW, rowH * 2, 'serif', 6.5);
    }
    cy += rowH * 2;
  }

  // İmza ve semboller
  const sigBottom = bottom - noteH;
  const sh = sigBottom - cy;
  const c1 = w * 0.29;
  const c2 = w * 0.32;
  const c3 = w - c1 - c2;
  cell(x, cy, c1, sh);
  cell(x + c1, cy, c2, sh);
  cell(x + c1 + c2, cy, c3, sh);
  const sigCol = (cx: number, cw: number, title: string, name: string, sub: string[]) => {
    doc.font('serif').fontSize(7.6).text(title, cx, cy + 5, { width: cw, align: 'center' });
    doc.fontSize(6.5).text('……/……/…………', cx, doc.y + 3, { width: cw, align: 'center' });
    doc.font('serif-b').fontSize(7).text(name || ' ', cx, doc.y + 4, { width: cw, align: 'center' });
    doc.font('serif').fontSize(5.6);
    for (const line of sub) doc.text(line, cx, doc.y + 1, { width: cw, align: 'center' });
  };
  sigCol(x, c1, 'İŞLETME YETKİLİSİ', f.contact, ['Adı Soyadı', 'Kaşe - İmza']);
  sigCol(x + c1, c2, 'İNCELENDİ', up(f.manager), ['Koordinatör Müdür Yardımcısı']);
  const lx = x + c1 + c2 + 5;
  const lw2 = c3 - 10;
  doc.font('serif').fontSize(6.6).text('Devamın Göstereceği Semboller', lx, cy + 5, { width: lw2, align: 'center', underline: true });
  doc.text('X: İşletmede          O: Okulda', lx, doc.y + 3, { width: lw2 });
  doc.text('Devamsızlığın Göstereceği Semboller', lx, doc.y + 4, { width: lw2, align: 'center', underline: true });
  doc.text('D: Özürsüz Devamsız, İ: İzinli, R: Raporlu,', lx, doc.y + 3, { width: lw2 });
  doc.text('H: Hasta Sevkli, S: Sabah, Ö: Öğle, T: Resmi Tatil', lx, doc.y + 1, { width: lw2 });

  // Not
  cell(x, sigBottom, w, noteH);
  doc.font('serif').fontSize(5.9);
  doc.text(
    'Bu çizelge, işletme tarafından tutulacak, öğrencinin işletmede bulunması gereken günlere ait devamsızlık durumları ilgili sütunda, yanda gösterilen uygun sembolle belirlenecektir.',
    x + 4,
    sigBottom + 3,
    { width: w - 8 },
  );
  doc.text('(İ), (H), (R) sembolleri ile gösterilen devamsızlıklar toplamı özürlü devamsızlık sütununa yazılacaktır.', x + 4, doc.y + 1, { width: w - 8 });
}

export const attendanceFormsPdf = (forms: AttendanceForm[]) => twoUp(forms, 'portrait', 'Aylık devam-devamsızlık çizelgesi', drawAttendance);

/* ---------- Aylık rehberlik rapor formu (A5 dikey) ---------- */

export interface ReportForm {
  /** "OKUL ADI MÜDÜRLÜĞÜNE" */
  addressee: string;
  /** "İlçe/İL" */
  place: string;
  area: string;
  /** Rapor tarihi: ayın son görev tarihi */
  date: string;
  business: string;
  address: string;
  contact: string;
  teacher: string;
  /** Görev tarihleri (GG.AA.YYYY) */
  dates: string[];
}

/** Rapor soruları (MEB formu; okula göre düzenlenebilir hâle getirilecek) */
export const REPORT_SECTIONS: { title: string; items: string[] }[] = [
  {
    title: 'A. Meslekî ve Teknik Eğitim Yönetmeliği ile ilgili konular:',
    items: [
      'Usta öğretici/eğitici personelin yıllık eğitim plânı (Gelişim Tablosu) var mı? Uyguluyor mu? Öğrencilere sürekli aynı işlem mi, rotasyona göre mi eğitim yaptırılıyor?',
      'Öğrencilerin günlük çalışmaları yıllık eğitim plânına uygun olarak plânlanmış mı?',
      'Öğrenci devam durumu günlük olarak takip ediliyor mu?',
      'Meslek eğitimi çalışmaları puanla değerlendiriliyor mu?',
      'Yapılan işlerle ilgili olarak her öğrenciye iş dosyası tutturuluyor mu?',
      'Öğrencilere 3308 sayılı Kanunun 25 inci maddesine göre aylık ücret ödeniyor mu?',
      'Meslek eğitimi, çalışma saatlerinde yapılıyor mu?',
      'İş güvenliği konusunda öğrencilere yeterli bilgi veriliyor ve gerekli tedbirler alınıyor mu?',
      'Öğrenciler disiplin, kılık-kıyafet ve işletmenin kurallarına uyuyor mu?',
      'Öğrencilerin telafi eğitimine alınması gerekiyor mu? Gerekiyorsa hangi konularda telafi eğitimi uygulanmalı?',
    ],
  },
  {
    title: 'B. Eğitici Personelle ilgili konular:',
    items: [
      'İşletmenin meslek eğitimi ile görevli personelinin usta öğreticilik belgesi var mı?',
      "Eğitici personelin sorumlu olduğu öğrenci grubu sayısı Meslekî ve Teknik Eğitim Yönetmeliğinin 192'nci maddesine uygun mu?",
      'Meslek eğitimi konusunda koordinatör tarafından eğitici personele yapılan rehberlik ve konusu.',
      'Eğitici personelin geliştirme ve uyum kursuna ihtiyacı var mı?',
    ],
  },
  {
    title: 'C. İşletme ile ilgili konular:',
    items: [
      'İşletmelerde meslek eğitimi, yıllık çalışma takvimine uygun olarak sürdürülüyor mu?',
      'İşletmede meslek eğitiminin mevzuata göre sürdürülmesi ile ilgili gerekli tedbirler alınıyor mu? (Meslekî ve Teknik Eğitim Yönetmeliği madde 96.)',
      'Okul/kurum, öğretim programlarını (Gelişim Tablosu) işletmeye verdi mi?',
      'Öğrenciler için gelişim tablosu uygulanıyor mu?',
      'İşletme yetkililerinin meslek eğitiminin uygulanışı ve öğretim programları konusundaki görüş ve önerileri',
    ],
  },
];

function drawReport(doc: Doc, f: ReportForm, ox: number, oy: number) {
  const m = 8 * PT;
  const x = ox + m;
  const y = oy + 7 * PT;
  const w = A5_SHORT - 2 * m;
  const h = A5_LONG - 14 * PT;
  const pad = 6;
  doc.lineWidth(0.8).strokeColor('#000').fillColor('#000');
  doc.rect(x, y, w, h).stroke();
  const iw = w - 2 * pad;

  doc.font('sans-b').fontSize(7.8);
  doc.text('İŞLETMELERDE MESLEK EĞİTİMİ KOORDİNATÖRLERİNİN İŞLETMEYE YAPACAĞI AYLIK REHBERLİK RAPOR FORMU', x + pad + 10, y + 5, { width: iw - 20, align: 'center' });
  doc.font('sans').fontSize(6.8).text(up(f.addressee), x + pad, doc.y + 2, { width: iw, align: 'center' });
  if (f.place) doc.text(f.place, x + pad, doc.y + 1, { width: iw - 14, align: 'right' });
  doc.fontSize(6.6);
  doc.text('', x + pad, doc.y + 3);
  doc.text(
    `Okulumuz ${f.area ? '' : '……………… '}`,
    x + pad + 16,
    doc.y,
    { width: iw - 16, continued: true },
  );
  if (f.area) doc.font('sans-b').text(f.area, { continued: true }).font('sans');
  doc.text(' alanı öğrencilerinin meslek eğitimi gördüğü işletmede yapmış olduğum bir aylık koordinatörlük görevlerim sırasında tespit ettiğim hususlar aşağıda belirtilmiştir.');
  doc.text(f.date || '…. / …. / ……', x + pad, doc.y + 1, { width: iw, align: 'right' });
  doc.text('Bilgilerinizi ve gereğini arz ederim.', x + pad + 24, doc.y + 1);

  // İşletme ve imzalar (solda), görev tarihleri (sağda)
  const top = doc.y + 6;
  const rightW = 72;
  const leftW = iw - rightW - 6;
  doc.font('sans').fontSize(6.6).text('İşletmenin Adı ve Adresi :', x + pad, top, { underline: true, continued: true });
  doc.text(' ', { underline: false, continued: true }).font('sans-b').text(up(f.business), { width: leftW });
  doc.font('sans').fontSize(6.2).text(f.address || ' ', x + pad, doc.y + 1, { width: leftW });
  const sigTop = doc.y + 5;
  const half = leftW / 2;
  const sigCol = (cx: number, lines: [string, string][]) => {
    let yy = sigTop;
    for (const [font, t] of lines) {
      doc.font(font).fontSize(6.6).text(t || ' ', cx, yy, { width: half, align: 'center' });
      yy = doc.y + 1;
    }
    return yy;
  };
  const e1 = sigCol(x + pad, [
    ['sans', 'İşletme Eğitim Yetkilisinin'],
    ['sans', 'Adı Soyadı'],
    ['sans-b', f.contact],
    ['sans', 'İmza'],
  ]);
  const e2 = sigCol(x + pad + half, [
    ['sans', 'Koordinatör Öğretmenin'],
    ['sans', 'Adı Soyadı'],
    ['sans-bi', up(f.teacher)],
    ['sans', 'İmza'],
  ]);
  const rx = x + w - pad - rightW;
  doc.font('sans').fontSize(6.6).text('GÖREV TARİHLERİ', rx, top, { width: rightW, align: 'center', underline: true });
  let dy = doc.y + 2;
  const dates = f.dates.length ? f.dates : ['…. / …. / ……', '…. / …. / ……', '…. / …. / ……', '…. / …. / ……'];
  for (const d of dates) {
    doc.text(d, rx, dy, { width: rightW, align: 'center' });
    dy = doc.y + 1.5;
  }

  // Sorular tablosu
  const tTop = Math.max(e1, e2, dy) + 6;
  const colW = 70;
  const qW = w - colW;
  const rows: { head?: string; text: string; tall?: boolean }[] = [];
  for (const s of REPORT_SECTIONS) s.items.forEach((t, i) => rows.push({ head: i === 0 ? s.title : undefined, text: `${i + 1}. ${t}` }));
  rows.push({ head: 'D. Açıklanması gereken diğer hususlar:', text: '', tall: true });
  const fs = 6.1;
  const hdrH = 20;
  const natural = rows.map((r) => {
    doc.font('sans-b').fontSize(fs);
    const hh = r.head ? doc.heightOfString(r.head, { width: qW - 6 }) : 0;
    doc.font('sans').fontSize(fs);
    return hh + (r.text ? doc.heightOfString(r.text, { width: qW - 6 }) : 0) + 4 + (r.tall ? 14 : 0);
  });
  const extra = Math.max(0, (y + h - tTop - hdrH - natural.reduce((a, b) => a + b, 0)) / rows.length);
  doc.lineWidth(0.6);
  doc.moveTo(x, tTop).lineTo(x + w, tTop).stroke();
  doc.rect(x + qW, tTop, 0, hdrH).stroke();
  doc.font('sans-b').fontSize(6.4).text('Koordinatörün Rehberlik Yaptığı Konular', x, tTop + 6, { width: qW, align: 'center' });
  doc.text('Değerlendirme ve Öneriler', x + qW, tTop + 3, { width: colW, align: 'center' });
  let ry = tTop + hdrH;
  rows.forEach((r, i) => {
    const rh = natural[i]! + extra;
    doc.moveTo(x, ry).lineTo(x + w, ry).stroke();
    doc.moveTo(x + qW, ry).lineTo(x + qW, ry + rh).stroke();
    let ty = ry + 2;
    if (r.head) {
      doc.font('sans-b').fontSize(fs).text(r.head, x + 3, ty, { width: qW - 6, underline: true });
      ty = doc.y;
    }
    if (r.text) doc.font('sans').fontSize(fs).text(r.text, x + 3, ty, { width: qW - 6 });
    ry += rh;
  });
  doc.moveTo(x + qW, tTop).lineTo(x + qW, tTop + hdrH).stroke();
}

export const reportFormsPdf = (forms: ReportForm[]) => twoUp(forms, 'landscape', 'Aylık rehberlik rapor formu', drawReport);

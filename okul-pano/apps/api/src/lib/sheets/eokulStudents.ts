import { tidyName } from '@okulpano/shared';
import { badRequest } from '../errors.ts';
import { readPdfPages, type PdfItem } from './eokul.ts';

/*
 * e-Okul "sınıf listesi" PDF'i (OOG01001R070): her sayfa bir sınıfın listesidir. Başlıkta
 * "AMP - 9. Sınıf / A Şubesi (MAKİNE VE TASARIM TEKNOLOJİSİ ALANI) Sınıf Listesi", altında sınıf öğretmeni,
 * tabloda S.No, Öğrenci No, Adı, Soyadı, Cinsiyeti, Doğum Tarihi, Yaşı sütunları. Sütunlar başlık satırındaki
 * konumlarından bulunur; sütun sırası ya da sayısı değişse de okunur. Okula özel hiçbir şey içermez.
 */

export interface EokulStudent {
  /** e-Okul'daki sıra numarası (S.No) */
  listNo: number | null;
  schoolNo: string;
  fullName: string;
  /** YYYY-AA-GG */
  birthDate: string;
  className: string;
  /** PDF sayfası (önizlemede satır yerine) */
  page: number;
}

export interface EokulClassList {
  className: string;
  teacher: string | null;
  page: number;
  students: EokulStudent[];
}

const fold = (s: string) =>
  s
    .toLocaleUpperCase('tr-TR')
    .replace(/[ÇĞİÖŞÜ]/g, (c) => ({ Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' })[c] ?? c)
    .replace(/[^A-Z0-9]/g, '');

/** Parçaları soldan sağa birleştirir; aradaki boşluk büyükse kelime arası sayılır */
function join(items: PdfItem[]): string {
  let out = '';
  let end = -Infinity;
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    if (out && it.x - end > 1.2 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
    out += it.str;
    end = it.x + it.w;
  }
  return tidyName(out);
}

function rows(items: PdfItem[]): PdfItem[][] {
  const out: { y: number; items: PdfItem[] }[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    if (!it.str.trim()) continue;
    const row = out.find((r) => Math.abs(r.y - it.y) < 2.5);
    if (row) row.items.push(it);
    else out.push({ y: it.y, items: [it] });
  }
  return out.map((r) => r.items);
}

// "AMP - 9. Sınıf / A Şubesi", "AMP - 10. Sınıf-Otistik Hafif / O Şubesi", "ATP - 12. Akademik Destek (Sayısal) / A Şubesi", "5. Sınıf / B Şubesi"
const HEADER = /(?:([A-ZÇĞİÖŞÜ]{2,})\s*-\s*)?(\d{1,2})\.?[^/]*?\/\s*([^\s/]+?)\s*Şubesi/u;
const DATE = /^(\d{2})[./](\d{2})[./](\d{4})$/;

/** "ÇAĞATAY" + "ASLIPEK" → "Çağatay ASLIPEK" (öğretmen adlarıyla aynı yazım) */
export function studentDisplayName(first: string, last: string): string {
  const given = tidyName(first)
    .toLocaleLowerCase('tr-TR')
    .split(' ')
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1))
    .join(' ');
  return tidyName(`${given} ${tidyName(last).toLocaleUpperCase('tr-TR')}`);
}

/** Bir sayfayı okur; sınıf listesi sayfası değilse null */
export function parseClassListPage(items: PdfItem[], page: number): EokulClassList | null {
  const all = rows(items);
  const texts = all.map(join);
  const head = texts.map((t) => HEADER.exec(t)).find(Boolean);
  if (!head) return null;
  const [, program, grade, section] = head;
  const className = `${program ? `${program} ` : ''}${grade}-${section}`;
  const teacherLine = texts.find((t) => /Sınıf Öğretmeni\s*:/i.test(t));
  const teacher = teacherLine ? tidyName(teacherLine.replace(/^.*?Sınıf Öğretmeni\s*:\s*/i, '').replace(/\s*Sınıf Başkanı.*$/i, '')) || null : null;

  // Başlık satırı: "S.No | Öğrenci No | Adı | Soyadı | … | Doğum Tarihi"; sütun başları kümelenerek bulunur
  const headerIdx = texts.findIndex((t) => fold(t).includes('OGRENCINO') && fold(t).includes('DOGUM'));
  if (headerIdx < 0) return { className, teacher, page, students: [] };
  const groups: PdfItem[][] = [];
  for (const it of [...all[headerIdx]!].sort((a, b) => a.x - b.x)) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && it.x - (prev.x + prev.w) < 6) last.push(it);
    else groups.push([it]);
  }
  const cols = groups.map((g) => ({ key: fold(join(g)), x: g[0]!.x }));
  const col = (k: string) => cols.findIndex((c) => c.key.startsWith(k));
  const iNo = col('OGRENCINO');
  const iFirst = col('ADI');
  const iLast = col('SOYADI');
  const iSeq = cols.findIndex((c) => c.key === 'SNO' || c.key === 'SIRANO' || c.key === 'SIRA');
  const iBirth = col('DOGUM');

  const students: EokulStudent[] = [];
  for (const row of all.slice(headerIdx + 1)) {
    const cells: PdfItem[][] = cols.map(() => []);
    for (const it of row) {
      let idx = 0;
      for (let i = 0; i < cols.length; i++) if (cols[i]!.x <= it.x + 8) idx = i;
      cells[idx]!.push(it);
    }
    const cell = (i: number) => (i >= 0 ? join(cells[i]!) : '');
    const no = cell(iNo);
    const d = DATE.exec(cell(iBirth));
    if (!/^\d+$/.test(no) || !d) continue;
    const first = cell(iFirst);
    const last = iLast >= 0 && iLast !== iFirst ? cell(iLast) : '';
    const fullName = last ? studentDisplayName(first, last) : tidyName(first);
    if (fullName.length < 2) continue;
    const seq = Number(cell(iSeq));
    students.push({ listNo: Number.isInteger(seq) && seq > 0 ? seq : null, schoolNo: no, fullName, birthDate: `${d[3]}-${d[2]}-${d[1]}`, className, page });
  }
  return { className, teacher, page, students };
}

/** e-Okul sınıf listesi PDF'i: öğrenci satırları (Excel önizlemesiyle aynı biçim; satır numarası liste sırası) */
export async function parseClassListPdf(data: Uint8Array) {
  let pages: PdfItem[][];
  try {
    pages = await readPdfPages(data);
  } catch {
    throw badRequest("PDF okunamadı. Dosyanın e-Okul'dan indirilen sınıf listesi olduğundan emin olun.");
  }
  const lists = pages.map((items, i) => parseClassListPage(items, i + 1));
  const found = lists.filter((l): l is EokulClassList => Boolean(l));
  if (!found.some((l) => l.students.length)) {
    throw badRequest("Bu PDF'te e-Okul sınıf listesi bulunamadı. e-Okul > Öğrenci İşlemleri > Sınıf listesi raporunu PDF olarak indirip yükleyin.");
  }
  const issues = lists.flatMap((l, i) => (l ? [] : [{ row: 0, message: `${i + 1}. sayfa okunamadı` }]));
  const rows = found.flatMap((l) => l.students).map((s, i) => ({ row: i + 1, schoolNo: s.schoolNo, fullName: s.fullName, className: s.className, birthDate: s.birthDate, listNo: s.listNo }));
  const advisors = [...new Map(found.filter((l) => l.teacher).map((l) => [l.className, { className: l.className, teacherName: l.teacher! }])).values()];
  return { sheetName: `e-Okul sınıf listesi · ${found.length} sınıf`, rows, issues, advisors };
}

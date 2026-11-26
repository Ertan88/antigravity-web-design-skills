import { DEFAULT_BRANCHES, normalizeName, tidyName } from '@okulpano/shared';
import { badRequest } from '../errors.ts';
import type { SheetIssue } from '../excel.ts';
import { readPdfPages, teacherDisplayName, type PdfItem } from './eokul.ts';
import { join, rows } from './eokulStudents.ts';
import type { ParsedTeacherRow } from './teachers.ts';

/*
 * e-Okul "Personel Listesi" PDF'i (Crystal Reports). Sütunlar: ADI SOYADI · GÖREVİ · KADRO DURUMU · BRANŞI.
 * Yalnızca ad soyad, görev ve branş okunur; kadro durumu kullanılmaz. Her sayfada üst bilgi (il, okul, başlık) ve alt
 * bilgi (tarih, saat) tekrarlanır; sondaki "Toplam Personel Sayısı" okunan kişi sayısıyla karşılaştırılır.
 * - Ad: "AYŞE NUR YILMAZ" → "Ayşe Nur YILMAZ" (e-Okul ders programı aktarımıyla aynı yazım)
 * - Görev: "Müdür" → "Okul Müdürü"; diğerleri olduğu gibi (Müdür Yardımcısı, Atölye Şefi, Laboratuar Şefi, Öğretmen)
 * - Branş: alan/dal birlikte yazılmışsa yalnızca alan ("Makine Teknolojisi / Makine ve Tasarım…" → "Makine
 *   Teknolojisi"); "-" boş sayılır; önerilen branş adlarıyla yazım farkı giderilir ("Beden Eğitimi" → "Beden Eğitimi ve Spor")
 */

const fold = (s: string) =>
  normalizeName(s)
    .normalize('NFD')
    .replace(/[̂]/g, '') // â, î, û → a, i, u
    .normalize('NFC')
    .replace(/[^a-zçğıöşü0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const TITLE_MAP: Record<string, string> = { müdür: 'Okul Müdürü', 'okul müdürü': 'Okul Müdürü' };

/** e-Okul'daki kısa adlar → önerilen branş adı */
const BRANCH_ALIASES: Record<string, string> = {
  'beden eğitimi': 'Beden Eğitimi ve Spor',
  rehberlik: 'Rehberlik ve Psikolojik Danışmanlık',
  'rehberlik ve psikolojik danışma': 'Rehberlik ve Psikolojik Danışmanlık',
  'sınıf öğretmeni': 'Sınıf Öğretmenliği',
};
const DEFAULT_BY_FOLD = new Map<string, string>(DEFAULT_BRANCHES.map((b) => [fold(b), b]));

export function personnelTitle(raw: string): string | null {
  const t = tidyName(raw);
  if (!t || t === '-') return null;
  return TITLE_MAP[normalizeName(t)] ?? t;
}

export function personnelBranch(raw: string): string | null {
  const first = tidyName(raw.split('/')[0] ?? '');
  if (!first || /^-+$/.test(first)) return null;
  const key = fold(first);
  return BRANCH_ALIASES[key] ?? DEFAULT_BY_FOLD.get(key) ?? first;
}

const DATE_OR_TIME = /^\d{2}[./]\d{2}[./]\d{4}$|^\d{2}:\d{2}(:\d{2})?$/;

export async function parsePersonnelPdf(data: Uint8Array): Promise<{ sheetName: string; rows: ParsedTeacherRow[]; issues: SheetIssue[] }> {
  let pages: PdfItem[][];
  try {
    pages = await readPdfPages(data);
  } catch {
    throw badRequest("PDF okunamadı. e-Okul'dan indirdiğiniz personel listesi PDF'ini yükleyin.");
  }
  return parsePersonnelPages(pages);
}

/** Sayfaların metin parçalarından personel satırları (testler parçaları elle kurar) */
export function parsePersonnelPages(pages: PdfItem[][]): { sheetName: string; rows: ParsedTeacherRow[]; issues: SheetIssue[] } {
  const out: ParsedTeacherRow[] = [];
  const issues: SheetIssue[] = [];
  let total: number | null = null;
  let found = false;
  let n = 0;

  for (const items of pages) {
    const lines = rows(items);
    // Başlık satırı: "ADI SOYADI … GÖREVİ … KADRO DURUMU … BRANŞI"; sütun sınırları buradan
    const headerIdx = lines.findIndex((l) => {
      const text = fold(join(l)).replace(/ /g, '');
      return text.includes('görevi') && text.includes('branşı');
    });
    if (headerIdx < 0) continue;
    const header = lines[headerIdx]!;
    // Başlık kelimeleri (parçalar bitişikse aynı kelime): sütunun başladığı x
    const words: { text: string; x: number }[] = [];
    let end = -Infinity;
    for (const it of [...header].sort((a, b) => a.x - b.x)) {
      // Bir parça birden çok başlık içerebilir ("KADRO DURUMU BRANŞI"): kelimelere bölünür, konum orantıyla bulunur
      const perChar = it.str.length ? it.w / it.str.length : 0;
      for (const m of it.str.matchAll(/\S+/gu)) {
        const x = it.x + (m.index ?? 0) * perChar;
        const last = words[words.length - 1];
        // Bitişik parça aynı kelimenin devamıdır; üst üste binen parça ayrı başlıktır
        if (last && (m.index ?? 0) === 0 && Math.abs(x - end) <= 1.2) last.text += m[0];
        else words.push({ text: m[0], x });
      }
      end = it.x + it.w;
    }
    const startOf = (re: RegExp) => words.find((w) => re.test(w.text.toLocaleUpperCase('tr-TR')))?.x;
    const xTitle = startOf(/^GÖREV/u);
    const xStatus = startOf(/^KADRO/u);
    const xBranch = startOf(/^BRAN/u);
    if (xTitle === undefined || xStatus === undefined || xBranch === undefined) continue;
    found = true;
    const col = (it: PdfItem) => (it.x < xTitle - 4 ? 0 : it.x < xStatus - 4 ? 1 : it.x < xBranch - 4 ? 2 : 3);

    for (const line of lines.slice(headerIdx + 1)) {
      const cells: PdfItem[][] = [[], [], [], []];
      for (const it of line) cells[col(it)]!.push(it);
      const [name, title, , branch] = cells.map(join) as [string, string, string, string];
      // Alt bilgi: tarih ve saat; "Toplam Personel Sayısı: 49"
      if (line.every((i) => DATE_OR_TIME.test(i.str.trim()))) continue;
      const sum = /toplam\s*personel\s*sayısı\s*:?\s*(\d+)/iu.exec(join(line).toLocaleLowerCase('tr-TR'));
      if (sum) {
        total = Number(sum[1]);
        continue;
      }
      if (!name) continue;
      n++;
      if (!title) {
        issues.push({ row: n, message: `${teacherDisplayName(name)}: görevi okunamadı; bu satır atlanacak` });
        continue;
      }
      out.push({ row: n, fullName: teacherDisplayName(name), title: personnelTitle(title), branch: personnelBranch(branch) });
    }
  }
  if (!found) throw badRequest("Bu PDF'te e-Okul personel listesi bulunamadı. Başlıkta ADI SOYADI, GÖREVİ ve BRANŞI sütunları olmalı.");
  if (total !== null && total !== n) issues.push({ row: 0, message: `Listede ${total} kişi yazıyor, ${n} kişi okunabildi. Eksik satırları kontrol edin.` });
  return { sheetName: 'e-Okul personel listesi', rows: out, issues };
}

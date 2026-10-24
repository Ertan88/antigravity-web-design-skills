import ExcelJS from 'exceljs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { badRequest } from './errors.ts';

/*
 * Excel (.xlsx) içe/dışa aktarmanın ortak parçaları. Öğretmen, öğrenci ve nöbet çizelgesi
 * modülleri bu yardımcılarla kendi şablon/okuma kurallarını tanımlar (bkz. lib/sheets).
 * Her modülde şablon ve dışa aktarılan dosya aynı yapıdadır: indirilen dosya düzenlenip geri yüklenebilir.
 */

export const MAX_IMPORT_ROWS = 2000;
export const TEMPLATE_ROWS = 1000;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const BRAND = 'FF2563EB';

export interface SheetIssue {
  row: number;
  message: string;
}

/** Başlık eşleştirme için: küçük harf, Türkçe karakterler sadeleştirilmiş, noktalama yok */
export function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((t) => t.text).join('').trim();
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
  }
  return '';
}

const pad = (n: number) => String(n).padStart(2, '0');

function isoIfValid(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Tarih hücresini YYYY-AA-GG'ye çevirir. Excel tarih hücresi, Excel seri numarası (40251) ve
 * "14.03.2010", "14/03/2010", "2010-03-14", "14.03.10" yazımları kabul edilir. Geçersizse null.
 */
export function parseDateCell(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date) return isoIfValid(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  if (typeof value === 'object' && value && 'result' in value) return parseDateCell(value.result as ExcelJS.CellValue);
  if (typeof value === 'number' && value > 0 && value < 2958466) {
    // Excel seri günü: 1899-12-30 başlangıçlı
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400_000);
    return isoIfValid(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const text = cellText(value);
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(text);
  if (m) return isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec(text);
  if (m) {
    let year = Number(m[3]);
    if (m[3]!.length === 2) year += year > new Date().getFullYear() % 100 ? 1900 : 2000;
    return isoIfValid(year, Number(m[2]), Number(m[1]));
  }
  return null;
}

export async function loadWorkbook(data: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw badRequest('Dosya okunamadı. Lütfen Excel dosyasını .xlsx biçiminde kaydedip tekrar deneyin.');
  }
  return wb;
}

/** Adı ipucunu içeren görünür sayfayı, yoksa başlığı bulunan ilk sayfayı seçer. */
export function pickSheet(wb: ExcelJS.Workbook, nameHint: string, hasHeader: (ws: ExcelJS.Worksheet) => boolean): ExcelJS.Worksheet {
  const visible = wb.worksheets.filter((ws) => ws.state === 'visible');
  const ws = visible.find((s) => fold(s.name).includes(nameHint)) ?? visible.find(hasHeader) ?? visible[0];
  if (!ws) throw badRequest('Dosyada çalışma sayfası bulunamadı.');
  return ws;
}

/**
 * İlk 10 satırda başlık satırını arar (üstte okul adı gibi başlık satırları olabilir).
 * `accept` bulunan sütunların yeterli olup olmadığına karar verir.
 */
export function findHeaderRow<K extends string>(
  ws: ExcelJS.Worksheet,
  aliases: Record<K, readonly string[]>,
  accept: (cols: Partial<Record<K, number>>) => boolean,
): { row: number; cols: Partial<Record<K, number>> } | null {
  const last = Math.min(ws.rowCount, 10);
  for (let r = 1; r <= last; r++) {
    const cols: Partial<Record<K, number>> = {};
    ws.getRow(r).eachCell((cell, col) => {
      const text = fold(cellText(cell.value));
      for (const key of Object.keys(aliases) as K[]) {
        if (cols[key] === undefined && aliases[key].includes(text)) cols[key] = col;
      }
    });
    if (accept(cols)) return { row: r, cols };
  }
  return null;
}

/* ---------- Yazma ---------- */

export function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Okul Pano';
  wb.created = new Date();
  return wb;
}

export function styleHeader(ws: ExcelJS.Worksheet, rowNumber = 1) {
  const header = ws.getRow(rowNumber);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle' };
  });
}

/** ExcelJS aralık bazlı doğrulamayı destekliyor ama tip tanımında yok */
type RangeValidations = { add(range: string, rule: ExcelJS.DataValidation): void };
export const validations = (ws: ExcelJS.Worksheet) =>
  (ws as ExcelJS.Worksheet & { dataValidations: RangeValidations }).dataValidations;

/**
 * Gizli "Listeler" sayfasına açılır menü değerlerini yazar; her liste için formül aralığını döndürür.
 * Sayfa "veryHidden" olduğu için kullanıcı Excel'de göremez ve yanlışlıkla değiştiremez.
 */
export function addListsSheet(wb: ExcelJS.Workbook, lists: string[][]): string[] {
  const ws = wb.addWorksheet('Listeler', { state: 'veryHidden' });
  return lists.map((values, i) => {
    const col = String.fromCharCode(65 + i);
    values.forEach((v, r) => (ws.getCell(r + 1, i + 1).value = v));
    return `Listeler!$${col}$1:$${col}$${Math.max(1, values.length)}`;
  });
}

/**
 * Açılır liste doğrulaması. `allowNew` ise listede olmayan değer yalnızca uyarı verir
 * (içe aktarırken eklenir); değilse Excel engeller.
 */
export function listRule(range: string, label: string, opts: { allowNew: boolean; error?: string }): ExcelJS.DataValidation {
  const lower = label.toLocaleLowerCase('tr-TR');
  return {
    type: 'list',
    allowBlank: true,
    formulae: [range],
    showInputMessage: true,
    promptTitle: label,
    prompt: opts.allowNew ? 'Listeden seçin ya da yeni bir değer yazın.' : 'Listeden seçin.',
    showErrorMessage: true,
    errorStyle: opts.allowNew ? 'warning' : 'stop',
    errorTitle: 'Listede yok',
    error:
      opts.error ??
      (opts.allowNew ? `Bu ${lower} listede yok. İçe aktarırken yeni ${lower} olarak eklenecek.` : `Lütfen listeden bir ${lower} seçin.`),
  };
}

export function addHelpSheet(wb: ExcelJS.Workbook, title: string, lines: string[], example?: { header: string[]; row: string[] }) {
  const help = wb.addWorksheet('Açıklama');
  [title, '', ...lines].forEach((l, i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = l;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });
  if (example) {
    const start = lines.length + 5;
    help.getCell(start - 1, 1).value = 'Örnek:';
    const head = help.getRow(start);
    head.values = example.header;
    head.font = { bold: true };
    const row = help.getRow(start + 1);
    row.values = example.row;
    row.font = { italic: true, color: { argb: 'FF64748B' } };
  }
  help.getColumn(1).width = 40;
  for (let c = 2; c <= 8; c++) help.getColumn(c).width = 24;
}

export async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ---------- HTTP ---------- */

/** Yüklenen .xlsx dosyasını okur; eski .xls ve 5 MB üstü dosyaları anlaşılır mesajla reddeder. */
export async function readXlsxUpload(req: FastifyRequest): Promise<Buffer> {
  const file = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
  if (!file) throw badRequest('Dosya bulunamadı.');
  if (!/\.xlsx$/i.test(file.filename)) {
    throw badRequest(
      /\.xls$/i.test(file.filename)
        ? 'Eski .xls biçimi desteklenmiyor. Excel\'de "Farklı Kaydet → Excel Çalışma Kitabı (.xlsx)" seçin.'
        : 'Lütfen .xlsx uzantılı bir Excel dosyası yükleyin.',
    );
  }
  const data = await file.toBuffer();
  if (file.file.truncated) throw badRequest('Dosya 5 MB sınırını aşıyor.');
  return data;
}

/** Türkçe karakterli dosya adını tüm tarayıcılarda doğru indirtmek için (RFC 5987) */
export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function sendXlsx(reply: FastifyReply, data: Buffer, filename: string) {
  return reply.header('Content-Type', XLSX_MIME).header('Content-Disposition', attachmentHeader(filename)).send(data);
}

/** Dosya adı yalnızca ASCII: bazı tarayıcı ve işletim sistemleri Türkçe karakterli indirme adını reddediyor */
export function safeFilePart(text: string): string {
  const ascii: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => ascii[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** "ogretmenler-ornek-anadolu-lisesi-2026-10-24.xlsx" */
export function exportFileName(kind: string, schoolName: string): string {
  return `${kind}-${safeFilePart(schoolName)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

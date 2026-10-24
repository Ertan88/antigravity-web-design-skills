import ExcelJS from 'exceljs';
import { tidyName } from '@okulpano/shared';
import { badRequest } from './errors.ts';

/*
 * Öğretmen listesi için Excel (.xlsx) okuma ve yazma.
 * Şablon ve dışa aktarılan dosya aynı yapıdadır: dışa aktarılan dosya düzenlenip geri yüklenebilir.
 */

export const MAX_IMPORT_ROWS = 2000;

/** ExcelJS aralık bazlı doğrulamayı destekliyor ama tip tanımında yok */
type RangeValidations = { add(range: string, rule: ExcelJS.DataValidation): void };
const validations = (ws: ExcelJS.Worksheet) => (ws as ExcelJS.Worksheet & { dataValidations: RangeValidations }).dataValidations;
const TEMPLATE_ROWS = 1000;
const BRAND = 'FF2563EB';

export interface TeacherSheetRow {
  fullName: string;
  branch: string | null;
  title: string | null;
  isActive?: boolean;
}

export interface ParsedRow extends TeacherSheetRow {
  /** Excel'deki satır numarası (kullanıcıya hata gösterirken) */
  row: number;
}

export interface ParseResult {
  sheetName: string;
  rows: ParsedRow[];
  issues: { row: number; message: string }[];
}

/** Başlık eşleştirme için: küçük harf, Türkçe karakterler sadeleştirilmiş, noktalama yok */
function fold(value: string): string {
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

const HEADER_ALIASES = {
  fullName: ['ad soyad', 'adi soyadi', 'ad soyadi', 'adi ve soyadi', 'ad ve soyad', 'ogretmen', 'ogretmen adi', 'ogretmen adi soyadi', 'personel', 'personel adi soyadi', 'isim soyisim', 'adsoyad'],
  firstName: ['ad', 'adi', 'isim'],
  lastName: ['soyad', 'soyadi', 'soyisim'],
  branch: ['brans', 'bransi', 'alan', 'alani', 'ders', 'brans alan', 'alan brans'],
  title: ['unvan', 'unvani', 'kadro', 'kadro unvani', 'gorev', 'gorevi', 'unvan gorev', 'gorev unvan'],
  status: ['durum', 'durumu', 'aktif'],
} as const;
type HeaderKey = keyof typeof HEADER_ALIASES;

function cellText(value: ExcelJS.CellValue): string {
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

function parseStatus(raw: string): boolean | undefined {
  const v = fold(raw);
  if (!v) return undefined;
  if (['pasif', 'hayir', 'h', '0', 'false', 'ayrildi', 'izinde degil'].includes(v)) return false;
  if (['aktif', 'evet', 'e', '1', 'true'].includes(v)) return true;
  return undefined;
}

function findHeader(ws: ExcelJS.Worksheet): { row: number; cols: Partial<Record<HeaderKey, number>> } | null {
  const last = Math.min(ws.rowCount, 10);
  for (let r = 1; r <= last; r++) {
    const cols: Partial<Record<HeaderKey, number>> = {};
    ws.getRow(r).eachCell((cell, col) => {
      const text = fold(cellText(cell.value));
      for (const key of Object.keys(HEADER_ALIASES) as HeaderKey[]) {
        if (cols[key] === undefined && (HEADER_ALIASES[key] as readonly string[]).includes(text)) cols[key] = col;
      }
    });
    if (cols.fullName !== undefined || (cols.firstName !== undefined && cols.lastName !== undefined)) return { row: r, cols };
  }
  return null;
}

/** Yüklenen Excel dosyasından öğretmen satırlarını okur. "Adı" ve "Soyadı" ayrı sütunlarda da olabilir (MEBBİS çıktıları). */
export async function parseTeachersWorkbook(data: Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw badRequest('Dosya okunamadı. Lütfen Excel dosyasını .xlsx biçiminde kaydedip tekrar deneyin.');
  }
  const visible = wb.worksheets.filter((ws) => ws.state === 'visible');
  const ws = visible.find((s) => fold(s.name).includes('ogretmen')) ?? visible.find((s) => findHeader(s)) ?? visible[0];
  if (!ws) throw badRequest('Dosyada çalışma sayfası bulunamadı.');

  const header = findHeader(ws);
  if (!header) {
    throw badRequest('Başlık satırı bulunamadı. Şablondaki "Ad Soyad", "Branş" ve "Ünvan" başlıklarını kullanın.');
  }
  const { cols } = header;
  const rows: ParsedRow[] = [];
  const issues: ParseResult['issues'] = [];
  const get = (r: ExcelJS.Row, key: HeaderKey) => (cols[key] !== undefined ? cellText(r.getCell(cols[key]!).value) : '');

  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const fullName = tidyName(cols.fullName !== undefined ? get(row, 'fullName') : `${get(row, 'firstName')} ${get(row, 'lastName')}`);
    const branch = tidyName(get(row, 'branch')) || null;
    const title = tidyName(get(row, 'title')) || null;
    const status = get(row, 'status');
    if (!fullName && !branch && !title) continue;

    if (fullName.length < 2) issues.push({ row: r, message: 'Ad soyad boş' });
    else if (fullName.length > 80) issues.push({ row: r, message: 'Ad soyad 80 karakterden uzun' });
    else if (branch && branch.length > 60) issues.push({ row: r, message: 'Branş 60 karakterden uzun' });
    else if (title && title.length > 60) issues.push({ row: r, message: 'Ünvan 60 karakterden uzun' });
    else rows.push({ row: r, fullName, branch, title, isActive: parseStatus(status) });

    if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`Tek seferde en fazla ${MAX_IMPORT_ROWS} öğretmen aktarılabilir.`);
  }
  return { sheetName: ws.name, rows, issues };
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle' };
  });
}

/**
 * Şablon ya da dışa aktarma dosyası üretir. Branş ve Ünvan sütunlarında okulun listelerinden
 * açılır menü vardır; listede olmayan değer yazılırsa yalnızca uyarı verilir ve içe aktarırken eklenir.
 */
export async function buildTeachersWorkbook(opts: {
  branches: string[];
  titles: string[];
  rows?: TeacherSheetRow[];
  schoolName: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Okul Pano';
  wb.created = new Date();

  const withStatus = Boolean(opts.rows);
  const ws = wb.addWorksheet('Öğretmenler', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Ad Soyad', key: 'fullName', width: 34 },
    { header: 'Branş', key: 'branch', width: 34 },
    { header: 'Ünvan', key: 'title', width: 26 },
    ...(withStatus ? [{ header: 'Durum', key: 'status', width: 12 }] : []),
  ];
  styleHeader(ws);
  for (const r of opts.rows ?? []) {
    ws.addRow({ fullName: r.fullName, branch: r.branch ?? '', title: r.title ?? '', status: r.isActive === false ? 'Pasif' : 'Aktif' });
  }
  if (withStatus) ws.autoFilter = { from: 'A1', to: 'D1' };

  const lists = wb.addWorksheet('Listeler', { state: 'veryHidden' });
  opts.branches.forEach((b, i) => (lists.getCell(i + 1, 1).value = b));
  opts.titles.forEach((t, i) => (lists.getCell(i + 1, 2).value = t));

  const lastRow = Math.max(TEMPLATE_ROWS, (opts.rows?.length ?? 0) + 200);
  const listRule = (column: 'A' | 'B', count: number, label: string): ExcelJS.DataValidation => ({
    type: 'list',
    allowBlank: true,
    formulae: [`Listeler!$${column}$1:$${column}$${Math.max(1, count)}`],
    showInputMessage: true,
    promptTitle: label,
    prompt: 'Listeden seçin ya da yeni bir değer yazın.',
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Listede yok',
    error: `Bu ${label.toLocaleLowerCase('tr-TR')} listede yok. İçe aktarırken yeni ${label.toLocaleLowerCase('tr-TR')} olarak eklenecek.`,
  });
  validations(ws).add(`B2:B${lastRow}`, listRule('A', opts.branches.length, 'Branş'));
  validations(ws).add(`C2:C${lastRow}`, listRule('B', opts.titles.length, 'Ünvan'));
  if (withStatus) {
    validations(ws).add(`D2:D${lastRow}`, { type: 'list', allowBlank: true, formulae: ['"Aktif,Pasif"'] });
  }

  const help = wb.addWorksheet('Açıklama');
  const lines = [
    `${opts.schoolName} · Öğretmen listesi`,
    '',
    '1. "Öğretmenler" sayfasında her satıra bir öğretmen yazın. Ad Soyad zorunludur.',
    '2. Branş ve Ünvan hücrelerine tıklayınca açılan listeden seçebilirsiniz. Listede olmayan bir değer yazarsanız içe aktarırken otomatik eklenir.',
    '3. Adı ve soyadı ayrı sütunlarda olan listeler (ör. MEBBİS çıktısı) da kabul edilir: başlıkları "Adı" ve "Soyadı" olmalı.',
    '4. Sistemde aynı ad soyadla kayıtlı öğretmen varsa yeni kayıt açılmaz, branşı ve ünvanı güncellenir.',
    '5. Durum sütununa "Pasif" yazılan öğretmenler panoda nöbet ve ders programı seçimlerinde gizlenir.',
    '6. Dosyayı .xlsx olarak kaydedip yönetim panelinde Öğretmenler → Excel\'den yükle ile yükleyin.',
    '',
    'Örnek satır:',
  ];
  lines.forEach((l, i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = l;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });
  const ex = help.getRow(lines.length + 1);
  ex.values = ['Ayşe Demir', 'Matematik', 'Uzman Öğretmen'];
  help.getColumn(1).width = 40;
  help.getColumn(2).width = 30;
  help.getColumn(3).width = 24;
  ex.font = { italic: true, color: { argb: 'FF64748B' } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Türkçe karakterli dosya adını tüm tarayıcılarda doğru indirtmek için (RFC 5987) */
export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

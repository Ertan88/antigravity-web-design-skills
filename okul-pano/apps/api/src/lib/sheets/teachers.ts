import { tidyName } from '@okulpano/shared';
import type ExcelJS from 'exceljs';
import { badRequest } from '../errors.ts';
import {
  addHelpSheet,
  addListsSheet,
  cellText,
  findHeaderRow,
  fold,
  listRule,
  loadWorkbook,
  MAX_IMPORT_ROWS,
  newWorkbook,
  pickSheet,
  styleHeader,
  TEMPLATE_ROWS,
  toBuffer,
  validations,
  type SheetIssue,
} from '../excel.ts';

export interface TeacherSheetRow {
  fullName: string;
  branch: string | null;
  title: string | null;
  isActive?: boolean;
}

export interface ParsedTeacherRow extends TeacherSheetRow {
  /** Excel'deki satır numarası (kullanıcıya hata gösterirken) */
  row: number;
}

/** Ad soyad başlıkları öğrenci listesinde de kullanılır */
export const NAME_ALIASES = {
  fullName: ['ad soyad', 'adi soyadi', 'ad soyadi', 'adi ve soyadi', 'ad ve soyad', 'isim soyisim', 'adsoyad'],
  firstName: ['ad', 'adi', 'isim'],
  lastName: ['soyad', 'soyadi', 'soyisim'],
} as const;

const ALIASES = {
  ...NAME_ALIASES,
  fullName: [...NAME_ALIASES.fullName, 'ogretmen', 'ogretmen adi', 'ogretmen adi soyadi', 'personel', 'personel adi soyadi'],
  branch: ['brans', 'bransi', 'alan', 'alani', 'ders', 'brans alan', 'alan brans'],
  title: ['unvan', 'unvani', 'kadro', 'kadro unvani', 'gorev', 'gorevi', 'unvan gorev', 'gorev unvan'],
  status: ['durum', 'durumu', 'aktif'],
} as const;
type Key = keyof typeof ALIASES;

const hasName = (c: Partial<Record<string, number>>) => c.fullName !== undefined || (c.firstName !== undefined && c.lastName !== undefined);

/** Ad soyadı tek sütundan ya da "Adı" + "Soyadı" sütunlarından okur */
export function readName(row: ExcelJS.Row, cols: Partial<Record<'fullName' | 'firstName' | 'lastName', number>>): string {
  const get = (c?: number) => (c !== undefined ? cellText(row.getCell(c).value) : '');
  return tidyName(cols.fullName !== undefined ? get(cols.fullName) : `${get(cols.firstName)} ${get(cols.lastName)}`);
}

function parseStatus(raw: string): boolean | undefined {
  const v = fold(raw);
  if (!v) return undefined;
  if (['pasif', 'hayir', 'h', '0', 'false', 'ayrildi'].includes(v)) return false;
  if (['aktif', 'evet', 'e', '1', 'true'].includes(v)) return true;
  return undefined;
}

/** Yüklenen Excel dosyasından öğretmen satırlarını okur. "Adı" ve "Soyadı" ayrı sütunlarda da olabilir (MEBBİS çıktıları). */
export async function parseTeachersWorkbook(data: Buffer): Promise<{ sheetName: string; rows: ParsedTeacherRow[]; issues: SheetIssue[] }> {
  const wb = await loadWorkbook(data);
  const ws = pickSheet(wb, 'ogretmen', (s) => Boolean(findHeaderRow(s, ALIASES, hasName)));
  const header = findHeaderRow(ws, ALIASES, hasName);
  if (!header) throw badRequest('Başlık satırı bulunamadı. Şablondaki "Ad Soyad", "Branş" ve "Ünvan" başlıklarını kullanın.');

  const { cols } = header;
  const rows: ParsedTeacherRow[] = [];
  const issues: SheetIssue[] = [];
  const get = (r: ExcelJS.Row, key: Key) => (cols[key] !== undefined ? cellText(r.getCell(cols[key]!).value) : '');

  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const fullName = readName(row, cols);
    const branch = tidyName(get(row, 'branch')) || null;
    const title = tidyName(get(row, 'title')) || null;
    if (!fullName && !branch && !title) continue;

    if (fullName.length < 2) issues.push({ row: r, message: 'Ad soyad boş' });
    else if (fullName.length > 80) issues.push({ row: r, message: 'Ad soyad 80 karakterden uzun' });
    else if (branch && branch.length > 60) issues.push({ row: r, message: 'Branş 60 karakterden uzun' });
    else if (title && title.length > 60) issues.push({ row: r, message: 'Ünvan 60 karakterden uzun' });
    else rows.push({ row: r, fullName, branch, title, isActive: parseStatus(get(row, 'status')) });

    if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`Tek seferde en fazla ${MAX_IMPORT_ROWS} öğretmen aktarılabilir.`);
  }
  return { sheetName: ws.name, rows, issues };
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
  const wb = newWorkbook();
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

  const [branchRange, titleRange] = addListsSheet(wb, [opts.branches, opts.titles]);
  const lastRow = Math.max(TEMPLATE_ROWS, (opts.rows?.length ?? 0) + 200);
  validations(ws).add(`B2:B${lastRow}`, listRule(branchRange!, 'Branş', { allowNew: true }));
  validations(ws).add(`C2:C${lastRow}`, listRule(titleRange!, 'Ünvan', { allowNew: true }));
  if (withStatus) validations(ws).add(`D2:D${lastRow}`, { type: 'list', allowBlank: true, formulae: ['"Aktif,Pasif"'] });

  addHelpSheet(
    wb,
    `${opts.schoolName} · Öğretmen listesi`,
    [
      '1. "Öğretmenler" sayfasında her satıra bir öğretmen yazın. Ad Soyad zorunludur.',
      '2. Branş ve Ünvan hücrelerine tıklayınca açılan listeden seçebilirsiniz. Listede olmayan bir değer yazarsanız içe aktarırken otomatik eklenir.',
      '3. Adı ve soyadı ayrı sütunlarda olan listeler (ör. MEBBİS çıktısı) da kabul edilir: başlıkları "Adı" ve "Soyadı" olmalı.',
      '4. Sistemde aynı ad soyadla kayıtlı öğretmen varsa yeni kayıt açılmaz, branşı ve ünvanı güncellenir.',
      '5. Durum sütununa "Pasif" yazılan öğretmenler nöbet ve ders programı seçimlerinde gizlenir.',
      '6. Dosyayı .xlsx olarak kaydedip yönetim panelinde Öğretmen Kadrosu → Excel\'den yükle ile yükleyin.',
    ],
    { header: ['Ad Soyad', 'Branş', 'Ünvan'], row: ['Ayşe Demir', 'Matematik', 'Uzman Öğretmen'] },
  );
  return toBuffer(wb);
}

import { normalizeClassName } from '@okulpano/shared';
import type ExcelJS from 'exceljs';
import { badRequest } from '../errors.ts';
import {
  addHelpSheet,
  addListsSheet,
  cellText,
  findHeaderRow,
  listRule,
  loadWorkbook,
  newWorkbook,
  parseDateCell,
  pickSheet,
  styleHeader,
  TEMPLATE_ROWS,
  toBuffer,
  validations,
  type SheetIssue,
} from '../excel.ts';
import { NAME_ALIASES, readName } from './teachers.ts';

export const MAX_STUDENT_ROWS = 5000;

export interface StudentSheetRow {
  schoolNo: string;
  fullName: string;
  className: string | null;
  birthDate: string;
}

export interface ParsedStudentRow extends StudentSheetRow {
  row: number;
}

const ALIASES = {
  ...NAME_ALIASES,
  // Tek başına "No" alınmaz: e-Okul listelerindeki "S.No" (sıra numarası) ile karışır
  schoolNo: ['okul no', 'okul numarasi', 'okul nu', 'ogrenci no', 'ogrenci numarasi', 'numara', 'numarasi'],
  fullName: [...NAME_ALIASES.fullName, 'ogrenci', 'ogrenci adi', 'ogrenci adi soyadi'],
  className: ['sinif', 'sinifi', 'sinif sube', 'sinifi subesi', 'sinif ve sube', 'sube sinif'],
  /** e-Okul listelerinde şube ayrı sütunda olabilir: Sınıfı = 9, Şubesi = A */
  section: ['sube', 'subesi'],
  birthDate: ['dogum tarihi', 'dogum t', 'dogum tar', 'd tarihi', 'dogum', 'dogum gunu'],
} as const;
type Key = keyof typeof ALIASES;

const hasColumns = (c: Partial<Record<Key, number>>) =>
  (c.fullName !== undefined || (c.firstName !== undefined && c.lastName !== undefined)) && c.birthDate !== undefined && c.schoolNo !== undefined;

export async function parseStudentsWorkbook(data: Buffer): Promise<{ sheetName: string; rows: ParsedStudentRow[]; issues: SheetIssue[] }> {
  const wb = await loadWorkbook(data);
  const ws = pickSheet(wb, 'ogrenci', (s) => Boolean(findHeaderRow(s, ALIASES, hasColumns)));
  const header = findHeaderRow(ws, ALIASES, hasColumns);
  if (!header) {
    throw badRequest('Başlık satırı bulunamadı. Şablondaki "Okul No", "Ad Soyad", "Sınıf" ve "Doğum Tarihi" başlıklarını kullanın.');
  }
  const { cols } = header;
  const thisYear = new Date().getFullYear();
  const rows: ParsedStudentRow[] = [];
  const issues: SheetIssue[] = [];
  const text = (r: ExcelJS.Row, key: Key) => (cols[key] !== undefined ? cellText(r.getCell(cols[key]!).value) : '');

  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const fullName = readName(row, cols);
    const schoolNo = text(row, 'schoolNo').replace(/\s+/g, '');
    const rawDate = cols.birthDate !== undefined ? row.getCell(cols.birthDate).value : null;
    let cls = text(row, 'className');
    const section = text(row, 'section');
    if (section && /^\d{1,2}$/.test(cls)) cls = `${cls}-${section}`;
    if (!fullName && !cls && !cellText(rawDate) && !schoolNo) continue;

    const birthDate = parseDateCell(rawDate);
    const year = birthDate ? Number(birthDate.slice(0, 4)) : 0;
    const className = cls ? normalizeClassName(cls) : null;

    if (fullName.length < 2) issues.push({ row: r, message: 'Ad soyad boş' });
    else if (!schoolNo) issues.push({ row: r, message: `${fullName}: okul no boş` });
    else if (schoolNo.length > 20 || !/^[0-9A-Za-zÇĞİÖŞÜçğıöşü-]+$/.test(schoolNo)) issues.push({ row: r, message: `${fullName}: okul no geçersiz ("${schoolNo}")` });
    else if (fullName.length > 80) issues.push({ row: r, message: 'Ad soyad 80 karakterden uzun' });
    else if (!cellText(rawDate)) issues.push({ row: r, message: `${fullName}: doğum tarihi boş` });
    else if (!birthDate) issues.push({ row: r, message: `${fullName}: doğum tarihi okunamadı ("${cellText(rawDate)}"), GG.AA.YYYY biçiminde yazın` });
    else if (year < thisYear - 30 || year > thisYear) issues.push({ row: r, message: `${fullName}: doğum yılı ${year} geçerli görünmüyor` });
    else if (className && className.length > 20) issues.push({ row: r, message: `${fullName}: sınıf adı çok uzun` });
    else rows.push({ row: r, schoolNo, fullName, className, birthDate });

    if (rows.length > MAX_STUDENT_ROWS) throw badRequest(`Tek seferde en fazla ${MAX_STUDENT_ROWS} öğrenci aktarılabilir.`);
  }
  return { sheetName: ws.name, rows, issues };
}

/** Öğrenci şablonu / dışa aktarma: Sınıf sütununda okulun sınıfları açılır listede, doğum tarihi gerçek tarih hücresi. */
export async function buildStudentsWorkbook(opts: { classes: string[]; rows?: StudentSheetRow[]; schoolName: string }): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Öğrenciler', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Okul No', key: 'schoolNo', width: 10 },
    { header: 'Ad Soyad', key: 'fullName', width: 34 },
    { header: 'Sınıf', key: 'className', width: 12 },
    { header: 'Doğum Tarihi', key: 'birthDate', width: 16, style: { numFmt: 'dd.mm.yyyy', alignment: { horizontal: 'left' } } },
  ];
  styleHeader(ws);
  for (const r of opts.rows ?? []) {
    // Tarih hücresi: Excel'de sıralanabilir ve gün.ay.yıl görünür
    ws.addRow({ schoolNo: r.schoolNo, fullName: r.fullName, className: r.className ?? '', birthDate: new Date(`${r.birthDate}T00:00:00Z`) });
  }
  if (opts.rows) ws.autoFilter = { from: 'A1', to: 'D1' };

  const [classRange] = addListsSheet(wb, [opts.classes]);
  const lastRow = Math.max(TEMPLATE_ROWS, (opts.rows?.length ?? 0) + 200);
  validations(ws).add(`C2:C${lastRow}`, listRule(classRange!, 'Sınıf', { allowNew: true }));
  const thisYear = new Date().getUTCFullYear();
  validations(ws).add(`D2:D${lastRow}`, {
    type: 'date',
    operator: 'between',
    allowBlank: false,
    formulae: [new Date(Date.UTC(thisYear - 30, 0, 1)), new Date(Date.UTC(thisYear, 11, 31))],
    showInputMessage: true,
    promptTitle: 'Doğum tarihi',
    prompt: 'GG.AA.YYYY biçiminde yazın (ör. 14.03.2012).',
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Tarih geçersiz',
    error: 'Doğum tarihini GG.AA.YYYY biçiminde yazın.',
  });

  addHelpSheet(
    wb,
    `${opts.schoolName} · Öğrenci listesi`,
    [
      '1. "Öğrenciler" sayfasında her satıra bir öğrenci yazın. Okul No, Ad Soyad ve Doğum Tarihi zorunludur.',
      '2. Sınıf hücresine tıklayınca okulunuzun sınıfları listelenir. Listede olmayan sınıf (ör. 7-C) içe aktarırken otomatik oluşturulur.',
      '3. Sınıf "9-A", "9/A", "9A" ya da "9. Sınıf A Şubesi" yazılabilir; hepsi 9-A olarak kaydedilir.',
      '4. e-Okul listeleri de kabul edilir: "Adı" / "Soyadı" ya da "Sınıfı" / "Şubesi" ayrı sütunlarda olabilir; "Okul No" sütunu "Öğrenci No" ya da "Numara" diye de yazılabilir.',
      '5. Okul numarası okul içinde benzersizdir: aynı numarayla kayıtlı öğrenci varsa yeni kayıt açılmaz, adı, sınıfı ve doğum tarihi güncellenir.',
      '6. Doğum tarihleri yalnızca panoda doğum günü kutlaması için kullanılır; panoda soyadın yalnızca baş harfi gösterilir.',
    ],
    { header: ['Okul No', 'Ad Soyad', 'Sınıf', 'Doğum Tarihi'], row: ['1234', 'Elif Yılmaz', '9-A', '14.03.2010'] },
  );
  return toBuffer(wb);
}

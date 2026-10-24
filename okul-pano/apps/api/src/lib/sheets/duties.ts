import { normalizeName, tidyName, WEEKDAY_NAMES } from '@okulpano/shared';
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
  toBuffer,
  validations,
  type SheetIssue,
} from '../excel.ts';

/*
 * Nöbet çizelgesi okulların kâğıtta kullandığı biçimdedir: satırlarda nöbet yerleri, sütunlarda günler,
 * hücrelerde nöbetçi öğretmen (birden fazlaysa virgülle). Bu dosya yazdırılıp panoya da asılabilir.
 * Okurken "Gün | Nöbet Yeri | Öğretmen" sütunlu uzun listeler de kabul edilir.
 */

export interface DutyEntry {
  row: number;
  weekday: number;
  area: string;
  teacherName: string;
}

export const DEFAULT_DUTY_AREAS = ['Zemin Kat', '1. Kat', '2. Kat', 'Bahçe', 'Kantin'];

const DAY_ALIASES: Record<number, readonly string[]> = {
  1: ['pazartesi', 'pzt', 'pts', 'ptesi'],
  2: ['sali', 'sal'],
  3: ['carsamba', 'car', 'crs', 'crsb'],
  4: ['persembe', 'per', 'prs', 'prsb'],
  5: ['cuma', 'cum'],
  6: ['cumartesi', 'cmt', 'cts', 'ctesi'],
  7: ['pazar', 'paz', 'pzr'],
};
const AREA_ALIASES = ['nobet yeri', 'nobet yerleri', 'yer', 'yerler', 'nobet alani', 'alan', 'bolum', 'kat', 'nobet bolgesi', 'nobet noktasi'];
const LIST_ALIASES = {
  weekday: ['gun', 'gunu', 'gunler', 'nobet gunu'],
  area: AREA_ALIASES,
  teacher: ['ogretmen', 'nobetci', 'nobetci ogretmen', 'ogretmen adi soyadi', 'ad soyad', 'adi soyadi', 'nobetci ogretmen adi soyadi'],
} as const;

export function weekdayOf(text: string): number | null {
  const f = fold(text);
  if (/^[1-7]$/.test(f)) return Number(f);
  for (const [day, aliases] of Object.entries(DAY_ALIASES)) if (aliases.includes(f)) return Number(day);
  return null;
}

/** Bir hücrede birden fazla öğretmen: virgül, noktalı virgül, satır sonu ya da " / " ile ayrılır */
function splitNames(text: string): string[] {
  return text
    .split(/[,;\n]+|\s\/\s/)
    .map(tidyName)
    .filter(Boolean);
}

export async function parseDutiesWorkbook(data: Buffer): Promise<{
  sheetName: string;
  layout: 'matrix' | 'list';
  weekdays: number[];
  entries: DutyEntry[];
  issues: SheetIssue[];
}> {
  const wb = await loadWorkbook(data);

  // 1) Çizelge biçimi: aynı satırda en az iki gün adı olan başlık
  const findMatrix = (ws: Parameters<typeof findHeaderRow>[0]) => {
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
      const days = new Map<number, number>();
      let areaCol: number | undefined;
      ws.getRow(r).eachCell((cell, col) => {
        const text = cellText(cell.value);
        const day = weekdayOf(text);
        if (day && ![...days.values()].includes(day)) days.set(col, day);
        else if (areaCol === undefined && AREA_ALIASES.includes(fold(text))) areaCol = col;
      });
      if (days.size >= 2) {
        const firstDayCol = Math.min(...days.keys());
        return { row: r, days, areaCol: areaCol ?? (firstDayCol > 1 ? firstDayCol - 1 : 1) };
      }
    }
    return null;
  };
  const hasList = (c: Partial<Record<keyof typeof LIST_ALIASES, number>>) =>
    c.weekday !== undefined && c.area !== undefined && c.teacher !== undefined;

  const ws = pickSheet(wb, 'nobet', (s) => Boolean(findMatrix(s) ?? findHeaderRow(s, LIST_ALIASES, hasList)));
  const entries: DutyEntry[] = [];
  const issues: SheetIssue[] = [];

  const push = (row: number, weekday: number, area: string, name: string) => {
    if (name.length < 2) return;
    if (name.length > 80) issues.push({ row, message: `"${name.slice(0, 30)}…" öğretmen adı çok uzun` });
    else if (area.length > 60) issues.push({ row, message: 'Nöbet yeri 60 karakterden uzun' });
    else entries.push({ row, weekday, area, teacherName: name });
    if (entries.length > MAX_IMPORT_ROWS) throw badRequest(`Tek seferde en fazla ${MAX_IMPORT_ROWS} nöbet aktarılabilir.`);
  };

  const matrix = findMatrix(ws);
  if (matrix) {
    for (let r = matrix.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const area = tidyName(cellText(row.getCell(matrix.areaCol).value));
      const cells = [...matrix.days].map(([col, day]) => ({ day, names: splitNames(cellText(row.getCell(col).value)) }));
      const hasNames = cells.some((c) => c.names.length);
      if (!hasNames) continue;
      if (!area) {
        issues.push({ row: r, message: 'Nöbet yeri boş; bu satırdaki öğretmenler atlanacak' });
        continue;
      }
      for (const c of cells) for (const name of c.names) push(r, c.day, area, name);
    }
    return { sheetName: ws.name, layout: 'matrix', weekdays: [...new Set(matrix.days.values())].sort(), entries, issues };
  }

  // 2) Uzun liste biçimi: Gün | Nöbet Yeri | Öğretmen
  const header = findHeaderRow(ws, LIST_ALIASES, hasList);
  if (!header) {
    throw badRequest('Çizelge okunamadı. Şablondaki gibi ilk sütunda "Nöbet Yeri", diğer sütunlarda gün adları (Pazartesi, Salı…) olmalı.');
  }
  const { cols } = header;
  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const dayText = cellText(row.getCell(cols.weekday!).value);
    const area = tidyName(cellText(row.getCell(cols.area!).value));
    const names = splitNames(cellText(row.getCell(cols.teacher!).value));
    if (!dayText && !area && !names.length) continue;
    const day = weekdayOf(dayText);
    if (!day) issues.push({ row: r, message: `Gün anlaşılamadı: "${dayText}"` });
    else if (!area) issues.push({ row: r, message: 'Nöbet yeri boş' });
    else if (!names.length) issues.push({ row: r, message: 'Öğretmen boş' });
    else for (const name of names) push(r, day, area, name);
  }
  return { sheetName: ws.name, layout: 'list', weekdays: [...new Set(entries.map((e) => e.weekday))].sort(), entries, issues };
}

/**
 * Çizelge şablonu / dışa aktarma. Hücrelerde kadrodaki öğretmenler açılır listede; yatay A4'e
 * sığacak şekilde sayfa ayarlı, üst bilgide okul adı yazar.
 */
export async function buildDutiesWorkbook(opts: {
  schoolName: string;
  teachers: string[];
  areas: string[];
  weekdays: number[];
  /** alan -> gün -> öğretmenler; şablonda boş */
  cells?: Map<string, Map<number, string[]>>;
}): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Nöbet Çizelgesi', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
    headerFooter: { oddHeader: `&C&"-,Bold"&14${opts.schoolName.replace(/&/g, '&&')} · Nöbet Çizelgesi`, oddFooter: '&LOkul Pano&R&D' },
  });
  ws.columns = [
    { header: 'Nöbet Yeri', key: 'area', width: 24 },
    ...opts.weekdays.map((d) => ({ header: WEEKDAY_NAMES[d], key: `d${d}`, width: 28 })),
  ];
  styleHeader(ws);

  const border = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } };
  const areas = opts.areas.length ? opts.areas : DEFAULT_DUTY_AREAS;
  for (const area of areas) {
    const byDay = opts.cells?.get(normalizeName(area));
    const row = ws.addRow({ area, ...Object.fromEntries(opts.weekdays.map((d) => [`d${d}`, (byDay?.get(d) ?? []).join(', ')])) });
    row.height = 30;
    row.getCell(1).font = { bold: true };
  }
  const lastCol = opts.weekdays.length + 1;
  const printedRows = ws.rowCount;
  for (let r = 1; r <= printedRows; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = { top: border, left: border, bottom: border, right: border };
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
  }

  const [teacherRange, areaRange] = addListsSheet(wb, [opts.teachers, areas]);
  const lastRow = printedRows + 30;
  const lastLetter = String.fromCharCode(64 + lastCol);
  validations(ws).add(`A2:A${lastRow}`, listRule(areaRange!, 'Nöbet yeri', { allowNew: true }));
  validations(ws).add(
    `B2:${lastLetter}${lastRow}`,
    listRule(teacherRange!, 'Öğretmen', {
      allowNew: true,
      error: 'Bu isim kadroda yok. Birden fazla öğretmeni virgülle ayırabilirsiniz; isimler Öğretmen Kadrosu\'ndaki gibi yazılmalı.',
    }),
  );

  addHelpSheet(
    wb,
    `${opts.schoolName} · Nöbet çizelgesi`,
    [
      '1. İlk sütuna nöbet yerlerini (Zemin Kat, Bahçe, Kantin…), gün sütunlarına o gün nöbetçi öğretmeni yazın.',
      '2. Hücreye tıklayınca öğretmen kadrosu listelenir. Bir yerde birden fazla öğretmen varsa isimleri virgülle ayırın.',
      '3. Öğretmen isimleri Öğretmen Kadrosu\'ndaki gibi olmalı; kadroda olmayan isimler içe aktarırken atlanır ve size bildirilir.',
      '4. Yeni nöbet yeri eklemek için alttaki boş satırlara yazmanız yeterli. Cumartesi/Pazar nöbeti varsa o günün adıyla sütun ekleyin.',
      '5. İçe aktarırken "değiştir" seçilirse dosyadaki günlerin eski nöbetleri silinip bu çizelge yazılır; dosyada olmayan günlere dokunulmaz.',
      '6. Bu sayfa yatay A4\'e sığacak şekilde ayarlıdır; yazdırıp panoya da asabilirsiniz.',
    ],
    { header: ['Nöbet Yeri', 'Pazartesi', 'Salı'], row: ['Bahçe', 'Ayşe Demir', 'Ali Kaya, Fatma Aydın'] },
  );
  return toBuffer(wb);
}

import { detectHolidayText, tidyName, WEEKDAY_NAMES } from '@okulpano/shared';
import type ExcelJS from 'exceljs';
import { badRequest } from '../errors.ts';
import {
  addHelpSheet,
  addListsSheet,
  cellText,
  fold,
  listRule,
  loadWorkbook,
  MAX_IMPORT_ROWS,
  newWorkbook,
  parseDateCell,
  pickSheet,
  toBuffer,
  validations,
  type SheetIssue,
} from '../excel.ts';
import { MONTHS, titleTextOf, trDate } from './duties.ts';

/*
 * Taşımalı eğitim (servis) nöbet çizelgesi, okulların kullandığı aylık düzende:
 * başlık, "AİT OLDUĞU AY", ardından Nöbet Tarihi | Nöbet Günü | Nöbetçi Öğretmen 1 | Nöbetçi Öğretmen 2.
 * Öğretmen sütunu sayısı serbesttir (3. görevli varsa "Nöbetçi Öğretmen 3" eklenebilir).
 */

export interface TransportEntry {
  row: number;
  date: string;
  names: string[];
  /** Öğretmen yerine tatil yazılmışsa ("29 EKİM CUMHURİYET BAYRAMI") */
  holiday: string | null;
}

const DATE_ALIASES = ['nobet tarihi', 'tarih', 'gorev tarihi', 'servis tarihi'];
const TEACHER_RE = /^(nobetci |gorevli |servis )?(ogretmen|ogretmenler|nobetci|gorevli)( adi soyadi)?( \d)?$/;

export async function parseTransportWorkbook(
  data: Buffer,
): Promise<{ sheetName: string; entries: TransportEntry[]; titleText: string; issues: SheetIssue[] }> {
  const wb = await loadWorkbook(data);
  const findHeader = (ws: ExcelJS.Worksheet) => {
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
      let dateCol: number | undefined;
      const teacherCols: number[] = [];
      ws.getRow(r).eachCell((cell, col) => {
        const text = fold(cellText(cell.value));
        if (dateCol === undefined && DATE_ALIASES.includes(text)) dateCol = col;
        else if (TEACHER_RE.test(text) && !teacherCols.includes(col)) teacherCols.push(col);
      });
      if (dateCol !== undefined && teacherCols.length) return { row: r, dateCol, teacherCols };
    }
    return null;
  };
  const ws = pickSheet(wb, 'servis', (s) => Boolean(findHeader(s)));
  const header = findHeader(ws);
  if (!header) {
    throw badRequest('Çizelge okunamadı. Şablondaki gibi "Nöbet Tarihi" ve "Nöbetçi Öğretmen 1", "Nöbetçi Öğretmen 2" başlıkları olmalı.');
  }

  const byDate = new Map<string, TransportEntry>();
  const issues: SheetIssue[] = [];
  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const dateCell = row.getCell(header.dateCol).value;
    const rawDate = cellText(dateCell);
    const cells = header.teacherCols.map((c) => tidyName(cellText(row.getCell(c).value))).filter((n) => n.length >= 2);
    const holiday = cells.map((c) => detectHolidayText(c)).find(Boolean) ?? null;
    const names = cells.filter((c) => !detectHolidayText(c));
    if (!rawDate && !names.length) continue;
    const date = parseDateCell(dateCell);
    if (!date) {
      issues.push({ row: r, message: rawDate ? `Tarih anlaşılamadı: "${rawDate}"` : 'Tarih boş' });
      continue;
    }
    if (names.some((n) => n.length > 80)) {
      issues.push({ row: r, message: 'Öğretmen adı çok uzun' });
      continue;
    }
    // Aynı tarih iki kez yazılmışsa sonraki geçerli
    byDate.set(date, { row: r, date, names: [...new Set(names)], holiday });
    if (byDate.size > MAX_IMPORT_ROWS) throw badRequest(`Tek seferde en fazla ${MAX_IMPORT_ROWS} gün aktarılabilir.`);
  }
  return {
    sheetName: ws.name,
    entries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    titleText: titleTextOf(ws, header.row),
    issues,
  };
}

/** Ayın hafta içi günleri (YYYY-AA-GG) */
export function monthSchoolDays(year: number, month: number, weekdays = [1, 2, 3, 4, 5]): { date: string; weekday: number }[] {
  const out: { date: string; weekday: number }[] = [];
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= count; d++) {
    const weekday = ((new Date(Date.UTC(year, month - 1, d)).getUTCDay() + 6) % 7) + 1;
    if (weekdays.includes(weekday)) out.push({ date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, weekday });
  }
  return out;
}

/** Şablon / dışa aktarma: okulun servis nöbet çizelgesi düzeni */
export async function buildTransportWorkbook(opts: {
  schoolName: string;
  teachers: string[];
  year: number;
  month: number;
  /** YYYY-AA-GG -> görevliler; şablonda boş */
  days?: Map<string, string[]>;
}): Promise<Buffer> {
  const wb = newWorkbook();
  const slots = Math.max(2, ...[...(opts.days?.values() ?? [])].map((n) => n.length));
  const lastCol = 2 + slots;
  const lastLetter = String.fromCharCode(64 + lastCol);
  const ws = wb.addWorksheet('Servis Nöbet Çizelgesi', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddHeader: `&C&"-,Bold"&12${opts.schoolName.replace(/&/g, '&&')}`, oddFooter: '&LOkulyayın&R&D' },
  });
  ws.columns = [{ width: 14 }, { width: 17 }, ...Array.from({ length: slots }, () => ({ width: 28 }))];

  const black = { style: 'thin' as const, color: { argb: 'FF000000' } };
  const box = { top: black, left: black, bottom: black, right: black };
  const center = { horizontal: 'center' as const, vertical: 'middle' as const };

  ws.mergeCells(`A1:${lastLetter}1`);
  ws.getCell('A1').value = 'ÖĞRETMEN SERVİS NÖBET ÇİZELGESİ';
  ws.getCell('A1').font = { name: 'Calibri', size: 16, bold: true };
  ws.getCell('A1').alignment = center;
  ws.getRow(1).height = 30;
  ws.mergeCells(`A2:${lastLetter}2`);
  ws.getCell('A2').value = `AİT OLDUĞU AY: ${MONTHS[opts.month]} ${opts.year}`;
  ws.getCell('A2').font = { name: 'Calibri', size: 11, bold: true };
  ws.getRow(3).values = ['Nöbet Tarihi', 'Nöbet Günü', ...Array.from({ length: slots }, (_, i) => `Nöbetçi Öğretmen ${i + 1}`)];
  ws.getRow(3).height = 22;

  const days = monthSchoolDays(opts.year, opts.month);
  days.forEach((d, i) => {
    const row = ws.getRow(4 + i);
    const names = opts.days?.get(d.date) ?? [];
    row.values = [trDate(d.date), WEEKDAY_NAMES[d.weekday]!.toLocaleUpperCase('tr-TR'), ...Array.from({ length: slots }, (_, k) => names[k] ?? null)];
    row.height = 20;
  });
  const last = 3 + days.length;
  for (let r = 2; r <= last; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = box;
      cell.font = { name: 'Calibri', size: 11, bold: r <= 3 };
      if (r === 3 || c <= 2) cell.alignment = center;
      else if (r > 3) cell.alignment = { vertical: 'middle' };
    }
  }
  ws.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  const [teacherRange] = addListsSheet(wb, [opts.teachers]);
  validations(ws).add(
    `C4:${lastLetter}${Math.max(last, 4)}`,
    listRule(teacherRange!, 'Öğretmen', {
      allowNew: true,
      error: "Bu isim kadroda yok. İsimler Öğretmen Kadrosu'ndaki gibi ya da kısaltmalı (ör. Y. Demir) yazılabilir.",
    }),
  );

  addHelpSheet(
    wb,
    `${opts.schoolName} · Servis nöbet çizelgesi`,
    [
      '1. Her tarih için taşımalı öğrencilerle ilgilenecek nöbetçi öğretmenleri yazın (sabah servisten indirme, öğle yemeği, akşam servise bindirme).',
      '2. Hücreye tıklayınca öğretmen kadrosu listelenir. Kısaltmalı yazımlar da tanınır (ör. "Yasemin E. Hakverdi").',
      '3. Üçüncü bir görevli gerekiyorsa sağa "Nöbetçi Öğretmen 3" başlıklı sütun ekleyebilirsiniz.',
      '4. Dosyadaki her tarihin görevlileri, yüklediğinizde o tarihte kayıtlı olanların yerine geçer; dosyada olmayan tarihlere dokunulmaz.',
      '5. Bir tarihi boş bırakırsanız o günün görevlendirmesi kaldırılır.',
    ],
    { header: ['Nöbet Tarihi', 'Nöbet Günü', 'Nöbetçi Öğretmen 1', 'Nöbetçi Öğretmen 2'], row: ['07.09.2026', 'PAZARTESİ', 'Ayşe Demir', 'Ali Kaya'] },
  );
  return toBuffer(wb);
}

import { detectHolidayText, tidyName, WEEKDAY_NAMES } from '@okulpano/shared';
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
  parseDateCell,
  pickSheet,
  toBuffer,
  validations,
  type SheetIssue,
} from '../excel.ts';

/*
 * Nöbet çizelgesi okulların kâğıtta kullandığı aylık biçimdedir: her gün bir blok (birleştirilmiş
 * gün hücresi), blokta sıra no, nöbetçi öğretmen ve nöbet yeri; sağda o günün tarihleri ve her tarihin
 * nöbetçi müdür yardımcısı. Nöbet yerleri okulun kendi yerleridir; dosya yazdırılıp panoya da asılabilir.
 * Okurken ayrıca eski "Nöbet Yeri x Günler" tablosu ve "Gün | Nöbet Yeri | Öğretmen" listeleri kabul edilir.
 */

export interface DutyEntry {
  row: number;
  weekday: number;
  area: string;
  teacherName: string;
}

export interface HolidayEntry {
  row: number;
  /** Tatil yazısının bulunduğu gün bloğu (tarih yoksa) */
  weekday: number | null;
  /** Tatil yazısının yanındaki tarih (müdür yardımcısı sütunu gibi) */
  date: string | null;
  name: string;
}

export interface SupervisorEntry {
  row: number;
  date: string;
  name: string;
}

export const DEFAULT_DUTY_AREAS = ['Zemin Kat', '1. Kat', '2. Kat', 'Bahçe', 'Kantin'];

export const MONTHS = ['', 'OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];

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
  teacher: [
    'ogretmen',
    'nobetci',
    'nobetci ogretmen',
    'ogretmen adi soyadi',
    'ad soyad',
    'adi soyadi',
    'adi ve soyadi',
    'nobetci ogretmen adi soyadi',
    'nobetci ogretmenin adi soyadi',
    'nobetci ogretmenin adi ve soyadi',
    'ogretmenin adi ve soyadi',
    'ogretmenin adi soyadi',
  ],
} as const;
/** Okulların aylık çizelgesindeki sağ blok: "Tarih | Nöbetçi Müdür Yard." */
const SUPERVISOR_ALIASES = {
  date: ['tarih', 'nobet tarihi', 'nobet gunu tarihi'],
  name: [
    'nobetci mudur yard',
    'nobetci mudur yrd',
    'nobetci mudur yardimcisi',
    'mudur yard',
    'mudur yrd',
    'mudur yardimcisi',
    'nobetci idareci',
    'idareci',
    'nobetci yonetici',
  ],
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
    .filter((n) => n && !/^\d+[.)]?$/.test(n));
}

const pad = (n: number) => String(n).padStart(2, '0');
/** 2026-09-14 -> 14.09.2026 */
export const trDate = (iso: string) => iso.split('-').reverse().join('.');

/** Ayın verilen haftaiçi günlerine düşen tarihleri (YYYY-AA-GG) */
export function monthDates(year: number, month: number, weekday: number): string[] {
  const out: string[] = [];
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) {
    const wd = ((new Date(Date.UTC(year, month - 1, d)).getUTCDay() + 6) % 7) + 1;
    if (wd === weekday) out.push(`${year}-${pad(month)}-${pad(d)}`);
  }
  return out;
}

export async function parseDutiesWorkbook(data: Buffer): Promise<{
  sheetName: string;
  layout: 'matrix' | 'list' | 'monthly';
  weekdays: number[];
  entries: DutyEntry[];
  supervisors: SupervisorEntry[];
  holidays: HolidayEntry[];
  /** Başlık satırlarındaki yazı ("AİT OLDUĞU AY: EKİM"); ayı bulmak için */
  titleText: string;
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
        // Başlıkta yalnızca gün adı aranır; "1", "2" gibi sıra numaraları gün sayılmaz
        const day = /^\d+$/.test(text) ? null : weekdayOf(text);
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
  const holidays: HolidayEntry[] = [];

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
      const cells = [...matrix.days].flatMap(([col, day]) => {
        const text = cellText(row.getCell(col).value);
        const holiday = detectHolidayText(text);
        if (holiday) {
          holidays.push({ row: r, weekday: day, date: null, name: holiday });
          return [];
        }
        return [{ day, names: splitNames(text) }];
      });
      const hasNames = cells.some((c) => c.names.length);
      if (!hasNames) continue;
      if (!area) {
        issues.push({ row: r, message: 'Nöbet yeri boş; bu satırdaki öğretmenler atlanacak' });
        continue;
      }
      for (const c of cells) for (const name of c.names) push(r, c.day, area, name);
    }
    return {
      sheetName: ws.name,
      layout: 'matrix',
      weekdays: [...new Set(matrix.days.values())].sort(),
      entries,
      supervisors: [],
      holidays,
      titleText: titleTextOf(ws, matrix.row),
      issues,
    };
  }

  // 2) Aylık blok biçimi ve uzun liste: Gün | (Sıra) | Öğretmen | Nöbet Yeri | (Tarih | Müdür Yard.)
  const header = findHeaderRow(ws, LIST_ALIASES, hasList);
  if (!header) {
    throw badRequest(
      'Çizelge okunamadı. Şablondaki gibi "Günler", "Nöbetçi Öğretmenin Adı Soyadı" ve "Nöbet Yeri" başlıkları olmalı.',
    );
  }
  const cols = { ...header.cols };
  // Birleştirilmiş başlık (ör. "Nöbetçi Öğretmenin Adı Soyadı" B3:C4) birden fazla sütunu kaplar; ilki genelde
  // sıra numarasıdır. Aynı başlığı taşıyan son sütun öğretmen sütunudur.
  const headerText = (c: number) => fold(cellText(ws.getRow(header.row).getCell(c).value));
  while (cols.teacher! + 1 !== cols.area && headerText(cols.teacher! + 1) === headerText(cols.teacher!)) cols.teacher!++;

  // Müdür yardımcısı bloğu başlık satırında ya da hemen altındaki ikinci başlık satırında olabilir
  let sup: { date?: number; name?: number } = {};
  let dataStart = header.row + 1;
  for (let r = header.row; r <= Math.min(header.row + 2, ws.rowCount); r++) {
    const found: { date?: number; name?: number } = {};
    ws.getRow(r).eachCell((cell, col) => {
      const text = fold(cellText(cell.value));
      if (found.date === undefined && SUPERVISOR_ALIASES.date.includes(text as never)) found.date = col;
      if (found.name === undefined && SUPERVISOR_ALIASES.name.includes(text as never)) found.name = col;
    });
    if (found.date !== undefined && found.name !== undefined) {
      sup = found;
      dataStart = Math.max(dataStart, r + 1);
      break;
    }
  }
  const supervisors = new Map<string, SupervisorEntry>();
  const headerWords = new Set([...LIST_ALIASES.weekday, ...AREA_ALIASES]);
  // Gün hücresi yalnızca bloğun ilk satırına yazılmış olabilir (birleştirilmemiş): aşağı doğru taşınır
  let lastDay: number | null = null;

  for (let r = dataStart; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const dayText = cellText(row.getCell(cols.weekday!).value);
    const area = tidyName(cellText(row.getCell(cols.area!).value));
    const names = splitNames(cellText(row.getCell(cols.teacher!).value));
    // İkinci başlık satırı (birleştirilmiş başlıkların devamı)
    if (headerWords.has(fold(dayText)) || headerWords.has(fold(area))) continue;

    if (sup.date !== undefined && sup.name !== undefined) {
      const dateCell = row.getCell(sup.date).value;
      const supName = tidyName(cellText(row.getCell(sup.name).value));
      const rawDate = cellText(dateCell);
      const supHoliday = supName ? detectHolidayText(supName) : null;
      if (rawDate || supName) {
        const date = parseDateCell(dateCell);
        if (date && supHoliday) {
          holidays.push({ row: r, weekday: null, date, name: supHoliday });
        } else if (!date) {
          if (supName) issues.push({ row: r, message: rawDate ? `Tarih anlaşılamadı: "${rawDate}"` : `"${supName}" için tarih yok` });
        } else if (supName.length > 80) {
          issues.push({ row: r, message: 'Müdür yardımcısı adı çok uzun' });
        } else if (supName.length >= 2) {
          supervisors.set(date, { row: r, date, name: supName });
        }
      }
    }

    const parsedDay = dayText ? weekdayOf(dayText) : null;
    if (parsedDay) lastDay = parsedDay;
    const day = parsedDay ?? (dayText ? null : lastDay);
    // Öğretmen yerine tatil yazılmış satır ("29 EKİM CUMHURİYET BAYRAMI", "RESMİ TATİL") hata değil, tatildir
    const holiday = detectHolidayText(cellText(row.getCell(cols.teacher!).value));
    if (holiday) {
      holidays.push({ row: r, weekday: day, date: null, name: holiday });
      continue;
    }
    // Boş bırakılmış nöbet satırı (şablondaki doldurulmamış yer) sessizce atlanır
    if (!names.length) continue;
    if (!day) issues.push({ row: r, message: dayText ? `Gün anlaşılamadı: "${dayText}"` : 'Gün boş' });
    else if (!area) issues.push({ row: r, message: 'Nöbet yeri boş' });
    else for (const name of names) push(r, day, area, name);
  }
  return {
    sheetName: ws.name,
    layout: sup.date !== undefined ? 'monthly' : 'list',
    weekdays: [...new Set(entries.map((e) => e.weekday))].sort(),
    entries,
    supervisors: [...supervisors.values()].sort((x, y) => x.date.localeCompare(y.date)),
    holidays,
    titleText: titleTextOf(ws, header.row),
    issues,
  };
}

/** Başlık satırlarının (tablo başlığından önceki) yazısı ve sayfa adı: ay adını aramak için */
export function titleTextOf(ws: { name: string; getRow: (r: number) => { eachCell: (cb: (cell: { value: unknown }) => void) => void } }, headerRow: number): string {
  const parts = new Set<string>([ws.name]);
  for (let r = 1; r < headerRow; r++) ws.getRow(r).eachCell((cell) => void parts.add(cellText(cell.value as never)));
  return [...parts].filter(Boolean).join(' · ');
}

/**
 * Aylık çizelge (şablon / dışa aktarma). Okulların kullandığı kâğıt düzenidir: üstte başlık ve ay,
 * her gün için birleştirilmiş blok, sağda o günün ay içindeki tarihleri ve nöbetçi müdür yardımcısı.
 * Öğretmen ve nöbet yeri hücrelerinde açılır liste vardır; sayfa yatay A4'e tek sayfa sığar.
 */
export async function buildDutiesWorkbook(opts: {
  schoolName: string;
  teachers: string[];
  areas: string[];
  weekdays: number[];
  year: number;
  month: number;
  /** gün -> o günün nöbetleri (sırasıyla); şablonda boş, nöbet yerleri `areas`tan gelir */
  days?: Map<number, { area: string; teacherName: string }[]>;
  /** YYYY-AA-GG -> müdür yardımcısı */
  supervisors?: Map<string, string>;
}): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Nöbet Çizelgesi', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: { oddHeader: `&C&"-,Bold"&12${opts.schoolName.replace(/&/g, '&&')}`, oddFooter: '&LPanokul&R&D' },
  });
  ws.columns = [
    { key: 'day', width: 16 },
    { key: 'no', width: 6 },
    { key: 'teacher', width: 30 },
    { key: 'area', width: 38 },
    { key: 'date', width: 13 },
    { key: 'sup', width: 26 },
  ];

  const black = { style: 'thin' as const, color: { argb: 'FF000000' } };
  const box = { top: black, left: black, bottom: black, right: black };
  const bold = { name: 'Calibri', size: 11, bold: true };
  const center = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'ÖĞRETMEN NÖBET ÇİZELGESİ';
  ws.getCell('A1').font = { name: 'Calibri', size: 18, bold: true };
  ws.getCell('A1').alignment = center;
  ws.getRow(1).height = 31.5;

  ws.mergeCells('A2:F2');
  ws.getCell('A2').value = `AİT OLDUĞU AY: ${MONTHS[opts.month]} ${opts.year}`;
  ws.getCell('A2').font = bold;
  ws.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells('A3:A4');
  ws.getCell('A3').value = 'GÜNLER';
  ws.mergeCells('B3:C4');
  ws.getCell('B3').value = 'NÖBETÇİ ÖĞRETMENİN\nADI VE SOYADI';
  ws.mergeCells('D3:D4');
  ws.getCell('D3').value = 'NÖBET YERİ';
  ws.mergeCells('E3:F3');
  ws.getCell('E3').value = 'NÖBETÇİ MÜDÜR YARD. VE\nNÖBET GÜNLERİ';
  ws.getCell('E4').value = 'TARİH';
  ws.getCell('F4').value = 'NÖBETÇİ MÜDÜR YARD.';
  ws.getRow(3).height = 32.25;
  ws.getRow(4).height = 18;

  const areas = opts.areas.length ? opts.areas : DEFAULT_DUTY_AREAS;
  let r = 5;
  for (const day of opts.weekdays) {
    const slots = opts.days?.get(day)?.length ? opts.days.get(day)! : areas.map((area) => ({ area, teacherName: '' }));
    const dates = monthDates(opts.year, opts.month, day);
    const height = Math.max(slots.length, dates.length, 1);
    const first = r;
    for (let i = 0; i < height; i++, r++) {
      const row = ws.getRow(r);
      const slot = slots[i];
      if (slot) {
        row.getCell(2).value = i + 1;
        row.getCell(3).value = slot.teacherName || null;
        row.getCell(4).value = slot.area;
      }
      const date = dates[i];
      if (date) {
        row.getCell(5).value = trDate(date);
        row.getCell(6).value = opts.supervisors?.get(date) ?? null;
      }
      row.height = 20;
    }
    if (r - 1 > first) ws.mergeCells(first, 1, r - 1, 1);
    ws.getCell(first, 1).value = WEEKDAY_NAMES[day]!.toLocaleUpperCase('tr-TR');
  }
  const last = r - 1;

  for (let row = 2; row <= last; row++) {
    for (let c = 1; c <= 6; c++) {
      const cell = ws.getCell(row, c);
      cell.border = box;
      if (row <= 4) {
        cell.font = bold;
        if (row > 2) cell.alignment = center;
      } else if (c === 1) {
        cell.font = bold;
        cell.alignment = center;
      } else if (c === 2 || c === 5) {
        cell.font = { name: 'Calibri', size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.font = { name: 'Calibri', size: 11 };
        cell.alignment = { vertical: 'middle', wrapText: true };
      }
    }
  }

  const [teacherRange, areaRange] = addListsSheet(wb, [opts.teachers, areas]);
  validations(ws).add(
    `C5:C${last}`,
    listRule(teacherRange!, 'Öğretmen', {
      allowNew: true,
      error: "Bu isim kadroda yok. İsimler Öğretmen Kadrosu'ndaki gibi yazılmalı; birden fazla öğretmeni virgülle ayırabilirsiniz.",
    }),
  );
  validations(ws).add(`D5:D${last}`, listRule(areaRange!, 'Nöbet yeri', { allowNew: true }));

  addHelpSheet(
    wb,
    `${opts.schoolName} · Nöbet çizelgesi`,
    [
      '1. Her günün bloğunda nöbetçi öğretmeni ve nöbet yerini yazın. Hücreye tıklayınca kadro ve okulunuzun nöbet yerleri listelenir.',
      '2. Yeni bir nöbet yeri yazabilirsiniz; içe aktarırken okulun nöbet yerlerine eklenir.',
      "3. Öğretmen isimleri Öğretmen Kadrosu'ndaki gibi olmalı; kadroda olmayan isimler atlanır ve size bildirilir.",
      '4. Sağdaki bölüme tarih ve o günün nöbetçi müdür yardımcısını yazın; pano o tarihte gösterir.',
      '5. Bir güne satır eklemek için bloğun içine satır ekleyin; gün hücresi birleştirilmiş kalabilir.',
      "6. İçe aktarırken \"değiştir\" seçilirse dosyadaki günlerin eski nöbetleri silinip bu çizelge yazılır.",
      '7. Sayfa yatay A4\'e tek sayfa sığacak şekilde ayarlıdır; yazdırıp panoya asabilirsiniz.',
    ],
    {
      header: ['GÜNLER', 'S.No', 'Öğretmen', 'Nöbet Yeri', 'Tarih', 'Nöbetçi Müdür Yard.'],
      row: ['PAZARTESİ', '1', 'Ayşe Demir', 'Ön Bahçe', '07.09.2026', 'Ali Kaya'],
    },
  );
  return toBuffer(wb);
}

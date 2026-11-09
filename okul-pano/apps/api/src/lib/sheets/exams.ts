import { EXAM_KINDS, parseClassName, type ExamKind } from '@okulpano/shared';
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
  newWorkbook,
  parseDateCell,
  pickSheet,
  styleHeader,
  TEMPLATE_ROWS,
  toBuffer,
  validations,
  type SheetIssue,
} from '../excel.ts';

/*
 * Sınav takvimi Excel şablonu: her satır bir sınıfın bir sınavı. Saat yazılmaz; "Ders Saati" sütununa
 * ders numarası (3) yazılır, saat o günkü zilden hesaplanır. Öğretmen de yazılmaz: ders programından bulunur.
 */

export const MAX_EXAM_ROWS = 2000;

const ALIASES = {
  date: ['tarih', 'sinav tarihi', 'gun', 'tarihi'],
  period: ['ders saati', 'ders', 'saat', 'kacinci ders', 'ders no', 'ders saati no'],
  className: ['sinif', 'sinifi', 'sinif sube', 'sube'],
  subject: ['ders adi', 'dersin adi', 'ders', 'sinav dersi'],
  kind: ['tur', 'turu', 'sinav turu', 'sinav tipi', 'tip'],
  proctor: ['gozetmen', 'gozetmen istege bagli', 'gozetmen ogretmen', 'gorevli ogretmen'],
  note: ['not', 'aciklama', 'notlar'],
} as const;
type Key = keyof typeof ALIASES;

export interface ParsedExamRow {
  row: number;
  date: string;
  periodNo: number;
  className: string;
  subject: string;
  kind: ExamKind;
  kindGuessed: boolean;
  proctorName: string | null;
  note: string | null;
}

/** "Ders" başlığı hem ders saati hem ders adı olabilir: ilk "Ders" ders saatine, ikincisi ders adına gider */
function columns(ws: ExcelJS.Worksheet) {
  const header = findHeaderRow(ws, ALIASES, (c) => c.date !== undefined && c.className !== undefined && (c.subject !== undefined || c.period !== undefined));
  if (!header) return null;
  const row = ws.getRow(header.row);
  const cols: Partial<Record<Key, number>> = {};
  row.eachCell((cell, col) => {
    const text = fold(cellText(cell.value));
    if (!text) return;
    const exact = (Object.keys(ALIASES) as Key[]).filter((k) => (ALIASES[k] as readonly string[]).includes(text));
    for (const k of exact) {
      if (cols[k] !== undefined) continue;
      // "Ders" yalnız başına: önce ders saati, sonra ders adı
      if (text === 'ders' && k === 'subject' && cols.period === undefined) continue;
      if (text === 'ders' && k === 'period' && cols.period !== undefined) continue;
      cols[k] = col;
      break;
    }
  });
  return { row: header.row, cols };
}

const KIND_BY_FOLD: Record<string, ExamKind> = {
  yazili: 'written',
  'yazili sinav': 'written',
  uygulama: 'practical',
  uygulamali: 'practical',
  'uygulama sinavi': 'practical',
  ortak: 'common',
  'ortak sinav': 'common',
  'ortak yazili': 'common',
};

export function parseKind(text: string): { kind: ExamKind; guessed: boolean } {
  const f = fold(text);
  if (!f) return { kind: 'written', guessed: false };
  const k = KIND_BY_FOLD[f] ?? (f.startsWith('ortak') ? 'common' : f.startsWith('uygula') ? 'practical' : f.startsWith('yaz') ? 'written' : null);
  return k ? { kind: k, guessed: false } : { kind: 'written', guessed: true };
}

export async function parseExamsWorkbook(data: Buffer): Promise<{ rows: ParsedExamRow[]; issues: SheetIssue[] }> {
  const wb = await loadWorkbook(data);
  const ws = pickSheet(wb, 'sinav', (s) => Boolean(columns(s)));
  const header = columns(ws);
  if (!header || header.cols.subject === undefined || header.cols.period === undefined) {
    throw badRequest('Başlık satırı bulunamadı. Şablondaki "Tarih", "Ders Saati", "Sınıf" ve "Ders" başlıklarını kullanın.');
  }
  const { cols } = header;
  const text = (r: ExcelJS.Row, key: Key) => (cols[key] !== undefined ? cellText(r.getCell(cols[key]!).value) : '');
  const rows: ParsedExamRow[] = [];
  const issues: SheetIssue[] = [];
  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawDate = cols.date !== undefined ? row.getCell(cols.date).value : null;
    const periodText = text(row, 'period');
    const className = text(row, 'className');
    const subject = text(row, 'subject').replace(/\s+/g, ' ');
    if (!cellText(rawDate) && !periodText && !className && !subject) continue;
    // Şablondaki açıklama satırı (GG.AA.YYYY …) atlanır
    if (/^gg/i.test(cellText(rawDate))) continue;
    const date = parseDateCell(rawDate);
    const periodNo = Number(/^(\d{1,2})/.exec(periodText)?.[1] ?? NaN);
    const { kind, guessed } = parseKind(text(row, 'kind'));
    const label = [className, subject].filter(Boolean).join(' ') || `${r}. satır`;
    if (!cellText(rawDate)) issues.push({ row: r, message: `${label}: tarih boş` });
    else if (!date) issues.push({ row: r, message: `${label}: tarih okunamadı ("${cellText(rawDate)}"), GG.AA.YYYY biçiminde yazın` });
    else if (!Number.isInteger(periodNo) || periodNo < 1 || periodNo > 16) issues.push({ row: r, message: `${label}: ders saati 1 ile 16 arasında bir sayı olmalı ("${periodText}")` });
    else if (!className) issues.push({ row: r, message: `${label}: sınıf boş` });
    else if (!subject) issues.push({ row: r, message: `${className}: ders adı boş` });
    else if (subject.length > 80) issues.push({ row: r, message: `${className}: ders adı 80 karakterden uzun` });
    else
      rows.push({
        row: r,
        date,
        periodNo,
        className,
        subject,
        kind,
        kindGuessed: guessed,
        proctorName: text(row, 'proctor') || null,
        note: text(row, 'note').slice(0, 120) || null,
      });
    if (rows.length > MAX_EXAM_ROWS) throw badRequest(`Tek seferde en fazla ${MAX_EXAM_ROWS} sınav aktarılabilir.`);
  }
  return { rows, issues };
}

/** Şablon: Sınıf, Ders, Tür ve Gözetmen sütunları okulun kendi listelerinden açılır menü */
export async function buildExamsWorkbook(opts: { schoolName: string; classes: string[]; subjects: string[]; teachers: string[] }): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Sınavlar', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Tarih', key: 'date', width: 14, style: { numFmt: 'dd.mm.yyyy', alignment: { horizontal: 'left' } } },
    { header: 'Ders Saati', key: 'period', width: 11 },
    { header: 'Sınıf', key: 'className', width: 10 },
    { header: 'Ders Adı', key: 'subject', width: 30 },
    { header: 'Tür', key: 'kind', width: 12 },
    { header: 'Gözetmen (isteğe bağlı)', key: 'proctor', width: 26 },
    { header: 'Not', key: 'note', width: 28 },
  ];
  styleHeader(ws);
  // Sınıf listesine kademeler de eklenir ("9. sınıflar"): o kademenin bütün şubeleri için ayrı kayıt açılır
  const levels = [...new Set(opts.classes.map((n) => parseClassName(n)).filter((p) => p !== null).map((p) => `${p.program ? `${p.program} ` : ''}${p.grade}. sınıflar`))];
  const [classRange, subjectRange, kindRange, teacherRange] = addListsSheet(wb, [[...levels, ...opts.classes], opts.subjects, Object.values(EXAM_KINDS), opts.teachers]);
  const last = TEMPLATE_ROWS;
  validations(ws).add(`A2:A${last}`, {
    type: 'date',
    operator: 'greaterThan',
    allowBlank: true,
    formulae: [new Date(Date.UTC(2020, 0, 1))],
    showInputMessage: true,
    promptTitle: 'Sınav tarihi',
    prompt: 'GG.AA.YYYY biçiminde yazın (ör. 18.11.2026).',
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Tarih geçersiz',
    error: 'Tarihi GG.AA.YYYY biçiminde yazın.',
  });
  validations(ws).add(`B2:B${last}`, {
    type: 'whole',
    operator: 'between',
    allowBlank: true,
    formulae: [1, 16],
    showInputMessage: true,
    promptTitle: 'Ders saati',
    prompt: 'Kaçıncı ders? (ör. 3). Saat yazmayın; saat zil çizelgesinden hesaplanır.',
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Ders saati',
    error: '1 ile 16 arasında bir sayı yazın.',
  });
  validations(ws).add(`C2:C${last}`, listRule(classRange!, 'Sınıf', { allowNew: true, error: 'Listede yok. Birden çok şube için "9-A, 9-B" gibi virgülle yazabilirsiniz.' }));
  validations(ws).add(`D2:D${last}`, listRule(subjectRange!, 'Ders', { allowNew: true, error: 'Bu ders ders programında yok. Yine de yazabilirsiniz; ama dersin öğretmenine bildirim gitmez.' }));
  validations(ws).add(`E2:E${last}`, listRule(kindRange!, 'Tür', { allowNew: false }));
  validations(ws).add(`F2:F${last}`, listRule(teacherRange!, 'Gözetmen', { allowNew: false }));

  addHelpSheet(
    wb,
    `${opts.schoolName} · Sınav takvimi`,
    [
      '1. "Sınavlar" sayfasında her satıra bir sınıfın bir sınavını yazın. Tarih, Ders Saati, Sınıf ve Ders Adı zorunludur.',
      '2. Ders Saati: kaçıncı ders olduğunu yazın (ör. 3). Saat yazmayın; sınavın saati o sınıfın o günkü zilinden hesaplanır.',
      '3. Aynı sınav bir kademenin bütün şubelerinde yapılacaksa Sınıf sütununda "9. sınıflar" gibi kademeyi seçin; her şube için ayrı kayıt açılır. Yalnızca bazı şubelerse "9-A, 9-B" yazın ya da her şubeye ayrı satır yazın.',
      '4. Gözetmen boş bırakılırsa, o saatte o sınıfta dersi olan öğretmen gözetmen sayılır. Farklı biri gözetmen olacaksa listeden seçin.',
      '5. Sınavdan önceki teneffüsün başında (sınav 1. dersteyse ilk zilden 15 dakika önce) gözetmene ve dersin öğretmenine bildirim gider.',
      '6. Aynı tarih, ders saati ve sınıf için ikinci kez yükleme yapılırsa eski kayıt güncellenir.',
    ],
    { header: ['Tarih', 'Ders Saati', 'Sınıf', 'Ders Adı', 'Tür', 'Gözetmen (isteğe bağlı)', 'Not'], row: ['18.11.2026', '3', opts.classes[0] ?? '10-A', opts.subjects[0] ?? 'Matematik', 'Ortak', '', ''] },
  );
  return toBuffer(wb);
}

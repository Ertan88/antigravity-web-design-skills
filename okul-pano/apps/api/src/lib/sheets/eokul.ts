import { normalizeName, tidyName } from '@okulpano/shared';

/*
 * e-Okul "haftalık ders programı çizelgesi" PDF'i: her sayfa bir sınıfın programıdır. Başlıkta
 * "AMP - 11. Sınıf / A Şubesi  MAKİNE VE TASARIM TEKNOLOJİSİ ALANI (Makine Bakım Onarım Dalı)" satırı, tabloda
 * günler sütun, ders saatleri satırdır. Hücrede ders adı kalın, öğretmen(ler) normal yazılır:
 * - bölünmüş sınıf: "ÇİĞDEM YILMAZ, YASİN CEPECİ" (iki öğretmen)
 * - seçmeli: "SEÇMELİ DERS" altında "MEVLÜT AKBAŞ - SEÇMELİ PEYGAMBERİMİZİN HAYATI" (birden çoksa virgülle)
 * Aynı şubenin farklı dalları (ya da akademik destek grubu) ayrı sayfadır; tek sınıfta birleştirilir, farklı
 * dersler dal adıyla ayrılır. İkinci dal sayfasında çoğu zaman yalnızca o dalın seçmelileri vardır (başlıksız). Programı aynı adı taşıyan (ATP 9-A, AMP 9-A) sınıflar program önekiyle adlandırılır.
 * Ayrıştırma okula özel hiçbir şey içermez.
 */

/** PDF'ten okunan metin parçası (PDF koordinatları: y yukarı doğru artar) */
export interface PdfItem {
  str: string;
  x: number;
  y: number;
  w: number;
  bold: boolean;
}

export interface EokulEntry {
  weekday: number;
  periodNo: number;
  subject: string;
  /** e-Okul'daki yazımıyla (büyük harf) öğretmen adları */
  teachers: string[];
  /** Dal ya da grup adı (aynı saatte farklı dersler varsa) */
  group: string | null;
}

export interface EokulPage {
  page: number;
  program: string;
  grade: number;
  /** "9. Sınıf-Hafif Zihinsel" gibi sınıf tanımı */
  gradeLabel: string;
  section: string;
  field: string;
  /** Dal (alan adının sonundaki parantez) */
  branch: string | null;
  /** Ders saati numarası → "08:00-08:40" */
  times: Record<number, string>;
  entries: Omit<EokulEntry, 'group'>[];
}

const DAYS = ['PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ', 'PAZAR'];
const fold = (s: string) => s.toLocaleUpperCase('tr-TR').replace(/Ş/g, 'S').replace(/[^A-ZÇĞİÖÜ]/g, '');

/** Aynı satırdaki parçaları soldan sağa birleştirir; aradaki boşluk büyükse kelime arası sayılır */
function joinLine(items: PdfItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  let end = -Infinity;
  for (const it of sorted) {
    if (out && it.x - end > 1.2 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
    out += it.str;
    end = it.x + it.w;
  }
  return tidyName(out);
}

/** Parçaları satırlara ayırır (yukarıdan aşağıya) */
function lines(items: PdfItem[]): { y: number; text: string; bold: boolean }[] {
  const rows: { y: number; items: PdfItem[] }[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    if (!it.str.trim() && !rows.length) continue;
    const row = rows.find((r) => Math.abs(r.y - it.y) < 2.5);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows
    .map((r) => {
      const visible = r.items.filter((i) => i.str.trim());
      const boldChars = visible.filter((i) => i.bold).reduce((n, i) => n + i.str.length, 0);
      const allChars = visible.reduce((n, i) => n + i.str.length, 0);
      return { y: r.y, text: joinLine(r.items), bold: allChars > 0 && boldChars * 2 >= allChars };
    })
    .filter((l) => l.text);
}

const HEADER = /^([A-ZÇĞİÖŞÜ]{2,})\s*-\s*((\d{1,2})\.?\s*[^/]*?)\s*\/\s*(\S+)\s+Şubesi\s+(.+)$/u;

/** Bir sayfayı ayrıştırır; ders programı sayfası değilse null */
export function parseEokulPage(items: PdfItem[], page: number): EokulPage | null {
  const all = lines(items);
  const head = all.map((l) => l.text.match(HEADER)).find(Boolean);
  if (!head) return null;
  const [, program, gradeLabel, gradeNo, section, fieldRaw] = head;
  const branchMatch = fieldRaw!.match(/\(([^()]*)\)\s*$/);
  const field = tidyName(branchMatch ? fieldRaw!.slice(0, branchMatch.index) : fieldRaw!);

  // Gün başlıkları: sütunların ortası
  const dayCols: { weekday: number; x: number; y: number }[] = [];
  for (const l of all) {
    const rowItems = items.filter((i) => Math.abs(i.y - l.y) < 2.5 && i.str.trim());
    const words = joinLine(rowItems)
      .split(' ')
      .map((w) => fold(w));
    if (!words.includes('PAZARTESI') && !words.includes('SALI')) continue;
    // Başlık satırındaki her gün adının yatay ortası: aradaki boşluğa göre parçalar kümelenir
    const sorted = rowItems.sort((a, b) => a.x - b.x);
    const groups: PdfItem[][] = [];
    for (const it of sorted) {
      const last = groups[groups.length - 1];
      const prev = last?.[last.length - 1];
      if (last && prev && it.x - (prev.x + prev.w) < 6) last.push(it);
      else groups.push([it]);
    }
    for (const g of groups) {
      const name = fold(g.map((i) => i.str).join(''));
      const weekday = DAYS.findIndex((d) => fold(d) === name) + 1;
      if (weekday > 0) dayCols.push({ weekday, x: (g[0]!.x + g[g.length - 1]!.x + g[g.length - 1]!.w) / 2, y: l.y });
    }
    if (dayCols.length) break;
  }
  if (dayCols.length < 2) return null;
  dayCols.sort((a, b) => a.x - b.x);
  const headerY = dayCols[0]!.y;
  const colWidth = dayCols[1]!.x - dayCols[0]!.x;
  const leftEdge = dayCols[0]!.x - colWidth / 2;

  // Ders saatleri: soldaki "08:00-08:40" saatleri ve yanındaki sıra numarası
  const timeItems = items.filter((i) => /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(i.str.trim()) && i.x < leftEdge && i.y < headerY);
  const periods = timeItems
    .map((t) => {
      const no = items.find((i) => i.x < t.x && Math.abs(i.y - t.y) < 2.5 && /^\d{1,2}$/.test(i.str.trim()));
      return { no: no ? Number(no.str.trim()) : 0, y: t.y, time: t.str.replace(/\s/g, '') };
    })
    .sort((a, b) => b.y - a.y);
  periods.forEach((p, i) => {
    if (!p.no) p.no = i + 1;
  });
  if (!periods.length) return null;
  const step = periods.length > 1 ? periods[0]!.y - periods[1]!.y : 30;

  // Hücre içeriği: satırın saatinin biraz üstünden bir sonraki satırın saatinin biraz üstüne kadar
  const margin = step * 0.3;
  const body = items.filter((i) => i.x + i.w / 2 > leftEdge && i.y < headerY - 2);
  const entries: EokulPage['entries'] = [];
  periods.forEach((p, idx) => {
    const top = p.y + margin;
    const bottom = idx + 1 < periods.length ? periods[idx + 1]!.y + margin : p.y - step + margin;
    for (const col of dayCols) {
      const cell = body.filter((i) => i.y <= top && i.y > bottom && Math.abs(i.x + i.w / 2 - col.x) < colWidth / 2);
      const cellLines = lines(cell);
      let subjectRaw = cellLines.filter((l) => l.bold).map((l) => l.text).join(' ');
      const teacherRaw = cellLines.filter((l) => !l.bold).map((l) => l.text).join(' ');
      // Dal sayfalarında yalnızca o dalın seçmelisi "AD SOYAD - SEÇMELİ …" olarak, başlıksız basılır
      if (!subjectRaw && / - SEÇMEL[İI] /i.test(teacherRaw)) subjectRaw = 'SEÇMELİ DERS';
      if (!subjectRaw) continue;
      for (const e of parseCell(subjectRaw, teacherRaw)) entries.push({ weekday: col.weekday, periodNo: p.no, ...e });
    }
  });

  return {
    page,
    program: program!,
    grade: Number(gradeNo),
    gradeLabel: tidyName(gradeLabel!),
    section: section!,
    field,
    branch: branchMatch ? tidyName(branchMatch[1]!) : null,
    times: Object.fromEntries(periods.map((p) => [p.no, p.time])),
    entries,
  };
}

/** Hücre: ders adı ve öğretmenler; seçmeli derste her öğretmenin kendi seçmeli dersi */
export function parseCell(subjectRaw: string, teacherRaw: string): { subject: string; teachers: string[] }[] {
  const subject = tidyName(subjectRaw);
  const teacherText = tidyName(teacherRaw);
  if (/^SEÇMEL[İI] DERS/i.test(subject) && / - /.test(teacherText)) {
    // "AD SOYAD - SEÇMELİ DERS ADI, AD SOYAD - SEÇMELİ DERS ADI"
    const parts = teacherText.split(/,\s*(?=[^,]*? - )/);
    return parts.map((part) => {
      const [name, ...rest] = part.split(' - ');
      const elective = rest.join(' - ').replace(/^SEÇMEL[İI]\s+/i, '');
      return { subject: `${titleCase(elective)} (Seçmeli)`, teachers: [tidyName(name!)] };
    });
  }
  const teachers = teacherText
    ? teacherText
        .split(',')
        .map((t) => tidyName(t))
        .filter(Boolean)
    : [];
  return [{ subject: titleCase(subject), teachers }];
}

const SMALL = new Set(['ve', 'ile', 'veya', 'ya', 'da', 'de', 'ki', 'için']);

/** "DİN KÜLTÜRÜ VE AHLÂK BİLGİSİ" → "Din Kültürü ve Ahlâk Bilgisi"; parantez içi kısaltmalar (CNC) korunur */
export function titleCase(text: string): string {
  return tidyName(text)
    .split(' ')
    .map((word, i) => {
      if (/^\(.*\)$/.test(word) && word.length <= 12) return word;
      return word
        .split(/([/-])/)
        .map((part) => {
          if (part === '/' || part === '-' || !part) return part;
          const lower = part.toLocaleLowerCase('tr-TR');
          if (i > 0 && SMALL.has(lower)) return lower;
          if (/^[IVX]+$/.test(part) && part.length <= 4) return part;
          // Kısaltmalar büyük kalır: "T.C.", sesli harfsiz "CNC"
          if (/\./.test(part) || (part.length >= 2 && !/[AEIİOÖUÜaeıioöuü]/.test(part))) return part.toLocaleUpperCase('tr-TR');
          return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
        })
        .join('');
    })
    .join(' ');
}

/** Öğretmen adı kadro biçiminde: adlar baş harfi büyük, soyadı büyük ("Çiğdem YILMAZ") */
export function teacherDisplayName(name: string): string {
  const parts = tidyName(name).split(' ');
  if (parts.length < 2) return titleCase(name);
  const surname = parts.pop()!.toLocaleUpperCase('tr-TR');
  return [...parts.map((p) => titleCase(p)), surname].join(' ');
}

export interface EokulClass {
  /** Sistemdeki adı, e-Okul'daki program önekiyle: "AMP 9-A" */
  name: string;
  program: string;
  grade: number;
  section: string;
  /** Birden çok sayfa (dal) birleştiyse dal adları */
  groups: string[];
  field: string;
  entries: EokulEntry[];
}

/**
 * Sayfaları sınıflara çevirir: aynı program + sınıf + şube sayfaları tek sınıf olur. Bütün sayfalarda aynı olan
 * ders bir kez (grupsuz), farklı olanlar dal adıyla yazılır.
 */
export function buildClasses(pages: EokulPage[]): EokulClass[] {
  const byKey = new Map<string, EokulPage[]>();
  for (const p of pages) {
    const key = `${p.program}|${p.grade}|${p.section}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  const cellKey = (e: { weekday: number; periodNo: number }) => `${e.weekday}-${e.periodNo}`;
  const sig = (list: { subject: string; teachers: string[] }[]) =>
    list
      .map((e) => `${e.subject}|${e.teachers.join(',')}`)
      .sort()
      .join(';');

  const out: EokulClass[] = [];
  for (const group of byKey.values()) {
    const first = group[0]!;
    // e-Okul'daki gibi program önekiyle: "AMP 9-B", "ATP 9-A"
    const name = `${first.program} ${first.grade}-${first.section}`;
    // Grup adı: dal ("… Dalı" kısaltılır); dallar aynıysa sınıf tanımı ("Akademik Destek (Sayısal)")
    const descriptor = (p: EokulPage) => p.gradeLabel.replace(/^\d+\.?\s*(Sınıf)?[-\s]*/i, '');
    const branchOf = (p: EokulPage) => (p.branch ? p.branch.replace(/\s+Dalı$/i, '') : null);
    const branches = group.map(branchOf);
    const label = (p: EokulPage) => {
      const b = branchOf(p);
      const unique = b && branches.filter((x) => x === b).length === 1;
      return (unique ? b : descriptor(p) || b || p.field) ?? p.field;
    };
    const entries: EokulEntry[] = [];
    if (group.length === 1) {
      entries.push(...first.entries.map((e) => ({ ...e, group: null })));
    } else {
      // Bir saatte yalnızca bir sayfada ders varsa (dal sayfası o saati boş bırakmışsa) ders bütün sınıfındır;
      // sayfalar aynı saatte farklı ders gösteriyorsa her biri kendi dal adıyla yazılır
      const cells = new Set(group.flatMap((p) => p.entries.map(cellKey)));
      for (const key of cells) {
        const filled = group.map((p, i) => ({ i, list: p.entries.filter((e) => cellKey(e) === key) })).filter((x) => x.list.length);
        const same = filled.every((x) => sig(x.list) === sig(filled[0]!.list));
        if (same) entries.push(...filled[0]!.list.map((e) => ({ ...e, group: null })));
        else for (const x of filled) entries.push(...x.list.map((e) => ({ ...e, group: label(group[x.i]!) })));
      }
    }
    out.push({
      name,
      program: first.program,
      grade: first.grade,
      section: first.section,
      groups: group.length > 1 ? group.map(label) : [],
      field: first.field,
      entries: entries.sort((a, b) => a.weekday - b.weekday || a.periodNo - b.periodNo),
    });
  }
  return out.sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section, 'tr') || a.program.localeCompare(b.program, 'tr'));
}

/** PDF'i sayfa sayfa okur (pdfjs; yalnızca metin) */
export async function readPdfPages(data: Uint8Array): Promise<PdfItem[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true });
  const doc = await task.promise;
  const pages: PdfItem[][] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      // Yazı tipi adlarını (",Bold") okumak için sayfa işlemleri yüklenir
      await page.getOperatorList();
      const content = await page.getTextContent();
      const bold = new Map<string, boolean>();
      const isBold = (fontName: string) => {
        if (!bold.has(fontName)) {
          let name = '';
          try {
            name = String((page.commonObjs.get(fontName) as { name?: string } | undefined)?.name ?? '');
          } catch {
            name = '';
          }
          bold.set(fontName, /bold|black|heavy/i.test(name));
        }
        return bold.get(fontName)!;
      };
      pages.push(
        content.items
          .filter((i): i is typeof i & { str: string; transform: number[]; width: number; fontName: string } => 'str' in i)
          .map((i) => ({ str: i.str, x: i.transform[4]!, y: i.transform[5]!, w: i.width, bold: isBold(i.fontName) })),
      );
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

/** Kadrodaki öğretmenle eşleştirme anahtarı (büyük/küçük harf ve boşluk farkı yok sayılır) */
export const teacherKey = (name: string) => normalizeName(name);

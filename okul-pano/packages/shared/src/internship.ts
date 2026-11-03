import { z } from 'zod';
import { isoWeekday } from './schoolDay.ts';

/*
 * İşletmelerde mesleki eğitim devam çizelgesi. Her gün iki bölümdür: öğleden önce (am) ve öğleden sonra (pm); her
 * bölüm yarım gün sayılır. Kodların çoğu kendiliğinden gelir, öğretmen yalnızca istisnaları işaretler:
 *
 *   O  okulda: sınıfın o hafta gününde ders programında dersi var (ders programından)
 *   X  işletmede, devam etti: okul günü ve tatil olmayan, bugüne kadarki iş günleri
 *   T  tatil: resmî / dinî tatiller ve okulun takvimindeki tatiller (arifede öğleden sonra); öğretmen de
 *      işaretleyebilir (bütün öğrencilere uygulanır)
 *   K  işletme kapalı: o işletmedeki bütün öğrencilere uygulanır
 *   D  devamsız (özürsüz)
 *   R  raporlu (özürlü)
 *
 * Hiçbir gün ya da saat sabit değildir: okul günleri ders programından, tatiller okulun takviminden gelir.
 */

export const INTERN_HALVES = ['am', 'pm'] as const;
export type InternHalf = (typeof INTERN_HALVES)[number];
export const INTERN_HALF_LABELS: Record<InternHalf, string> = { am: 'Öğleden önce', pm: 'Öğleden sonra' };

/** Öğretmenin girdiği kodlar (veritabanında saklanır) */
export const INTERN_MARKS = ['D', 'R', 'T', 'K'] as const;
export type InternMark = (typeof INTERN_MARKS)[number];

/**
 * Hücre kodu: saklanan kodlar ile kendiliğinden gelenler. 'TA' takvimden gelen (değiştirilemez) tatil, 'T' öğretmenin
 * işaretlediği tatil; ikisi de "T" yazılır. 'W' hafta sonu, '' henüz gelmemiş gün.
 */
export type InternCell = 'O' | 'X' | 'D' | 'R' | 'T' | 'TA' | 'K' | 'W' | '';

export const INTERN_LEGEND: { code: InternCell; letter: string; text: string }[] = [
  { code: 'O', letter: 'O', text: 'Okulda (ders programından)' },
  { code: 'X', letter: 'X', text: 'İşletmede, devam etti' },
  { code: 'D', letter: 'D', text: 'Devamsız (özürsüz)' },
  { code: 'R', letter: 'R', text: 'Raporlu (özürlü)' },
  { code: 'TA', letter: 'T', text: 'Resmî / dinî tatil (takvimden)' },
  { code: 'T', letter: 'T', text: 'Tatil (öğretmen işaretledi, bütün öğrenciler)' },
  { code: 'K', letter: 'K', text: 'İşletme kapalı (işletmedeki bütün öğrenciler)' },
];

export const internLetter = (c: InternCell) => (c === 'TA' ? 'T' : c === 'W' ? '' : c);

/** Öğretmenin değiştirebileceği bölüm: işletme günü (okul günü, takvim tatili, hafta sonu ve gelecek değil) */
export const internEditable = (c: InternCell) => c === 'X' || c === 'D' || c === 'R' || c === 'T' || c === 'K';

export interface InternDay {
  date: string;
  weekday: number;
  /** Takvimden tam gün tatil */
  holiday: string | null;
  /** Arife: öğleden sonra tatil */
  halfDay: string | null;
}

/** Ayın günleri (YYYY-AA) ve takvimdeki tatilleri */
export function internMonthDays(month: string, holidays: readonly { date: string; name: string }[], halfDays: readonly { date: string; name: string }[]): InternDay[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const full = new Map(holidays.map((h) => [h.date, h.name]));
  const half = new Map(halfDays.map((h) => [h.date, h.name]));
  return Array.from({ length: n }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const holiday = full.get(date) ?? null;
    return { date, weekday: isoWeekday(date), holiday, halfDay: holiday ? null : (half.get(date) ?? null) };
  });
}

export const internKey = (date: string, half: InternHalf) => `${date}|${half}`;

/**
 * Ders programındaki işletme dersi (MEB ders adı: "İşletmelerde Mesleki Eğitim", eski adıyla "İşletmelerde Beceri
 * Eğitimi"). e-Okul programında işletme günleri bu dersle doldurulur; bu saatler okul günü sayılmaz.
 */
export function isInternshipSubject(subject: string): boolean {
  const s = subject.toLocaleLowerCase('tr-TR');
  return /işletme(lerde|de)\s+(mesleki|beceri)\s+eğitim/.test(s);
}

/** Bir sınıfın okulda olduğu bölümler: hafta günü -> [öğleden önce, öğleden sonra] */
export type SchoolHalves = ReadonlyMap<number, readonly [boolean, boolean]>;

/**
 * Sınıfın ders programından okul günleri: işletme dersi dışında dersi olan bölümler okulda sayılır. Günün ders
 * saatleri ikiye bölünür (ilk yarısı öğleden önce); yalnızca işletme dersi olan ya da hiç dersi olmayan gün işletme günüdür.
 */
export function schoolHalvesFromTimetable(entries: readonly { weekday: number; periodNo: number; subject: string }[]): Map<number, [boolean, boolean]> {
  const byDay = new Map<number, { periodNo: number; subject: string }[]>();
  for (const e of entries) byDay.set(e.weekday, [...(byDay.get(e.weekday) ?? []), e]);
  const out = new Map<number, [boolean, boolean]>();
  for (const [weekday, list] of byDay) {
    const last = Math.max(...list.map((e) => e.periodNo));
    const split = Math.ceil(last / 2);
    const school = list.filter((e) => !isInternshipSubject(e.subject));
    out.set(weekday, [school.some((e) => e.periodNo <= split), school.some((e) => e.periodNo > split)]);
  }
  return out;
}

/** Bir öğrencinin ay boyunca hücreleri: her gün [öğleden önce, öğleden sonra] */
export function internCells(
  days: readonly InternDay[],
  opts: { school: SchoolHalves; marks: ReadonlyMap<string, InternMark>; today: string },
): [InternCell, InternCell][] {
  return days.map((d) =>
    INTERN_HALVES.map((half, i): InternCell => {
      if (d.weekday >= 6) return 'W';
      if (d.holiday || (d.halfDay && half === 'pm')) return 'TA';
      if (opts.school.get(d.weekday)?.[i]) return 'O';
      const mark = opts.marks.get(internKey(d.date, half));
      if (mark) return mark;
      return d.date <= opts.today ? 'X' : '';
    }) as [InternCell, InternCell],
  );
}

export interface InternTotals {
  /** Özürlü devamsızlık (R), gün */
  excused: number;
  /** Özürsüz devamsızlık (D), gün */
  unexcused: number;
  school: number;
  business: number;
  holiday: number;
  closed: number;
}

export function internTotals(cells: readonly (readonly InternCell[])[]): InternTotals {
  const t: InternTotals = { excused: 0, unexcused: 0, school: 0, business: 0, holiday: 0, closed: 0 };
  for (const day of cells)
    for (const c of day) {
      if (c === 'R') t.excused += 0.5;
      else if (c === 'D') t.unexcused += 0.5;
      else if (c === 'O') t.school += 0.5;
      else if (c === 'X') t.business += 0.5;
      else if (c === 'T' || c === 'TA') t.holiday += 0.5;
      else if (c === 'K') t.closed += 0.5;
    }
  return t;
}

/** 1,5 gibi (yarım gün virgülle) */
export const formatDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/** Bildirim metni: "22 Ekim öğleden önce" / "22 Ekim tam gün" */
export function internHalfText(halves: readonly InternHalf[]): string {
  return halves.length >= 2 ? 'tam gün' : halves[0] === 'am' ? 'öğleden önce' : 'öğleden sonra';
}

/* ---------- Şemalar ---------- */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const businessSchema = z.object({
  name: z.string().trim().min(1, 'İşletme adı gerekli').max(120),
  phone: optionalText(30),
  address: optionalText(300),
  /** İşletme yetkilisi */
  contactName: optionalText(120),
  /** Usta öğretici / eğitici personel */
  trainerName: optionalText(120),
  email: optionalText(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Geçerli bir e-posta yazın'),
  /** Faaliyet alanı / dal */
  field: optionalText(120),
  notes: optionalText(1000),
  /** Koordinatör öğretmen */
  coordinatorTeacherId: z.uuid().nullish().transform((v) => v ?? null),
  isActive: z.boolean().default(true),
});

/** Koordinatör öğretmenin düzenleyebildiği işletme bilgileri (koordinatör ataması idarede) */
export const businessInfoSchema = businessSchema.omit({ coordinatorTeacherId: true, isActive: true }).partial();

export const businessStudentsSchema = z.object({ studentIds: z.array(z.uuid()).max(500) });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı');

/**
 * Devam işaretleri. code 'X': işaret kaldırılır (işletmede, devam etti). 'T' bütün öğrencilere, 'K' öğrencinin
 * işletmesindeki bütün öğrencilere uygulanır; T ya da K kaldırılınca da aynı kapsamdan kalkar.
 */
export const internMarksSchema = z.object({
  date: isoDate,
  /** Aralık (ör. birkaç günlük rapor): date ile until arasındaki işletme günlerine uygulanır; okul günleri ve tatiller atlanır */
  until: isoDate.optional(),
  items: z
    .array(z.object({ studentId: z.uuid(), half: z.enum(INTERN_HALVES), code: z.enum(['X', ...INTERN_MARKS]) }))
    .min(1)
    .max(400),
});
export type InternMarksInput = z.infer<typeof internMarksSchema>;

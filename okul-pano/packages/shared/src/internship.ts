import { isInternshipSubject } from './internshipSubject.ts';
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
 *   İ  izinli (özürlü)
 *   R  raporlu (özürlü)
 *   H  hasta sevkli (özürlü)
 *
 * Hiçbir gün ya da saat sabit değildir: okul günleri ders programından, tatiller okulun takviminden gelir.
 */

export const INTERN_HALVES = ['am', 'pm'] as const;
export type InternHalf = (typeof INTERN_HALVES)[number];
export const INTERN_HALF_LABELS: Record<InternHalf, string> = { am: 'Sabah', pm: 'Öğle' };
/** e-Okul kısaltması: S (sabah), Ö (öğle) */
export const INTERN_HALF_SHORT: Record<InternHalf, string> = { am: 'S', pm: 'Ö' };

/** Öğretmenin girdiği kodlar (veritabanında saklanır) */
export const INTERN_MARKS = ['D', 'İ', 'R', 'H', 'T', 'K'] as const;
export type InternMark = (typeof INTERN_MARKS)[number];
/** Veritabanında saklanan bütün kodlar: X (işletmede) da koordinatörün koyduğu bir işarettir */
export const INTERN_STORED = ['X', ...INTERN_MARKS] as const;
export type InternStored = (typeof INTERN_STORED)[number];
/** Devamsızlık kodları: koordinatör kontrol edip "Gönder" deyince müdür yardımcısına bildirilir */
export const INTERN_ABSENCES: readonly InternMark[] = ['D', 'İ', 'R', 'H'];
/** Özürlü devamsızlık (izinli, raporlu, hasta sevkli) */
export const INTERN_EXCUSED: readonly InternMark[] = ['İ', 'R', 'H'];
export const INTERN_MARK_TEXT: Record<InternStored, string> = {
  X: 'işletmede',
  D: 'devamsız (özürsüz)',
  İ: 'izinli (özürlü)',
  R: 'raporlu (özürlü)',
  H: 'hasta sevkli (özürlü)',
  T: 'tatil',
  K: 'işletme kapalı',
};

/**
 * Hücre kodu: saklanan kodlar ile kendiliğinden gelenler. 'TA' takvimden gelen (değiştirilemez) tatil, 'T' öğretmenin
 * işaretlediği tatil; ikisi de "T" yazılır. 'W' hafta sonu, '' henüz gelmemiş gün. '?' kontrol edilmemiş işletme günü
 * (geçmiş ya da bugün, işaret yok): işletmede sayılmaz, koordinatör X ya da devamsızlık koyar.
 */
export type InternCell = 'O' | InternStored | 'TA' | 'W' | '?' | '';

export const INTERN_LEGEND: { code: InternCell; letter: string; text: string }[] = [
  { code: 'X', letter: 'X', text: 'İşletmede (koordinatör işaretledi)' },
  { code: '?', letter: '?', text: 'Kontrol edilmedi' },
  { code: 'D', letter: 'D', text: 'Özürsüz devamsız' },
  { code: 'İ', letter: 'İ', text: 'İzinli' },
  { code: 'R', letter: 'R', text: 'Raporlu' },
  { code: 'H', letter: 'H', text: 'Hasta sevkli' },
  { code: 'O', letter: 'O', text: 'Okulda (ders programından)' },
  { code: 'TA', letter: 'T', text: 'Resmî / dinî tatil (takvimden)' },
  { code: 'T', letter: 'T', text: 'Tatil (öğretmen işaretledi, bütün öğrenciler)' },
  { code: 'K', letter: 'K', text: 'İşletme kapalı (işletmedeki bütün öğrenciler)' },
];

export const internLetter = (c: InternCell) => (c === 'TA' ? 'T' : c === 'W' ? '' : c);

/** Öğretmenin değiştirebileceği bölüm: işletme günü (okul günü, takvim tatili, hafta sonu ve gelecek değil) */
export const internEditable = (c: InternCell) => c === '?' || (INTERN_STORED as readonly string[]).includes(c);
/** Seçilebilir bölüm: işletme günü ya da henüz gelmemiş işletme günü (ileri tarihli rapor) */
export const internPickable = (c: InternCell) => internEditable(c) || c === '';

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

/** Ders programındaki işletme dersi: e-Okul programında işletme günleri bu dersle doldurulur (okul günü sayılmaz) */
export { isInternshipSubject } from './internshipSubject.ts';

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
  opts: { school: SchoolHalves; marks: ReadonlyMap<string, InternStored>; today: string },
): [InternCell, InternCell][] {
  return days.map((d) =>
    INTERN_HALVES.map((half, i): InternCell => {
      if (d.weekday >= 6) return 'W';
      if (d.holiday || (d.halfDay && half === 'pm')) return 'TA';
      if (opts.school.get(d.weekday)?.[i]) return 'O';
      const mark = opts.marks.get(internKey(d.date, half));
      if (mark) return mark;
      // İşaretsiz geçmiş/bugünkü işletme günü kendiliğinden "işletmede" sayılmaz: kontrol edilmedi
      return d.date <= opts.today ? '?' : '';
    }) as [InternCell, InternCell],
  );
}

export interface InternTotals {
  /** Özürlü devamsızlık (İ, R, H), gün */
  excused: number;
  /** Özürsüz devamsızlık (D), gün */
  unexcused: number;
  permitted: number;
  report: number;
  referred: number;
  school: number;
  business: number;
  holiday: number;
  closed: number;
  /** Kontrol edilmemiş işletme günü (işaret yok) */
  unchecked: number;
}

export function internTotals(cells: readonly (readonly InternCell[])[]): InternTotals {
  const t: InternTotals = { excused: 0, unexcused: 0, permitted: 0, report: 0, referred: 0, school: 0, business: 0, holiday: 0, closed: 0, unchecked: 0 };
  for (const day of cells)
    for (const c of day) {
      if (c === 'İ' || c === 'R' || c === 'H') {
        t.excused += 0.5;
        if (c === 'İ') t.permitted += 0.5;
        else if (c === 'R') t.report += 0.5;
        else t.referred += 0.5;
      } else if (c === 'D') t.unexcused += 0.5;
      else if (c === 'O') t.school += 0.5;
      else if (c === 'X') t.business += 0.5;
      else if (c === 'T' || c === 'TA') t.holiday += 0.5;
      else if (c === 'K') t.closed += 0.5;
      else if (c === '?') t.unchecked += 0.5;
    }
  return t;
}

/** 1,5 gibi (yarım gün virgülle) */
export const formatDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/**
 * İşletme öğrencilerinin seçileceği sınıflar: programında işletme dersi olanlar ve 12. sınıflar. Özel eğitim sınıfı
 * (zil hesabına katılmayan) yalnızca işletme dersi varsa girer; öğrencisi zaten bir işletmeye bağlı sınıf hep girer
 * (atama kaybolmasın). Hiçbiri bulunamazsa (ders programı yok, sınıf adlarından düzey anlaşılmıyor) bütün sınıflar
 * döner ve `fallback` işaretlenir.
 */
export function internshipClassIds(
  classes: readonly { id: string; name: string; bellExempt?: boolean | null }[],
  entries: readonly { classId: string; subject: string }[],
  assignedClassIds: Iterable<string> = [],
  gradeOfName: (name: string) => number | null = () => null,
): { ids: Set<string>; withLesson: Set<string>; fallback: boolean } {
  const withLesson = new Set(entries.filter((e) => isInternshipSubject(e.subject)).map((e) => e.classId));
  const ids = new Set<string>();
  for (const c of classes) {
    if (withLesson.has(c.id)) ids.add(c.id);
    else if (!c.bellExempt && gradeOfName(c.name) === 12) ids.add(c.id);
  }
  if (!ids.size) return { ids: new Set(classes.map((c) => c.id)), withLesson, fallback: true };
  for (const id of assignedClassIds) ids.add(id);
  return { ids, withLesson, fallback: false };
}

/**
 * Branşı girilmemiş öğretmenler için sıralama ipucu (karar değildir): öğretmenin derslerinin ne kadarı "alana özgü".
 * Sınıflar program ve düzeye göre gruplanır (AMP 11, ATP 11…): ortak kültür dersleri gruptaki her şubede okutulur,
 * alan dersleri yalnızca o alanın şubelerinde (gruptaki sınıfların yarısından azında). Özel eğitim sınıfları ve tek
 * şubeli gruplar hesaba girmez. Dönen değer 0–1 arası pay; hesaba giren dersi olmayan öğretmen listede yer almaz.
 */
export function vocationalLessonShare(
  entries: readonly { teacherId: string | null; classId: string; subject: string }[],
  classes: readonly { id: string; name: string; bellExempt?: boolean | null }[],
  groupOfName: (name: string) => string | number | null,
): Map<string, number> {
  const grade = new Map(classes.filter((c) => !c.bellExempt).map((c) => [c.id, groupOfName(c.name)]));
  const perGrade = new Map<string | number, number>();
  for (const g of grade.values()) if (g !== null) perGrade.set(g, (perGrade.get(g) ?? 0) + 1);
  // Düzeyde dersin okutulduğu sınıflar
  const reach = new Map<string, Set<string>>();
  for (const e of entries) {
    const g = grade.get(e.classId);
    if (g == null) continue;
    const k = `${g}|${e.subject}`;
    reach.set(k, (reach.get(k) ?? new Set()).add(e.classId));
  }
  const specific = (e: { classId: string; subject: string }) => {
    const g = grade.get(e.classId);
    if (g == null || isInternshipSubject(e.subject)) return false;
    const total = perGrade.get(g) ?? 0;
    if (total < 2) return false;
    return (reach.get(`${g}|${e.subject}`)?.size ?? 0) / total < 0.5;
  };
  const sum = new Map<string, { all: number; spec: number }>();
  for (const e of entries) {
    if (!e.teacherId || grade.get(e.classId) == null || (perGrade.get(grade.get(e.classId)!) ?? 0) < 2) continue;
    const s = sum.get(e.teacherId) ?? { all: 0, spec: 0 };
    s.all += 1;
    if (specific(e)) s.spec += 1;
    sum.set(e.teacherId, s);
  }
  return new Map([...sum].map(([id, s]) => [id, s.spec / s.all]));
}

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
  /** Dal / faaliyet (serbest metin) */
  field: optionalText(120),
  /** Okulun meslek alanı (öğretmen branşı kaydı) */
  areaId: z.uuid().nullish().transform((v) => v ?? null),
  notes: optionalText(1000),
  /** Koordinatör öğretmen */
  coordinatorTeacherId: z.uuid().nullish().transform((v) => v ?? null),
  isActive: z.boolean().default(true),
});

/** Koordinatör öğretmenin düzenleyebildiği işletme bilgileri (koordinatör ataması idarede) */
export const businessInfoSchema = businessSchema.omit({ coordinatorTeacherId: true, isActive: true, areaId: true }).partial();

export const areaVocationalSchema = z.object({ vocational: z.boolean().nullable() });

export const businessStudentsSchema = z.object({ studentIds: z.array(z.uuid()).max(500) });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı');

/**
 * Devam işaretleri. code 'X': işletmede (koordinatör işaretler), '-': işaret kaldırılır (kontrol edilmedi). 'T' bütün
 * öğrencilere, 'K' öğrencinin işletmesindeki bütün öğrencilere uygulanır; T ya da K kaldırılınca da aynı kapsamdan kalkar.
 */
export const internMarksSchema = z.object({
  date: isoDate,
  /** Aralık (ör. birkaç günlük rapor): date ile until arasındaki işletme günlerine uygulanır; okul günleri ve tatiller atlanır */
  until: isoDate.optional(),
  items: z
    .array(z.object({ studentId: z.uuid(), half: z.enum(INTERN_HALVES), code: z.enum(['-', ...INTERN_STORED]) }))
    .min(1)
    .max(400),
});
export type InternMarksInput = z.infer<typeof internMarksSchema>;

/** Toplu "İşletmede": aralıktaki işaretsiz (?) işletme günleri X olur; var olan işaretlere dokunulmaz */
export const internFillSchema = z.object({
  from: isoDate,
  until: isoDate,
  /** Yalnızca bu işletmenin öğrencileri; boşsa düzenleyebildiği bütün öğrenciler */
  businessId: z.uuid().nullable().optional(),
});
export type InternFillInput = z.infer<typeof internFillSchema>;

/** Gönderilmemiş devamsızlıkları koordinatör müdür yardımcısına gönder */
export const internSendSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(1000),
  note: z.string().trim().max(500).optional(),
});
export type InternSendInput = z.infer<typeof internSendSchema>;

/**
 * Gözlem (öğrenci davranış takibi): öğretmenler öğrencilere kriterlere göre artı / eksi verir; ay sonunda
 * "ayın öğrencisi" önerileri, dönem sonunda öğretmene performans notu için gösterge çıkar.
 * Kriterler okul düzeyine göre ayrı şablondur ve her okul kendi listesini düzenler; buradakiler yalnızca
 * yeni bir okulun başlangıç şablonudur.
 */

export const SCHOOL_LEVELS = { primary: 'İlkokul', middle: 'Ortaokul', high: 'Lise' } as const;
export type SchoolLevel = keyof typeof SCHOOL_LEVELS;
export const SCHOOL_LEVEL_KEYS = Object.keys(SCHOOL_LEVELS) as SchoolLevel[];

export const CONDUCT_GROUPS = { academic: 'Akademik', behavior: 'Davranış', social: 'Sosyal' } as const;
export type ConductGroup = keyof typeof CONDUCT_GROUPS;
export const CONDUCT_GROUP_KEYS = Object.keys(CONDUCT_GROUPS) as ConductGroup[];

/**
 * Sınıf adından düzey: 1-4 ilkokul, 5-8 ortaokul, 9-12 ve hazırlık lise. Anlaşılamayan adlar (ör. "Anasınıfı")
 * için null döner; panelde sınıfın düzeyi elle seçilebilir.
 */
export function levelFromClassName(name: string): SchoolLevel | null {
  const n = name.trim().toLocaleLowerCase('tr-TR');
  const grade = Number(/^(\d{1,2})/.exec(n)?.[1] ?? NaN);
  if (grade >= 1 && grade <= 4) return 'primary';
  if (grade >= 5 && grade <= 8) return 'middle';
  if (grade >= 9 && grade <= 12) return 'high';
  if (/^(haz|hz)/.test(n)) return 'high';
  if (/^ana/.test(n)) return 'primary';
  return null;
}

/** Sınıfın gözlemde kullanılan düzeyi: elle seçilen, yoksa addan anlaşılan, o da yoksa okulun en yaygın düzeyi */
export function classLevel(cls: { name: string; level?: SchoolLevel | null }, fallback: SchoolLevel): SchoolLevel {
  return cls.level ?? levelFromClassName(cls.name) ?? fallback;
}

export interface ConductTemplateItem {
  group: ConductGroup;
  label: string;
  points: number;
  noteRequired: boolean;
}

const plus = (group: ConductGroup, label: string, points = 1): ConductTemplateItem => ({ group, label, points, noteRequired: false });
const minus = (group: ConductGroup, label: string, points = -1): ConductTemplateItem => ({ group, label, points, noteRequired: true });

/** Başlangıç şablonları (okul "Hazır şablonu yükle" ile ekler, sonra istediği gibi değiştirir) */
export const CONDUCT_TEMPLATES: Record<SchoolLevel, ConductTemplateItem[]> = {
  primary: [
    plus('academic', 'Ödevini yaptı'),
    plus('academic', 'Derse katıldı'),
    plus('academic', 'Kitap okudu / ek çalışma', 2),
    minus('academic', 'Ödevini getirmedi'),
    minus('academic', 'Ders araç-gereci yok'),
    plus('behavior', 'Arkadaşına yardım etti', 2),
    plus('behavior', 'Kurallara uydu'),
    plus('behavior', 'Temiz ve düzenli'),
    minus('behavior', 'Arkadaşını rahatsız etti'),
    minus('behavior', 'Söz almadan konuştu'),
    plus('social', 'Etkinliğe katıldı', 2),
  ],
  middle: [
    plus('academic', 'Derse etkin katılım', 2),
    plus('academic', 'Ödev tam'),
    plus('academic', 'Derse hazırlıklı'),
    plus('academic', 'Proje / ek çalışma', 2),
    minus('academic', 'Ödev yapılmadı'),
    minus('academic', 'Materyal yok'),
    plus('behavior', 'Arkadaşına yardım', 2),
    plus('behavior', 'Saygılı tutum'),
    plus('behavior', 'Sınıf düzenine katkı'),
    minus('behavior', 'Dersi bölme'),
    minus('behavior', 'Kurala uymama', -2),
    plus('social', 'Kulüp / etkinlik katkısı', 2),
    plus('social', 'Gönüllü görev'),
  ],
  high: [
    plus('academic', 'Derse katılım', 2),
    plus('academic', 'Ödev tam'),
    plus('academic', 'Hazırlıklı'),
    plus('academic', 'Proje / araştırma', 2),
    minus('academic', 'Ödev yok'),
    minus('academic', 'Materyal yok'),
    plus('behavior', 'Arkadaşına yardım', 2),
    plus('behavior', 'Saygılı'),
    minus('behavior', 'Dersi bölme'),
    minus('behavior', 'Kurala uymama', -2),
    minus('behavior', 'Derse geç kalma'),
    plus('social', 'Kulüp / etkinlik katkısı', 2),
    plus('social', 'Gönüllülük'),
  ],
};

/** Ayın öğrencisi önerisinde bir öğretmenin bir öğrenciye etkisi en fazla bu kadar sayılır (cömert öğretmen dengesi) */
export const CONDUCT_TEACHER_CAP = 4;
/** Öneriye girmek için en az bu kadar farklı öğretmenden artı almış olmak gerekir */
export const CONDUCT_MIN_TEACHERS = 3;

export interface ConductEntryLite {
  studentId: string;
  /** Kaydı giren (kullanıcı kimliği ya da silinmişse adı) */
  by: string;
  points: number;
}

export interface ConductCandidate {
  studentId: string;
  plus: number;
  minus: number;
  /** Artı veren farklı öğretmen sayısı */
  teachers: number;
  /** Dengeli puan: her öğretmenin bu öğrenciye verdiği toplam ±CAP ile sınırlanıp toplanır */
  balanced: number;
}

/**
 * Ayın öğrencisi önerileri. Her öğretmenin bir öğrenciye verdiği net puan ±cap ile sınırlanır; böylece tek bir
 * cömert (ya da sert) öğretmen sıralamayı belirleyemez. En az minTeachers farklı öğretmenden artı almış ve dengeli
 * puanı sıfırın üstünde olanlar sıralanır; eşitlikte daha çok öğretmen, sonra daha çok artı öne geçer.
 */
export function rankConductCandidates(
  entries: ConductEntryLite[],
  opts: { cap?: number; minTeachers?: number; limit?: number } = {},
): ConductCandidate[] {
  const cap = opts.cap ?? CONDUCT_TEACHER_CAP;
  const minTeachers = opts.minTeachers ?? CONDUCT_MIN_TEACHERS;
  const perStudent = new Map<string, { plus: number; minus: number; byTeacher: Map<string, number>; positiveTeachers: Set<string> }>();
  for (const e of entries) {
    let s = perStudent.get(e.studentId);
    if (!s) perStudent.set(e.studentId, (s = { plus: 0, minus: 0, byTeacher: new Map(), positiveTeachers: new Set() }));
    if (e.points > 0) {
      s.plus += e.points;
      s.positiveTeachers.add(e.by);
    } else s.minus += -e.points;
    s.byTeacher.set(e.by, (s.byTeacher.get(e.by) ?? 0) + e.points);
  }
  const out: ConductCandidate[] = [];
  for (const [studentId, s] of perStudent) {
    let balanced = 0;
    for (const net of s.byTeacher.values()) balanced += Math.max(-cap, Math.min(cap, net));
    if (s.positiveTeachers.size < minTeachers || balanced <= 0) continue;
    out.push({ studentId, plus: s.plus, minus: s.minus, teachers: s.positiveTeachers.size, balanced });
  }
  out.sort((a, b) => b.balanced - a.balanced || b.teachers - a.teachers || b.plus - a.plus || a.minus - b.minus);
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/** "2026-10" ayının başı ve sonu (yerel saat dilimi farkı API tarafında okul saat dilimiyle uygulanır) */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

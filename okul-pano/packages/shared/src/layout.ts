/**
 * Pano düzeni: orta alan (duyurular) sabittir; sol ve sağ sütundaki kartların yeri ve sırası
 * okul genelinde ya da her pano için ayrı ayarlanır. Listede olmayan kart panoda gösterilmez.
 */
export const BOARD_MODULES = ['exams', 'duties', 'leaves', 'birthdays', 'bell', 'lessons', 'achievements', 'events', 'book'] as const;
export type BoardModule = (typeof BOARD_MODULES)[number];

/**
 * Sütundaki bir öğe: tek kart ya da birleşik kart (2-4 kart aynı yerde sırayla döner; ör. izinliler +
 * doğum günleri). Böylece çok kart açıldığında alan daralmaz.
 */
export type LayoutItem = BoardModule | BoardModule[];

export interface BoardLayout {
  left: LayoutItem[];
  right: LayoutItem[];
}

/** Düzendeki bütün kartlar (birleşik kartların içindekiler dahil) */
export function layoutModules(layout: BoardLayout): BoardModule[] {
  return [...layout.left, ...layout.right].flat();
}

export const MODULE_LABELS: Record<BoardModule, string> = {
  exams: 'Sınav sayacı',
  duties: 'Nöbetçi öğretmenler',
  leaves: 'İzinli öğretmenler',
  birthdays: 'Doğum günleri',
  bell: 'Zil vakti',
  lessons: 'Şu an derste',
  achievements: 'Başarılar / ayın öğrencisi',
  events: 'Etkinlik takvimi',
  book: 'Haftanın kitabı',
};

export const DEFAULT_LAYOUT: BoardLayout = { left: ['exams', 'duties', 'leaves', 'birthdays'], right: ['bell', 'lessons'] };

/** Tekrarlananları ve bilinmeyenleri ayıklar; tek kartı kalan birleşik kart düz karta döner */
export function cleanLayout(layout: BoardLayout): BoardLayout {
  const seen = new Set<string>();
  const ok = (m: string): m is BoardModule => (BOARD_MODULES as readonly string[]).includes(m) && !seen.has(m) && Boolean(seen.add(m));
  const keep = (list: readonly LayoutItem[]): LayoutItem[] =>
    list.flatMap((item): LayoutItem[] => {
      if (!Array.isArray(item)) return ok(item) ? [item] : [];
      const members = item.filter(ok);
      return members.length > 1 ? [members] : members;
    });
  return { left: keep(layout.left), right: keep(layout.right) };
}

/**
 * Geçerli düzen: panoya özel düzen > okul düzeni > eski "göster/gizle" ayarlarından türetilen düzen.
 */
export function resolveLayout(
  settings: { layout?: BoardLayout | null; showExams?: boolean; showDuties?: boolean; showLeaves?: boolean; showBirthdays?: boolean; showTimetable?: boolean },
  screenLayout?: BoardLayout | null,
): BoardLayout {
  if (screenLayout) return cleanLayout(screenLayout);
  if (settings.layout) return cleanLayout(settings.layout);
  const off = new Set<BoardModule>();
  if (settings.showExams === false) off.add('exams');
  if (settings.showDuties === false) off.add('duties');
  if (settings.showLeaves === false) off.add('leaves');
  if (settings.showBirthdays === false) off.add('birthdays');
  if (settings.showTimetable === false) off.add('lessons');
  return { left: (DEFAULT_LAYOUT.left as BoardModule[]).filter((m) => !off.has(m)), right: (DEFAULT_LAYOUT.right as BoardModule[]).filter((m) => !off.has(m)) };
}

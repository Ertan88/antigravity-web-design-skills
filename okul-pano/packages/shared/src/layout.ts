/**
 * Pano düzeni: orta alan (duyurular) sabittir; sol ve sağ sütundaki kartların yeri ve sırası
 * okul genelinde ya da her pano için ayrı ayarlanır. Listede olmayan kart panoda gösterilmez.
 */
export const BOARD_MODULES = ['exams', 'duties', 'leaves', 'birthdays', 'bell', 'lessons'] as const;
export type BoardModule = (typeof BOARD_MODULES)[number];

export interface BoardLayout {
  left: BoardModule[];
  right: BoardModule[];
}

export const MODULE_LABELS: Record<BoardModule, string> = {
  exams: 'Sınav sayacı',
  duties: 'Nöbetçi öğretmenler',
  leaves: 'İzinli öğretmenler',
  birthdays: 'Doğum günleri',
  bell: 'Zil vakti',
  lessons: 'Şu an derste',
};

export const DEFAULT_LAYOUT: BoardLayout = { left: ['exams', 'duties', 'leaves', 'birthdays'], right: ['bell', 'lessons'] };

/** Tekrarlananları ve bilinmeyenleri ayıklar */
export function cleanLayout(layout: BoardLayout): BoardLayout {
  const seen = new Set<string>();
  const keep = (list: readonly string[]) =>
    list.filter((m): m is BoardModule => (BOARD_MODULES as readonly string[]).includes(m) && !seen.has(m) && Boolean(seen.add(m)));
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
  return { left: DEFAULT_LAYOUT.left.filter((m) => !off.has(m)), right: DEFAULT_LAYOUT.right.filter((m) => !off.has(m)) };
}

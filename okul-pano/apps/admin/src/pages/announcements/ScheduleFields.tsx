import type { AnnouncementSchedule, Screen } from '../../lib/data.ts';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const emptySchedule = (): AnnouncementSchedule => ({ days: [], from: null, to: null, phase: 'any' });

/** Yayın planının ayarları "Nerede ve ne zaman" adımında (Wizard.tsx, tasarım A); burada liste özeti kalır */

/** Listede kısa özet: "Kantin · teneffüslerde · Pzt–Cum" */
export function scheduleSummary(screenIds: string[] | null, s: AnnouncementSchedule | null, screens: Screen[] | undefined): string | null {
  const parts: string[] = [];
  if (screenIds?.length) parts.push(screenIds.map((id) => screens?.find((x) => x.id === id)?.name ?? '?').join(', '));
  if (s?.phase === 'break') parts.push('teneffüslerde');
  if (s?.phase === 'lesson') parts.push('ders saatlerinde');
  if (s?.days.length) parts.push(s.days.length === 5 && s.days.every((d) => d <= 5) ? 'hafta içi' : s.days.map((d) => DAYS[d - 1]).join(', '));
  if (s?.from || s?.to) parts.push(`${s.from ?? '00:00'}–${s.to ?? '24:00'}`);
  return parts.length ? parts.join(' · ') : null;
}

import { startOfDay } from './finance/billingCycle';

/** Bugünden son ödeme tarihine kalan tam gün sayısı (geçmişse negatif). */
export function daysUntil(due: Date, now: Date): number {
  return Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/**
 * Aciliyet seviyesi — tasarımdaki renk sıcaklığını belirler:
 * later = soğuk/gri, upcoming = mavi, soon = kehribar parıltı, today = kehribar + vurgu, overdue = mercan.
 */
export type Urgency = 'overdue' | 'today' | 'soon' | 'upcoming' | 'later';

export function urgencyFor(daysLeft: number): Urgency {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'today';
  if (daysLeft <= 3) return 'soon';
  if (daysLeft <= 11) return 'upcoming';
  return 'later';
}

export function dueLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft} gün gecikti`;
  if (daysLeft === 0) return 'Bugün';
  if (daysLeft === 1) return 'Yarın';
  return `${daysLeft} gün`;
}

export function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Günaydın';
  if (h >= 12 && h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const shortFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

/** "17 Kasım Salı" */
export const formatLongDate = (d: Date) => dateFmt.format(d);
/** "19 Kas" */
export const formatShortDate = (d: Date) => shortFmt.format(d);

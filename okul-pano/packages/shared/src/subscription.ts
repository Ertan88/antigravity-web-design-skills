/*
 * Abonelik ve deneme süresi. Deneme paketindeki okulun süresi dolunca panel salt okunur olur ve panolar
 * içerik yerine "abonelik sona erdi" ekranı gösterir. Ücretli paketlerde (Temel, Profesyonel) bitiş yoktur;
 * ödeme ve yenileme platform yöneticisinin panelinden yönetilir.
 */

export const TRIAL_REMINDER_DAYS = [7, 3, 1, 0] as const;

export interface TrialStatus {
  expired: boolean;
  /** Bitişe kalan gün (bugün bitiyorsa 0) */
  daysLeft: number;
  endsAt: string;
}

/** Deneme paketinde değilse ya da bitiş tarihi yoksa null */
export function trialStatus(
  school: { plan: string; trialEndsAt: string | Date | null | undefined },
  now: number = Date.now(),
): TrialStatus | null {
  if (school.plan !== 'trial' || !school.trialEndsAt) return null;
  const end = school.trialEndsAt instanceof Date ? school.trialEndsAt.getTime() : Date.parse(school.trialEndsAt);
  if (Number.isNaN(end)) return null;
  const ms = end - now;
  return { expired: ms <= 0, daysLeft: Math.max(0, Math.ceil(ms / 86400_000)), endsAt: new Date(end).toISOString() };
}

/** Bir sonraki hatırlatma eşiği: kalan güne göre gönderilmesi gereken en küçük eşik (yoksa null) */
export function dueTrialReminder(status: TrialStatus | null, lastSent: number | null): number | null {
  if (!status) return null;
  const due = status.expired ? 0 : TRIAL_REMINDER_DAYS.filter((d) => status.daysLeft <= d).at(-1);
  if (due === undefined) return null;
  return lastSent === null || lastSent > due ? due : null;
}

/** "Örnek Anadolu Lisesi" -> "ornek-anadolu-lisesi" (Türkçe harfler sadeleşir) */
export function slugify(text: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u' };
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]|i̇/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

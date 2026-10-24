const pad = (n: number) => String(n).padStart(2, '0');

/** ISO -> <input type="datetime-local"> değeri (tarayıcının yerel saati) */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—';
}

/** "2026-10-28" -> "28 Ekim 2026" */
export function formatDate(isoDate: string | null | undefined): string {
  return isoDate ? dateFmt.format(new Date(`${isoDate}T00:00:00Z`)) : '—';
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'hiç';
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'az önce';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** Duyuru/kayan yazının yayın durumu */
export type PublishState = 'live' | 'scheduled' | 'expired' | 'off';
export function publishState(row: { isActive: boolean; startsAt: string | null; endsAt: string | null }): PublishState {
  if (!row.isActive) return 'off';
  const now = Date.now();
  if (row.startsAt && Date.parse(row.startsAt) > now) return 'scheduled';
  if (row.endsAt && Date.parse(row.endsAt) <= now) return 'expired';
  return 'live';
}

export function slugify(text: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıiöşü]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

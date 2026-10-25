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
type Publishable = { isActive: boolean; startsAt: string | null; endsAt: string | null };

export function publishState(row: Publishable): PublishState {
  const now = Date.now();
  // Süresi dolan kayıt, yayında anahtarı ne olursa olsun "süresi doldu"dur
  if (row.endsAt && Date.parse(row.endsAt) <= now) return 'expired';
  if (!row.isActive) return 'off';
  if (row.startsAt && Date.parse(row.startsAt) > now) return 'scheduled';
  return 'live';
}

const RANK: Record<PublishState, number> = { live: 0, off: 1, scheduled: 2, expired: 3 };

/**
 * Liste sırası: yayındakiler üstte (kendi sıralarıyla), sonra pasifler, sonra planlananlar
 * (en yakın başlayan önce), en altta süresi dolanlar.
 */
export function sortByPublish<T extends Publishable>(rows: T[], first?: (row: T) => boolean): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const fa = first?.(a.row) ? 0 : 1;
      const fb = first?.(b.row) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const ra = RANK[publishState(a.row)];
      const rb = RANK[publishState(b.row)];
      if (ra !== rb) return ra - rb;
      if (ra === 2) return Date.parse(a.row.startsAt!) - Date.parse(b.row.startsAt!);
      return a.i - b.i;
    })
    .map((x) => x.row);
}

/** Süresi dolan kayıt soluk görünür, yayın anahtarı ancak tarihi düzenlenince açılır */
export function expiredRowState(row: Publishable) {
  return publishState(row) === 'expired'
    ? { dim: true, toggle: { checked: false, disabled: 'Süresi doldu: yeniden yayınlamak için düzenleyip bitiş tarihini değiştirin' } }
    : {};
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

const pad = (n: number) => String(n).padStart(2, '0');

/** Yerel tarihi 'YYYY-MM-DD' olarak yazar (UTC kayması olmadan). */
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' metnini yerel gece yarısı Date'ine çevirir. */
export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Aylık dönem anahtarı: 'YYYY-MM'. */
export const periodKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

const monthFmt = new Intl.DateTimeFormat('tr-TR', { month: 'long' });
/** "Kasım" */
export const monthName = (d: Date) => {
  const m = monthFmt.format(d);
  return m.charAt(0).toLocaleUpperCase('tr-TR') + m.slice(1);
};

let counter = 0;
/** Cihazda benzersiz kimlik (zaman + sayaç + rastgele). */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

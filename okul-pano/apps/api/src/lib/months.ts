import { monthFromText } from '@okulpano/shared';

const pad = (n: number) => String(n).padStart(2, '0');
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-09" -> ayın ilk ve son günü */
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${pad(days)}`];
}

const weekdayOf = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

export interface MonthResolution {
  /** Kaydedilecek ay */
  month: string;
  /** Başlıktaki "AİT OLDUĞU AY" */
  titleMonth: string | null;
  /** Dosyadaki tarihlerin çoğunun ait olduğu ay */
  datesMonth: string | null;
  /** Başlık ve tarihler farklı ayı gösteriyor */
  conflict: boolean;
  /** Ay nereden alındı */
  source: 'chosen' | 'title' | 'dates' | 'current';
}

/**
 * Çizelgenin hangi aya ait olduğunu bulur. Esas başlıktaki ay adıdır; ama başlık eski aydan kalmış
 * olabilir, bu yüzden tarihlerle karşılaştırılır ve çelişki bildirilir (panelde kullanıcı seçer).
 * Başlıkta yıl yoksa tarihlerin yılı, o da yoksa bugüne en yakın yıl alınır.
 */
export function resolveMonth(opts: { titleText: string; dates: string[]; chosen?: string | null; today: string }): MonthResolution {
  const counts = new Map<string, number>();
  for (const d of opts.dates) counts.set(d.slice(0, 7), (counts.get(d.slice(0, 7)) ?? 0) + 1);
  const datesMonth = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let titleMonth: string | null = null;
  const t = monthFromText(opts.titleText);
  if (t) {
    let year = t.year ?? (datesMonth ? Number(datesMonth.slice(0, 4)) : null);
    if (year === null) {
      // Bugüne en yakın yıl (ör. aralıkta yüklenen "OCAK" çizelgesi gelecek yılındır)
      const ty = Number(opts.today.slice(0, 4));
      const tm = Number(opts.today.slice(5, 7));
      year = [ty - 1, ty, ty + 1].sort((a, b) => Math.abs((a - ty) * 12 + t.month - tm) - Math.abs((b - ty) * 12 + t.month - tm))[0]!;
    } else if (!t.year && datesMonth) {
      // Tarihler aralıkta, başlık ocakta gibi yıl dönümü durumları
      const dm = Number(datesMonth.slice(5, 7));
      if (dm >= 11 && t.month <= 2) year += 1;
      if (dm <= 2 && t.month >= 11) year -= 1;
    }
    titleMonth = `${year}-${pad(t.month)}`;
  }

  const chosen = opts.chosen && MONTH_RE.test(opts.chosen) ? opts.chosen : null;
  const month = chosen ?? titleMonth ?? datesMonth ?? opts.today.slice(0, 7);
  return {
    month,
    titleMonth,
    datesMonth,
    conflict: Boolean(titleMonth && datesMonth && titleMonth !== datesMonth),
    source: chosen ? 'chosen' : titleMonth ? 'title' : datesMonth ? 'dates' : 'current',
  };
}

/**
 * Başka aya ait bir tarihi hedef aydaki karşılığına taşır: "Eylül'ün 2. pazartesisi" -> "Ekim'in 2. pazartesisi".
 * Hedef ayda o kadar o gün yoksa (5. pazartesi gibi) null.
 */
export function remapDate(iso: string, month: string): string | null {
  if (iso.startsWith(month)) return iso;
  const weekday = weekdayOf(iso);
  const occurrence = Math.ceil(Number(iso.slice(8, 10)) / 7);
  const [, last] = monthRange(month);
  let seen = 0;
  for (let d = 1; d <= Number(last.slice(8, 10)); d++) {
    const candidate = `${month}-${pad(d)}`;
    if (weekdayOf(candidate) === weekday && ++seen === occurrence) return candidate;
  }
  return null;
}

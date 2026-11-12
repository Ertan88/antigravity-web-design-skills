/**
 * Duyurunun yayın planı ("Nerede ve ne zaman" adımı, tasarım A): web paneli ve mobil uygulama aynı kuralları kullanır.
 * - Ne zamana kadar: Bugün, 3 gün, 1 hafta (varsayılan), Süresiz ya da elle tarih. Süreler seçilen gün sayısı sonunda
 *   gece yarısı biter (cihazın saatiyle).
 * - Gelişmiş zamanlama: başlangıç, haftanın günleri, günün saatleri, zilin durumu (teneffüs / ders).
 * - Altta tek cümlelik açıklama; birbirini dışlayan seçimler (duyuru hiç görünmez) uyarılır.
 */

export type UntilChoice = '1' | '3' | '7' | 'none' | 'date';

export interface PlanSchedule {
  days: number[];
  from: string | null;
  to: string | null;
  phase: 'any' | 'break' | 'lesson';
}

export const UNTIL_PRESETS: { key: Exclude<UntilChoice, 'none' | 'date'>; label: string; days: number }[] = [
  { key: '1', label: 'Bugün', days: 1 },
  { key: '3', label: '3 gün', days: 3 },
  { key: '7', label: '1 hafta', days: 7 },
];

/** Yeni duyurunun varsayılanı: 1 hafta (süresiz unutulan duyurular panoda birikmesin) */
export const DEFAULT_UNTIL: UntilChoice = '7';

export const PLAN_WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const WEEKDAY_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Seçilen gün sayısı sonunda gece yarısı: "Bugün" bu gecenin 00.00'ı, "1 hafta" 7 gün sonraki gece */
export function presetEnd(days: number, now: Date = new Date()): Date {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + days);
  return end;
}

/** Seçilen günün bitişi (o günün ertesi gece yarısı): elle seçilen bitiş tarihi bu güne dahil olur */
export function endOfDay(day: Date): Date {
  const end = new Date(day);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return end;
}

/** Bitiş zamanı hangi hazır seçeneğe denk geliyor (düzenlemede doğru çip seçili gelsin) */
export function untilChoiceOf(endsAt: Date | null, now: Date = new Date()): UntilChoice {
  if (!endsAt) return 'none';
  const hit = UNTIL_PRESETS.find((p) => presetEnd(p.days, now).getTime() === endsAt.getTime());
  return hit ? hit.key : 'date';
}

const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Gece yarısı biten tarih "19 Kasım Perşembe'ye kadar" diye (bir önceki günün sonu) okunur */
function untilText(end: Date): string {
  const midnight = end.getHours() === 0 && end.getMinutes() === 0;
  if (!midnight) return `${dateTimeFmt.format(end)} tarihine kadar`;
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  return `${dayFmt.format(last)} gününün sonuna kadar`;
}

/**
 * "Bütün panolarda, 19 Kasım Perşembe gününün sonuna kadar, hafta içi her gün, yalnızca teneffüslerde gösterilir."
 * Tarihler Date ya da tarih metni (ISO / datetime-local) olabilir.
 */
export function planSentence(startsAt: Date | string | null, endsAt: Date | string | null, s: PlanSchedule, screenNames: string[]): string {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const parts: string[] = [screenNames.length ? `${screenNames.join(', ')} panosunda` : 'Bütün panolarda'];
  if (start && start.getTime() > Date.now()) parts.push(`${dateTimeFmt.format(start)} itibarıyla`);
  parts.push(end ? untilText(end) : 'süresiz');
  if (s.days.length) parts.push(s.days.length === 5 && s.days.every((d) => d <= 5) ? 'hafta içi her gün' : `her ${s.days.map((d) => WEEKDAY_LONG[d - 1]).join(', ')}`);
  if (s.from || s.to) parts.push(`${s.from ?? '00:00'}–${s.to ?? '24:00'} saatleri arasında`);
  if (s.phase === 'break') parts.push('yalnızca teneffüs ve öğle arasında');
  if (s.phase === 'lesson') parts.push('yalnızca ders saatlerinde');
  return `${parts.join(', ')} gösterilir.`;
}

/**
 * Tarih aralığı, günler ve günlük saatler birbirini dışlıyor mu: aralıktaki her günü gezer; seçili güne ve saat
 * aralığına denk gelen bir an yoksa duyuru hiç görünmez ve bu uyarı döner.
 */
export function planConflict(startsAt: Date | string | null, endsAt: Date | string | null, s: PlanSchedule, now: Date = new Date()): string | null {
  if (!endsAt) return null;
  const startAt = startsAt ? new Date(startsAt) : null;
  const start = startAt && startAt > now ? startAt : now;
  const end = new Date(endsAt);
  if (end <= now) return 'Bitiş tarihi geçmiş: duyuru hiç görünmez. Yeni bir süre seçin.';
  if (end <= start) return 'Bitiş, başlangıçtan önce: duyuru hiç görünmez.';
  if (!s.days.length && !s.from && !s.to) return null;
  const sec = (hm: string | null, fallback: number) => (hm ? Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(3, 5)) * 60 : fallback);
  const from = sec(s.from, 0);
  const to = sec(s.to, 86400);
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let i = 0; i < 400 && day < end; i++, day.setDate(day.getDate() + 1)) {
    const weekday = ((day.getDay() + 6) % 7) + 1;
    if (s.days.length && !s.days.includes(weekday)) continue;
    const a = Math.max(day.getTime() + from * 1000, start.getTime());
    const b = Math.min(day.getTime() + to * 1000, end.getTime());
    if (b > a) return null;
  }
  return s.days.length && (s.from || s.to)
    ? 'Seçtiğiniz tarihlerde, seçili günlerde ve saatlerde bir an yok: duyuru hiç görünmez.'
    : s.days.length
      ? 'Seçtiğiniz tarihlere seçili günlerden hiçbiri denk gelmiyor: duyuru hiç görünmez.'
      : 'Seçtiğiniz tarihler günlük gösterim saatlerine denk gelmiyor: duyuru hiç görünmez.';
}

/** "Gelişmiş zamanlama" kullanılmış mı (düzenlemede bölüm açık gelsin) */
export function hasAdvancedPlan(startsAt: Date | string | null, s: PlanSchedule, now: Date = new Date()): boolean {
  const start = startsAt ? new Date(startsAt) : null;
  return Boolean((start && start.getTime() > now.getTime()) || s.days.length || s.from || s.to || s.phase !== 'any');
}

/** Saat yazımı (08.30, 8:30, 0830 → 08:30); geçersizse null */
export function normalizeTime(v: string): string | null {
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

import { sortPeriods, type Period } from './bell.ts';
import { formatClock, parseClock } from './time.ts';

/*
 * Panoların uzaktan yönetimi: günün modu (kısaltılmış gün, sınav, tören, tatil), zil kaydırma,
 * panoya anlık mesaj ve uzaktan komutlar. Pano, yönetim paneli ve mobil uygulama aynı kuralları kullanır.
 */

export const DAY_MODES = ['normal', 'short', 'exam', 'ceremony', 'holiday'] as const;
export type DayMode = (typeof DAY_MODES)[number];

export const DAY_MODE_INFO: Record<DayMode, { label: string; description: string }> = {
  normal: { label: 'Normal gün', description: 'Standart zil saatleri ve pano düzeni' },
  short: { label: 'Kısaltılmış gün', description: 'Ders süreleri kısalır, zil saatleri yeniden hesaplanır' },
  exam: { label: 'Sınav günü', description: 'Sınav sayacı öne çıkar, panoda sınav günü yazar' },
  ceremony: { label: 'Tören / özel gün', description: 'Panoda tören günü yazar, zil saatleri kaydırılabilir' },
  holiday: { label: 'Okul tatil', description: 'Panolar uyur, nöbet ve servis bilgisi gizlenir' },
};

/** Zil kaydırma: `from` saatinden sonraki bütün zil saatleri `minutes` kadar kayar (eksi olabilir) */
export interface BellShift {
  from: string;
  minutes: number;
}

/** Bir günün planı. Kayıt yoksa gün normaldir; plan yalnızca o tarih için geçerlidir (ertesi gün kendiliğinden normale döner). */
export interface DayPlan {
  date: string;
  mode: DayMode;
  /** Kısaltılmış günde bir dersin süresi (dakika) */
  lessonMin: number | null;
  shifts: BellShift[];
  /** Panoda gün modunun yanında görünen kısa not (ör. "Cumhuriyet Bayramı töreni 10.00'da") */
  note: string | null;
}

export const DEFAULT_SHORT_LESSON_MIN = 30;

/**
 * Günün planına göre zil saatlerini hesaplar. Ders numaraları (ders programı bağlantısı) korunur.
 * - Kısaltılmış gün: ilk ders aynı saatte başlar, her ders en fazla `lessonMin` sürer, teneffüs süreleri aynı kalır.
 * - Zil kaydırma: kaydırma anında süren dersin bitişi ve sonraki bütün dersler kayar.
 */
export function applyDayPlan(periods: readonly Period[], plan: Pick<DayPlan, 'mode' | 'lessonMin' | 'shifts'> | null | undefined): Period[] {
  let out = sortPeriods(periods).map((p) => ({ ...p }));
  if (!plan || !out.length) return out;

  if (plan.mode === 'short') {
    const lesson = Math.max(10, plan.lessonMin ?? DEFAULT_SHORT_LESSON_MIN) * 60;
    const original = out.map((p) => ({ start: parseClock(p.start), end: parseClock(p.end) }));
    let t = original[0]!.start;
    out = out.map((p, i) => {
      const o = original[i]!;
      const start = t;
      const end = start + Math.min(lesson, o.end - o.start);
      const gap = i + 1 < original.length ? Math.max(0, original[i + 1]!.start - o.end) : 0;
      t = end + gap;
      return { ...p, start: formatClock(start), end: formatClock(end) };
    });
  }

  for (const shift of plan.shifts ?? []) {
    const from = parseClock(shift.from);
    const delta = shift.minutes * 60;
    const shifted = out.map((p) => {
      const start = parseClock(p.start);
      const end = parseClock(p.end);
      if (start >= from) return { ...p, start: clampClock(start + delta), end: clampClock(end + delta) };
      // Kaydırma anında süren ders: yalnızca bitişi kayar (bitiş başlangıçtan önceye düşemez)
      if (end > from) return { ...p, end: clampClock(Math.max(start + 60, end + delta)) };
      return p;
    });
    out = shifted;
  }
  return out;
}

const clampClock = (sec: number) => formatClock(Math.min(Math.max(sec, 0), 24 * 3600 - 60));

/** Bugünün planını bulur (yoksa null) */
export function dayPlanFor(plans: readonly DayPlan[] | null | undefined, isoDate: string): DayPlan | null {
  return plans?.find((p) => p.date === isoDate) ?? null;
}

/** Gün modunun panodaki kısa etiketi: normal günde ve zil kaydırılmamışsa yok */
export function dayPlanLabel(plan: DayPlan | null | undefined): string | null {
  if (!plan) return null;
  const parts: string[] = [];
  if (plan.mode !== 'normal') parts.push(DAY_MODE_INFO[plan.mode].label);
  const total = (plan.shifts ?? []).reduce((s, x) => s + x.minutes, 0);
  if (total) parts.push(`Zil ${total > 0 ? '+' : '−'}${Math.abs(total)} dk`);
  return parts.length ? parts.join(' · ') : null;
}

/* ---------- Panoya anlık mesaj ---------- */

export const FLASH_STYLES = ['banner', 'fullscreen', 'ticker'] as const;
export type FlashStyle = (typeof FLASH_STYLES)[number];
export const FLASH_STYLE_LABEL: Record<FlashStyle, string> = { banner: 'Üst şerit', fullscreen: 'Tam ekran', ticker: 'Kayan yazı' };

export const FLASH_TONES = ['info', 'warning'] as const;
export type FlashTone = (typeof FLASH_TONES)[number];

/** Onaya takılmadan, süresi bitince kendiliğinden kalkan pano mesajı */
export interface DisplayFlash {
  id: string;
  text: string;
  style: FlashStyle;
  tone: FlashTone;
  startsAt: string;
  endsAt: string;
}

/* ---------- Uzaktan komutlar ve canlı durum ---------- */

export const SCREEN_COMMANDS = ['reload', 'identify', 'next', 'prev', 'pause', 'resume', 'sleep', 'wake'] as const;
export type ScreenCommand = (typeof SCREEN_COMMANDS)[number];

/** Panonun kendisi bildirir: şu an gösterdiği içerik, duraklatma ve uyku durumu (mobil uygulamadaki uzaktan kumanda için) */
export interface ScreenLiveStatus {
  slideIndex: number;
  slideCount: number;
  slideTitle: string | null;
  paused: boolean;
  sleeping: boolean;
  mode: 'board' | 'slides' | 'clock' | 'emergency';
  /** Sunucunun durumu aldığı an */
  at: string;
}

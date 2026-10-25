import { sortPeriods, type Period } from './bell.ts';

/** Panonun ekran biçimi: yatay / dikey (portre) TV, tam pano ya da yalnızca duyurular */
export interface ScreenDisplay {
  orientation: 'landscape' | 'portrait';
  mode: 'board' | 'slides';
}

export const DEFAULT_SCREEN_DISPLAY: ScreenDisplay = { orientation: 'landscape', mode: 'board' };

/** Kayıtlı değer eksik ya da artık desteklenmiyorsa varsayılana düşer */
export function resolveScreenDisplay(d: Partial<ScreenDisplay> | null | undefined): ScreenDisplay {
  return {
    orientation: d?.orientation === 'portrait' ? 'portrait' : 'landscape',
    mode: d?.mode === 'slides' ? 'slides' : 'board',
  };
}

export interface SleepSettings {
  sleepMode: 'off' | 'dim' | 'screensaver';
  /** Son dersten kaç dakika sonra uyusun */
  sleepAfterMin: number;
  /** İlk dersten kaç dakika önce uyansın */
  sleepBeforeMin: number;
  /** Hafta sonu ve tatil günlerinde gün boyu uyusun */
  sleepOffDays: boolean;
}

const toSec = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60;
};

/**
 * Gece / hafta sonu modu: pano ders dışı saatlerde kararır ya da ekran koruyucuya geçer.
 * Zil çizelgesi olmayan iş günlerinde pano hiç uyumaz (yanlışlıkla kararmasın diye).
 */
export function isSleepTime(o: {
  settings: SleepSettings;
  periods: readonly Period[] | null;
  secondsOfDay: number;
  /** Hafta sonu ya da tatil */
  offDay: boolean;
}): boolean {
  const s = o.settings;
  if (s.sleepMode === 'off') return false;
  if (o.offDay) return s.sleepOffDays;
  if (!o.periods?.length) return false;
  const sorted = sortPeriods(o.periods);
  const wake = toSec(sorted[0]!.start) - s.sleepBeforeMin * 60;
  const sleep = toSec(sorted[sorted.length - 1]!.end) + s.sleepAfterMin * 60;
  return o.secondsOfDay < wake || o.secondsOfDay >= sleep;
}

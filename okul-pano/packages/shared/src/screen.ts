import { sortPeriods, type Period } from './bell.ts';

/**
 * Panonun ekran biçimi: yatay / dikey (portre) TV, yalnızca duyuru gösteren ekran ya da
 * birden çok TV'den oluşan video duvarının bir parçası.
 */
export interface ScreenDisplay {
  orientation: 'landscape' | 'portrait';
  mode: 'board' | 'slides' | 'wall';
  /** Video duvarı: kaç sütun × kaç satır TV ve bu TV'nin yeri (0'dan başlar) */
  wallCols: number;
  wallRows: number;
  wallCol: number;
  wallRow: number;
}

export const DEFAULT_SCREEN_DISPLAY: ScreenDisplay = { orientation: 'landscape', mode: 'board', wallCols: 2, wallRows: 1, wallCol: 0, wallRow: 0 };

export function resolveScreenDisplay(d: Partial<ScreenDisplay> | null | undefined): ScreenDisplay {
  const r = { ...DEFAULT_SCREEN_DISPLAY, ...(d ?? {}) };
  r.wallCol = Math.min(r.wallCol, r.wallCols - 1);
  r.wallRow = Math.min(r.wallRow, r.wallRows - 1);
  return r;
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

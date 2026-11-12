import { sortPeriods, type Period } from './bell.ts';

/** Panonun ekran biçimi: yatay / dikey (portre) TV, tam pano, yalnızca duyurular ya da tam ekran saat */
export interface ScreenDisplay {
  orientation: 'landscape' | 'portrait';
  mode: 'board' | 'slides' | 'clock';
  /** Bu panoda gösterilen sınıflar; boş: bütün okul */
  classIds: string[];
  /**
   * Geçiş efektleri, parıltı, ilerleme çubuğu. 'auto': TV'nin tarayıcı bileşeni (WebView) güncelse açık, eskiyse
   * hafif; 'lite': kayan yazı ve video takılmasın diye kapalı.
   */
  animations: 'auto' | 'on' | 'lite';
}

export const DEFAULT_SCREEN_DISPLAY: ScreenDisplay = { orientation: 'landscape', mode: 'board', classIds: [], animations: 'auto' };

/** Bu sürümün altındaki Android WebView'larda (Chrome) animasyonlar kayan yazıyı ve videoyu takıltıyor */
export const MIN_SMOOTH_WEBVIEW = 100;

/** Tarayıcı kimliğinden Chrome / WebView ana sürümü (yoksa null) */
export function webViewVersion(userAgent: string): number | null {
  const m = /Chrome\/(\d+)/.exec(userAgent);
  return m ? Number(m[1]) : null;
}

/**
 * Pano hafif modda mı: ayar 'lite' ise evet, 'on' ise hayır; 'auto' ise yalnızca TV uygulamasında ya da Android
 * uygulama içi tarayıcıda ve WebView eskiyse (sürüm bilinmiyorsa da) hafif.
 */
export function isLiteMode(animations: ScreenDisplay['animations'], userAgent: string): boolean {
  if (animations === 'lite') return true;
  if (animations === 'on') return false;
  const tv = /OkulYayinPano/.test(userAgent) || /; wv\)/.test(userAgent);
  if (!tv) return false;
  const v = webViewVersion(userAgent);
  return v === null || v < MIN_SMOOTH_WEBVIEW;
}

/** Kayıtlı değer eksik ya da artık desteklenmiyorsa varsayılana düşer */
export function resolveScreenDisplay(d: Partial<ScreenDisplay> | null | undefined): ScreenDisplay {
  return {
    orientation: d?.orientation === 'portrait' ? 'portrait' : 'landscape',
    mode: d?.mode === 'slides' || d?.mode === 'clock' ? d.mode : 'board',
    classIds: Array.isArray(d?.classIds) ? d.classIds.filter((x): x is string => typeof x === 'string') : [],
    animations: d?.animations === 'on' || d?.animations === 'lite' ? d.animations : 'auto',
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

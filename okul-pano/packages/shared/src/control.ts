/*
 * Panoların uzaktan yönetimi: uzaktan komutlar ve panonun canlı durumu. Pano, yönetim paneli ve mobil
 * uygulama aynı tanımları kullanır.
 */

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

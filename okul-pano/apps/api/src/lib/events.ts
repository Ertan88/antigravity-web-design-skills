import { EventEmitter } from 'node:events';
import type { DisplayEvent, ScreenLiveStatus } from '@okulpano/shared';

/** Pano bu kadar süre bağlantısız kalırsa yöneticilere bildirim gider */
const OFFLINE_ALERT_MS = 10 * 60 * 1000;

/**
 * Okul bazlı canlı olay yolu. Panelde yapılan her değişiklik ekranlara SSE ile anında iletilir.
 * Tek sunucu için bellek içi; yatay ölçeklemede aynı arayüz Redis/Postgres NOTIFY ile değiştirilebilir.
 */
export class DisplayBus {
  private readonly emitter = new EventEmitter();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly online = new Map<string, number>();
  private readonly live = new Map<string, ScreenLiveStatus>();
  private readonly offlineTimers = new Map<string, NodeJS.Timeout>();
  /** Pano uzun süre bağlantısız kalınca çağrılır (telefon bildirimi) */
  onLongOffline: ((screenId: string) => void) | null = null;

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  subscribe(schoolId: string, listener: (e: DisplayEvent) => void): () => void {
    this.emitter.on(schoolId, listener);
    return () => this.emitter.off(schoolId, listener);
  }

  publish(schoolId: string, event: DisplayEvent): void {
    this.emitter.emit(schoolId, event);
  }

  /** Toplu işlemlerde ekranları yormamak için içerik olayları kısa süre biriktirilir. */
  contentChanged(schoolId: string): void {
    if (this.pending.has(schoolId)) return;
    this.pending.set(
      schoolId,
      setTimeout(() => {
        this.pending.delete(schoolId);
        this.publish(schoolId, { type: 'content' });
      }, 250),
    );
  }

  screenConnected(screenId: string): () => void {
    this.online.set(screenId, (this.online.get(screenId) ?? 0) + 1);
    clearTimeout(this.offlineTimers.get(screenId));
    this.offlineTimers.delete(screenId);
    return () => {
      const n = (this.online.get(screenId) ?? 1) - 1;
      if (n <= 0) {
        this.online.delete(screenId);
        this.live.delete(screenId);
        const timer = setTimeout(() => {
          this.offlineTimers.delete(screenId);
          if (!this.online.has(screenId)) this.onLongOffline?.(screenId);
        }, OFFLINE_ALERT_MS);
        timer.unref?.();
        this.offlineTimers.set(screenId, timer);
      } else this.online.set(screenId, n);
    };
  }

  /** Panonun bildirdiği anlık durum (gösterilen içerik, duraklatma, uyku) */
  setLiveStatus(screenId: string, status: Omit<ScreenLiveStatus, 'at'>): void {
    this.live.set(screenId, { ...status, at: new Date().toISOString() });
  }

  liveStatus(screenId: string): ScreenLiveStatus | null {
    return this.online.has(screenId) ? (this.live.get(screenId) ?? null) : null;
  }

  isOnline(screenId: string): boolean {
    return this.online.has(screenId);
  }

  close(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    for (const t of this.offlineTimers.values()) clearTimeout(t);
    this.pending.clear();
    this.offlineTimers.clear();
    this.emitter.removeAllListeners();
  }
}

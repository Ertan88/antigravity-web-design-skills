import { EventEmitter } from 'node:events';
import type { DisplayEvent } from '@okulpano/shared';

/**
 * Okul bazlı canlı olay yolu. Panelde yapılan her değişiklik ekranlara SSE ile anında iletilir.
 * Tek sunucu için bellek içi; yatay ölçeklemede aynı arayüz Redis/Postgres NOTIFY ile değiştirilebilir.
 */
export class DisplayBus {
  private readonly emitter = new EventEmitter();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly online = new Map<string, number>();

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
    return () => {
      const n = (this.online.get(screenId) ?? 1) - 1;
      if (n <= 0) this.online.delete(screenId);
      else this.online.set(screenId, n);
    };
  }

  isOnline(screenId: string): boolean {
    return this.online.has(screenId);
  }

  close(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    this.emitter.removeAllListeners();
  }
}

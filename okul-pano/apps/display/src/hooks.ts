import type { DisplayEvent, DisplayState, ScreenLiveStatus, WeatherNow } from '@okulpano/shared/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, cachedState, cacheState, fetchState, fetchWeather, postStatus, type DisplayAuth } from './api.ts';

export type Connection = 'loading' | 'live' | 'offline' | 'unauthorized';

const REFRESH_MS = 5 * 60 * 1000;
/** "Uyandır" komutu panoyu bu kadar süre uyku saatine rağmen açık tutar */
const WAKE_MS = 2 * 3600 * 1000;

/** Mobil uzaktan kumandadan gelen anlık kontroller (sayfa yenilenince sıfırlanır) */
export interface RemoteControl {
  /** Her "sonraki / önceki" komutunda artar */
  nav: { seq: number; step: 1 | -1 };
  paused: boolean;
  /** 'sleep': elle uyutuldu; 'wake': uyku saatinde elle uyandırıldı (süreli) */
  power: { state: 'sleep' | 'wake'; until: number } | null;
}

/**
 * Zaman makinesi: ?at=2026-11-02T10:45:00+03:00 ile pano o andan itibaren akıyormuş gibi gösterilir.
 * Paneldeki "belirli bir saatte önizle" özelliği ve testler için; yalnızca o cihazın görünümünü etkiler.
 */
const timeTravelOffset = (() => {
  const at = new URLSearchParams(location.search).get('at');
  const target = at ? Date.parse(at) : NaN;
  return Number.isNaN(target) ? null : target - Date.now();
})();

/**
 * Pano verisini yönetir: ilk yükleme, SSE ile anlık güncelleme, 5 dakikalık yedek yoklama,
 * internet kesilirse son kayıtlı veriyle çalışmaya devam etme ve uzaktan komutlar.
 */
export function useDisplayData(auth: DisplayAuth, onUnauthorized: () => void) {
  const cached = auth.preview ? null : cachedState();
  const [state, setState] = useState<DisplayState | null>(cached?.state ?? null);
  const [connection, setConnection] = useState<Connection>('loading');
  const [lastUpdated, setLastUpdated] = useState<number | null>(cached?.savedAt ?? null);
  const [offsetMs, setOffsetMs] = useState(timeTravelOffset ?? 0);
  const [identifyUntil, setIdentifyUntil] = useState(0);
  const [remote, setRemote] = useState<RemoteControl>({ nav: { seq: 0, step: 1 }, paused: false, power: null });
  const inflight = useRef<Promise<void> | null>(null);
  const version = useRef<string | null>(null);

  const load = useCallback(() => {
    if (inflight.current) return inflight.current;
    const started = Date.now();
    inflight.current = fetchState(auth.token)
      .then((s) => {
        const rtt = Date.now() - started;
        // Cihaz saati yanlış olsa bile zil ve geri sayımlar sunucu saatine göre çalışır
        if (timeTravelOffset === null) setOffsetMs(Date.parse(s.serverTime) + rtt / 2 - Date.now());
        // Sunucu güncellendiyse pano yeni kodu almak için kendini yeniler
        if (!auth.preview && s.appVersion) {
          if (version.current && version.current !== s.appVersion) {
            location.reload();
            return;
          }
          version.current = s.appVersion;
        }
        setState(s);
        setLastUpdated(Date.now());
        setConnection('live');
        if (!auth.preview) cacheState(s);
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          setConnection('unauthorized');
          onUnauthorized();
        } else {
          setConnection('offline');
        }
      })
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, [auth.token, auth.preview, onUnauthorized]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      source = new EventSource(`/api/display/stream?token=${encodeURIComponent(auth.token)}`);
      source.addEventListener('hello', () => {
        // Bağlantı koptuysa arada kaçan değişiklikleri al
        void load();
      });
      source.addEventListener('content', () => {
        clearTimeout(debounce);
        debounce = setTimeout(load, 400);
      });
      source.addEventListener('command', (e) => {
        const event = JSON.parse((e as MessageEvent).data) as DisplayEvent;
        if (event.type !== 'command') return;
        if (event.command === 'reload' && !auth.preview) location.reload();
        if (event.command === 'identify') setIdentifyUntil(Date.now() + 15_000);
        if (event.command === 'next' || event.command === 'prev') {
          const step = event.command === 'next' ? 1 : -1;
          setRemote((r) => ({ ...r, nav: { seq: r.nav.seq + 1, step } }));
        }
        if (event.command === 'pause' || event.command === 'resume') setRemote((r) => ({ ...r, paused: event.command === 'pause' }));
        // Elle uyutma ertesi sabaha kadar (gece yenilemesine), uyandırma iki saat sürer
        if (event.command === 'sleep') setRemote((r) => ({ ...r, power: { state: 'sleep', until: Number.POSITIVE_INFINITY } }));
        if (event.command === 'wake') setRemote((r) => ({ ...r, power: { state: 'wake', until: Date.now() + WAKE_MS } }));
      });
      source.onerror = () => {
        source?.close();
        setConnection((c) => (c === 'unauthorized' ? c : 'offline'));
        retry = setTimeout(() => {
          void load();
          connect();
        }, 10_000);
      };
    };
    connect();
    return () => {
      source?.close();
      clearTimeout(retry);
      clearTimeout(debounce);
    };
  }, [auth.token, auth.preview, load]);

  const power = remote.power && remote.power.until > Date.now() ? remote.power.state : null;
  return { state, connection, lastUpdated, offsetMs, identifying: identifyUntil > Date.now(), reload: load, remote, power };
}

/**
 * Panonun anlık durumunu sunucuya bildirir (mobil uzaktan kumanda "şu an gösterilen" bilgisini buradan alır).
 * Yalnızca değişince ve en sık 2 saniyede bir gönderilir; önizlemede gönderilmez.
 */
export function useStatusReport(auth: DisplayAuth, status: Omit<ScreenLiveStatus, 'at'> | null) {
  const key = status ? JSON.stringify(status) : '';
  // Sunucu yeniden başlarsa bellekteki durum silinir: değişmese de dakikada bir yeniden bildirilir
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (auth.preview) return;
    const t = setInterval(() => setBeat((b) => b + 1), 60_000);
    return () => clearInterval(t);
  }, [auth.preview]);
  useEffect(() => {
    if (auth.preview || !key) return;
    const t = setTimeout(() => postStatus(auth.token, JSON.parse(key)).catch(() => undefined), 1500);
    return () => clearTimeout(t);
  }, [key, beat, auth.preview, auth.token]);
}

/** Sunucu saatine göre düzeltilmiş saat; her saniye güncellenir. */
export function useClock(offsetMs: number): Date {
  const [now, setNow] = useState(() => new Date(Date.now() + offsetMs));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now() + offsetMs;
      setNow(new Date(t));
      timer = setTimeout(tick, 1000 - (t % 1000) + 5);
    };
    tick();
    return () => clearTimeout(timer);
  }, [offsetMs]);
  return now;
}

export function useWeather(token: string): WeatherNow | null {
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchWeather(token)
        .then((w) => alive && setWeather(w))
        .catch(() => {
          /* son değer kalır */
        });
    void load();
    const timer = setInterval(load, 15 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [token]);
  return weather;
}

/** Uzun süre açık kalan tarayıcılarda bellek birikimine karşı her gece 03:00'te sayfayı tazeler. */
export function useNightlyReload(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const d = new Date();
      if (d.getHours() === 3 && d.getMinutes() < 5 && Date.now() - startedAt > 3600_000) location.reload();
    }, 60_000);
    return () => clearInterval(timer);
  }, [enabled]);
}

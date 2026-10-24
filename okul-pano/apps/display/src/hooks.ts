import type { DisplayEvent, DisplayState, WeatherNow } from '@okulpano/shared/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, cachedState, cacheState, fetchState, fetchWeather, type DisplayAuth } from './api.ts';

export type Connection = 'loading' | 'live' | 'offline' | 'unauthorized';

const REFRESH_MS = 5 * 60 * 1000;

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
  const inflight = useRef<Promise<void> | null>(null);

  const load = useCallback(() => {
    if (inflight.current) return inflight.current;
    const started = Date.now();
    inflight.current = fetchState(auth.token)
      .then((s) => {
        const rtt = Date.now() - started;
        // Cihaz saati yanlış olsa bile zil ve geri sayımlar sunucu saatine göre çalışır
        if (timeTravelOffset === null) setOffsetMs(Date.parse(s.serverTime) + rtt / 2 - Date.now());
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

  return { state, connection, lastUpdated, offsetMs, identifying: identifyUntil > Date.now(), reload: load };
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

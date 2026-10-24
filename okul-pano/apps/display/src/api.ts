import type { DisplayState, WeatherNow } from '@okulpano/shared/client';

const TOKEN_KEY = 'okulpano.deviceToken';
const STATE_KEY = 'okulpano.lastState';

export class AuthError extends Error {}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* gizli pencere vb. */
  }
}

export interface DisplayAuth {
  token: string;
  /** Paneldeki önizleme: anahtar saklanmaz, önbellek kullanılmaz */
  preview: boolean;
}

/**
 * Anahtar sırası: ?preview= (panel önizlemesi) > ?key= (kurulum bağlantısı, saklanır ve adresten silinir) > kayıtlı anahtar.
 */
export function resolveAuth(): DisplayAuth | null {
  const params = new URLSearchParams(location.search);
  const preview = params.get('preview');
  if (preview) return { token: preview, preview: true };

  const key = params.get('key');
  if (key) {
    safeSet(TOKEN_KEY, key);
    params.delete('key');
    const qs = params.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
    return { token: key, preview: false };
  }
  const stored = safeGet(TOKEN_KEY);
  return stored ? { token: stored, preview: false } : null;
}

export function saveDeviceToken(token: string | null) {
  safeSet(TOKEN_KEY, token);
  if (!token) safeSet(STATE_KEY, null);
}

async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(path, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (res.status === 401) throw new AuthError('Anahtar geçersiz');
  if (!res.ok) throw new Error(`Sunucu hatası: ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchState = (token: string) => getJson<DisplayState>('/api/display/state', token);
export const fetchWeather = (token: string) => getJson<WeatherNow | null>('/api/display/weather', token);

export function cacheState(state: DisplayState) {
  safeSet(STATE_KEY, JSON.stringify({ savedAt: Date.now(), state }));
}

export function cachedState(): { savedAt: number; state: DisplayState } | null {
  const raw = safeGet(STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export interface PairingStart {
  id: string;
  code: string;
  pollSecret: string;
  expiresAt: string;
}

export async function startPairing(): Promise<PairingStart> {
  const res = await fetch('/api/display/pairings', { method: 'POST' });
  if (!res.ok) throw new Error('Eşleştirme kodu alınamadı');
  return res.json();
}

export async function pollPairing(p: PairingStart): Promise<{ status: 'pending' } | { status: 'paired'; token: string } | null> {
  const res = await fetch(`/api/display/pairings/${p.id}`, { headers: { 'x-poll-secret': p.pollSecret }, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Sunucuya ulaşılamadı');
  return res.json();
}

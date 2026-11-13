import type { DisplayState, ScreenLiveStatus, WeatherNow } from '@okulpano/shared/client';

const TOKEN_KEY = 'okulpano.deviceToken';
const STATE_KEY = 'okulpano.lastState';
/** Sunucunun geçersiz saydığı eski anahtar: eşleştirme ekranında dakikada bir yeniden denenir (yanlış alarmda geri dönülür) */
const SUSPECT_KEY = 'okulpano.suspectToken';
const SUSPECT_REASON_KEY = 'okulpano.suspectReason';

/** Sunucunun kendisi "pano anahtarı geçersiz" dedi (yanıtta device_invalid kodu) */
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

/**
 * Panelin içindeki küçük önizleme (iframe) ya da mobil uygulamanın pano ekranındaki canlı önizleme (WebView) mi.
 * Gömülü önizlemede "ÖNİZLEME · TV için panoyu eşleştirin" rozeti görünmez; uygulama anahtarı kendisi yeniler.
 */
export const embedded = (() => {
  try {
    if ((window as { ReactNativeWebView?: unknown }).ReactNativeWebView) return true;
    const params = new URLSearchParams(location.search);
    if (params.get('embed') === '1') return true;
    // Mobil uygulamanın eski sürümleri önizlemeyi ?embed=1 olmadan açar: Android'in uygulama içi tarayıcısı ("; wv)")
    // önizleme anahtarıyla açtıysa ve TV uygulaması değilse gömülü önizlemedir
    const ua = navigator.userAgent;
    if (params.has('preview') && /; wv\)/.test(ua) && !/OkulYayinPano/.test(ua)) return true;
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

/** Önizleme bağlantısına özgü adres parametreleri (anahtar, seçili pano, zaman makinesi) */
const PREVIEW_PARAMS = ['preview', 'screen', 'at', 'embed'];

/** Önizleme parametrelerini adresten siler (sayfa yenilenmez) */
export function dropPreviewParams() {
  const params = new URLSearchParams(location.search);
  for (const k of PREVIEW_PARAMS) params.delete(k);
  const qs = params.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}

// Eşleştirilmiş cihazda (TV) panelin önizleme bağlantısı yok sayılır: tarayıcı geçmişinden ya da panelden aynı adres
// yeniden açılsa da pano kendi kalıcı anahtarıyla açılır, 30 dakika sonra kararmaz. Panelin içindeki küçük önizleme
// (iframe) bundan etkilenmez.
if (!embedded && new URLSearchParams(location.search).has('preview') && safeGet(TOKEN_KEY)) dropPreviewParams();

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

/** Yeni eşleşme: kalıcı anahtar saklanır, askıdaki eski anahtar bırakılır */
export function saveDeviceToken(token: string) {
  safeSet(TOKEN_KEY, token);
  safeSet(SUSPECT_KEY, null);
  safeSet(SUSPECT_REASON_KEY, null);
}

/**
 * Sunucu anahtarı geçersiz saydı: anahtar silinmez, askıya alınır. Eşleştirme ekranı gösterilirken dakikada bir
 * denenir; yeniden geçerli olursa pano kendiliğinden geri döner. Son kaydedilen pano verisi de korunur.
 */
export function suspendDeviceToken(reason: string) {
  const token = safeGet(TOKEN_KEY);
  if (token) safeSet(SUSPECT_KEY, token);
  safeSet(SUSPECT_REASON_KEY, reason);
  safeSet(TOKEN_KEY, null);
}

export function suspectToken(): { token: string; reason: string | null } | null {
  const token = safeGet(SUSPECT_KEY);
  return token ? { token, reason: safeGet(SUSPECT_REASON_KEY) } : null;
}

/** Askıdaki anahtar yeniden geçerli: pano kaldığı yerden devam eder */
export function restoreSuspectToken(): string | null {
  const token = safeGet(SUSPECT_KEY);
  if (token) saveDeviceToken(token);
  return token;
}

/**
 * Yalnızca bizim sunucumuzun "anahtar geçersiz" yanıtı (device_invalid) eşleşmeyi askıya alır. Okul ağının ya da bir
 * vekil sunucunun (ör. kimlik doğrulama isteyen ağ) kendi 401 yanıtı bağlantı sorunu sayılır: pano son verisiyle sürer.
 */
async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(path, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (res.status === 401) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (body?.error === 'device_invalid') throw new AuthError(body.message ?? 'Anahtar geçersiz');
    throw new Error('Ağ kimlik doğrulama istedi (401); sunucuya ulaşılamadı');
  }
  if (!res.ok) throw new Error(`Sunucu hatası: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Askıdaki anahtar yeniden geçerli mi: true geçerli, false sunucu hâlâ geçersiz diyor, null ulaşılamadı */
export async function checkToken(token: string): Promise<boolean | null> {
  try {
    await getJson('/api/display/state', token);
    return true;
  } catch (err) {
    return err instanceof AuthError ? false : null;
  }
}

/** Paneldeki önizlemede belirli bir pano seçilebilir (?screen=): o panonun düzeni ve ekran biçimiyle */
export const fetchState = (token: string) => {
  // Her istekte adresten okunur: önizlemeden çıkınca (dropPreviewParams) seçili pano bırakılır
  const previewScreen = new URLSearchParams(location.search).get('screen');
  return getJson<DisplayState>(`/api/display/state${previewScreen ? `?screen=${encodeURIComponent(previewScreen)}` : ''}`, token);
};
export const fetchWeather = (token: string) => getJson<WeatherNow | null>('/api/display/weather', token);

export async function postStatus(token: string, status: Omit<ScreenLiveStatus, 'at'>) {
  const res = await fetch('/api/display/status', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(status),
  });
  if (!res.ok) throw new Error(`Durum gönderilemedi: ${res.status}`);
}

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

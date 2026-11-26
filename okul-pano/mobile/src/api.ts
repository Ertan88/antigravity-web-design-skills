import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { storage } from './storage.ts';

/**
 * Sunucu adresi kuruluma göre değişir (SaaS): girişte yazılır ve saklanır. Varsayılan, derleme sırasında
 * EXPO_PUBLIC_API_URL ile verilebilir; web sürümü (sunucunun /app/ adresi) kendi adresini kullanır.
 * Koda hiçbir okulun adresi gömülmez.
 */
export const DEFAULT_SERVER =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : '');

const KEYS = { server: 'okulpano.server', refresh: 'okulpano.refresh', school: 'okulpano.school', me: 'okulpano.me' } as const;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let server = '';
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
/** Önceden kullanılan sunucu adresleri: telefonda bunlardan biri kayıtlıysa açılışta derlemedeki adrese geçilir */
const LEGACY_SERVERS = ['https://okul-pano.onrender.com'];

let onSignedOut: (() => void) | null = null;

export const session = {
  async load() {
    // Şifreli depodan okumalar birlikte yapılır (her biri telefonda ayrı bir şifre çözme)
    const [savedServer, savedRefresh, schoolId, me] = await Promise.all([storage.get(KEYS.server), storage.get(KEYS.refresh), storage.get(KEYS.school), storage.get(KEYS.me)]);
    // Sunucu taşındıysa (eski ücretsiz barındırma → yeni adres) telefonda kayıtlı eski adres yenisine çevrilir. Eski
    // sunucunun oturumu yeni sunucuda geçmez: kişi bir kez yeniden giriş yapar.
    const moved = Boolean(DEFAULT_SERVER && savedServer && LEGACY_SERVERS.includes(savedServer) && !LEGACY_SERVERS.includes(DEFAULT_SERVER));
    if (moved) await Promise.all([storage.set(KEYS.server, DEFAULT_SERVER), storage.set(KEYS.refresh, null), storage.set(KEYS.me, null)]).catch(() => undefined);
    server = moved ? DEFAULT_SERVER : (savedServer ?? DEFAULT_SERVER);
    refreshToken = moved ? null : savedRefresh;
    return { server, hasSession: Boolean(refreshToken), schoolId, me };
  },
  /** Son bilinen kullanıcı bilgisi: açılışta ağı beklemeden ekran çizilir, arkada tazelenir */
  async setMe(json: string | null) {
    // Şifreli depo büyük değerlerde yavaşlar ve iOS'ta sınır var; çok okullu hesaplarda saklanmaz
    await storage.set(KEYS.me, json && json.length <= 2000 ? json : null).catch(() => undefined);
  },
  get server() {
    return server;
  },
  get token() {
    return accessToken;
  },
  /** Etkin hesabın yenileme anahtarı (hesap değiştirirken saklanır) */
  get refresh() {
    return refreshToken;
  },
  /**
   * Sürmekte olan oturum yenilemesini bekler. Hesap değiştirmeden önce çağrılır: yenileme yarıda kalırsa sunucu eski
   * anahtarı geçersiz kılar, yeni anahtar da başka hesabın oturumuna yazılırdı (hesap "oturum kapalı" görünürdü).
   */
  async settle() {
    if (refreshing) await refreshing.catch(() => false);
  },
  async setServer(url: string) {
    server = normalizeServer(url);
    await storage.set(KEYS.server, server);
  },
  async setTokens(access: string | null, refresh: string | null) {
    accessToken = access;
    refreshToken = refresh;
    await storage.set(KEYS.refresh, refresh);
    // Oturum kapanınca saklanan kullanıcı bilgisi de silinir
    if (!refresh) await storage.set(KEYS.me, null).catch(() => undefined);
  },
  async setSchool(id: string | null) {
    await storage.set(KEYS.school, id);
  },
  onSignedOut(fn: () => void) {
    onSignedOut = fn;
  },
};

/** "okul.example.com" → "https://okul.example.com"; sondaki eğik çizgi atılır */
export function normalizeServer(url: string): string {
  const t = url.trim().replace(/\/+$/, '');
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Görsel adresleri ("/uploads/...") sunucuya göre tam adrese çevrilir */
export const absoluteUrl = (u: string | null | undefined) => (u ? (/^https?:/i.test(u) ? u : `${server}${u}`) : null);

async function refresh(): Promise<boolean> {
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    const sent = refreshToken;
    try {
      const res = await fetch(`${server}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: sent }),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { accessToken: string; refreshToken: string };
      // Bu arada hesap değiştiyse yeni anahtar başka hesabın oturumuna yazılmaz
      if (refreshToken !== sent) return false;
      await session.setTokens(json.accessToken, json.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const send = () =>
    fetch(`${server}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers: {
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  let res: Response;
  try {
    if (!accessToken && refreshToken) await refresh();
    res = await send();
    if (res.status === 401 && refreshToken && (await refresh())) res = await send();
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı. İnternet bağlantınızı ve sunucu adresini kontrol edin.', 0);
  }
  if (res.status === 401 && path !== '/api/auth/login') {
    await session.setTokens(null, null);
    onSignedOut?.();
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) throw new ApiError(json?.message ?? `İşlem yapılamadı (${res.status})`, res.status);
  return json as T;
}

/** Kimlik doğrulamalı dosya (PDF) indirme: içerik bayt olarak döner */
export async function apiFile(path: string): Promise<ArrayBuffer> {
  const send = () => fetch(`${server}${path}`, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  let res: Response;
  try {
    if (!accessToken && refreshToken) await refresh();
    res = await send();
    if (res.status === 401 && refreshToken && (await refresh())) res = await send();
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı. İnternet bağlantınızı ve sunucu adresini kontrol edin.', 0);
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(json?.message ?? `Dosya indirilemedi (${res.status})`, res.status);
  }
  return res.arrayBuffer();
}

/** "Bu cihazı 30 gün hatırla" anahtarı: hesap başına şifreli depoda (anahtar adında yalnızca izinli karakterler) */
const trustKey = (email: string) => `okulpano.trust.${email.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_')}`;

/** İki adımlı doğrulama açıksa (ve bu telefon hatırlanmıyorsa) oturum açılmaz; kod adımı için anahtar döner */
export async function login(email: string, password: string): Promise<{ mfaToken?: string }> {
  const trustToken = (await storage.get(trustKey(email))) ?? undefined;
  const json = await api<{ accessToken?: string; refreshToken?: string; mfaRequired?: boolean; mfaToken?: string }>('/api/auth/login', {
    method: 'POST',
    body: { email, password, client: 'mobile', ...(trustToken ? { trustToken } : {}) },
  });
  if (json.mfaRequired && json.mfaToken) return { mfaToken: json.mfaToken };
  await session.setTokens(json.accessToken ?? null, json.refreshToken ?? null);
  return {};
}

export async function loginMfa(email: string, mfaToken: string, input: { code?: string; recoveryCode?: string; remember: boolean }) {
  const json = await api<{ accessToken: string; refreshToken: string; trustToken?: string }>('/api/auth/mfa', {
    method: 'POST',
    body: { mfaToken, ...input, client: 'mobile' },
  });
  if (json.trustToken) await storage.set(trustKey(email), json.trustToken);
  await session.setTokens(json.accessToken, json.refreshToken);
}

/** İki adımlı doğrulama açılınca sunucu "doğrulama açık" bilgili yeni erişim anahtarı verir */
export async function adoptAccessToken(access: string) {
  await session.setTokens(access, session.refresh);
}

/** Şifre değişince sunucu diğer oturumları kapatır; bu cihazın oturumu yeni anahtarla sürer */
/**
 * Etkin oturuma dokunmadan başka bir hesaba giriş yapar (hesap ekleme, hesap ayırma): yenileme anahtarı ve hesap
 * bilgisi döner; hesap listesine saklanır.
 */
export async function loginOther(email: string, password: string): Promise<{ refreshToken: string; me: { id: string; email: string; fullName: string; isSuperAdmin: boolean } }> {
  const res = await fetch(`${server}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password, client: 'mobile' }),
  });
  const json = (await res.json().catch(() => null)) as { accessToken?: string; refreshToken?: string; message?: string; mfaRequired?: boolean } | null;
  if (json?.mfaRequired) throw new ApiError('Bu hesapta iki adımlı doğrulama açık. Menü › Hesap değiştir › Başka hesap ekle ile giriş ekranından girin.', 400);
  if (!res.ok || !json?.accessToken || !json.refreshToken) throw new ApiError(json?.message ?? 'Giriş yapılamadı', res.status);
  const meRes = await fetch(`${server}/api/me`, { headers: { authorization: `Bearer ${json.accessToken}` } });
  const me = (await meRes.json()) as { user: { id: string; email: string; fullName: string; isSuperAdmin: boolean } };
  return { refreshToken: json.refreshToken, me: me.user };
}

/**
 * Telefonda kayıtlı, açık olmayan hesap için işlem (yenileme anahtarıyla; anahtar değişmez): bildirim bağı
 * (link/unlink) ya da okunmamış bildirim sayısı (summary).
 */
export async function deviceAccount(srv: string, refresh: string, op: 'link' | 'unlink' | 'summary', token?: string): Promise<{ unread?: number }> {
  const res = await fetch(`${srv}/api/auth/device-account`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh, op, ...(token ? { token, platform: Platform.OS } : {}) }),
  });
  const json = (await res.json().catch(() => null)) as { unread?: number; message?: string } | null;
  if (!res.ok) throw new ApiError(json?.message ?? 'İşlem yapılamadı', res.status);
  return json ?? {};
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const json = await api<{ refreshToken?: string }>('/api/me/password', { method: 'POST', body: { currentPassword, newPassword, client: 'mobile' } });
  if (json.refreshToken) await session.setTokens(null, json.refreshToken);
}

export async function logout() {
  const token = refreshToken;
  await session.setTokens(null, null);
  if (token) await fetch(`${server}/api/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) }).catch(() => undefined);
}

/** Fotoğraf yükleme (duyuru / başarı): telefonda dosya adresi, web önizlemesinde dosyanın kendisi */
/** Yüklemeden önce en uzun kenar bu boyuta indirilir (pano 1920 piksel gösterir; telefon fotoğrafları 10 MB'ı aşabiliyor) */
const UPLOAD_MAX_SIDE = 1920;

/**
 * Telefonda dosya gönderme: Expo'nun fetch'i telefondaki dosyayı ({ uri, name, type }) FormData'da desteklemez
 * ("Unsupported FormDataPart"); React Native'in XMLHttpRequest'i destekler. Oturum yenileme api() ile aynıdır.
 */
/** Yükleme aşaması: dosya gönderiliyor (gerçek yüzde) ya da gönderildi, sunucu kaydediyor (süre bilinmez) */
export type UploadProgress = { phase: 'upload'; percent: number } | { phase: 'reading' };

function sendForm(path: string, form: FormData, onProgress?: (p: UploadProgress) => void): Promise<{ status: number; json: { message?: string } | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${server}${path}`);
    if (accessToken) xhr.setRequestHeader('authorization', `Bearer ${accessToken}`);
    xhr.timeout = 90_000;
    if (onProgress) {
      onProgress({ phase: 'upload', percent: 0 });
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress({ phase: 'upload', percent: Math.min(100, Math.round((e.loaded / e.total) * 100)) });
      };
      xhr.upload.onload = () => onProgress({ phase: 'reading' });
    }
    xhr.onload = () => {
      let json: { message?: string } | null = null;
      try {
        json = JSON.parse(xhr.responseText) as { message?: string };
      } catch {
        json = null;
      }
      resolve({ status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.send(form);
  });
}

async function upload<T>(path: string, form: FormData, onProgress?: (p: UploadProgress) => void): Promise<T> {
  let res: { status: number; json: { message?: string } | null };
  try {
    if (!accessToken && refreshToken) await refresh();
    res = await sendForm(path, form, onProgress);
    if (res.status === 401 && refreshToken && (await refresh())) res = await sendForm(path, form, onProgress);
  } catch {
    throw new ApiError('Fotoğraf gönderilemedi. İnternet bağlantınızı kontrol edip yeniden deneyin.', 0);
  }
  if (res.status === 401) {
    await session.setTokens(null, null);
    onSignedOut?.();
  }
  if (res.status < 200 || res.status >= 300) throw new ApiError(res.json?.message ?? `Fotoğraf yüklenemedi (${res.status})`, res.status);
  return res.json as T;
}

export async function uploadImage(
  schoolId: string,
  asset: { uri: string; mimeType?: string | null; fileName?: string | null; file?: File; width?: number; height?: number },
  endpoint = 'uploads',
  onProgress?: (p: UploadProgress) => void,
) {
  const path = `/api/schools/${schoolId}/${endpoint}`;
  const form = new FormData();
  // Web: tarayıcının dosyası tarayıcının fetch'iyle gider. Önce belleğe okunur: Android'de Google Drive'dan seçilen
  // dosya gönderilirken okunursa istek yarıda kesilir ("sunucuya ulaşılamıyor" gibi görünür)
  if (asset.file) {
    let bytes: ArrayBuffer;
    try {
      bytes = await asset.file.arrayBuffer();
    } catch {
      throw new ApiError('Fotoğraf okunamadı. Google Drive gibi bir bulut klasöründeki dosyayı önce telefona indirip oradan seçin.', 0);
    }
    form.append('file', new File([bytes], asset.file.name, { type: asset.file.type, lastModified: asset.file.lastModified }));
    return upload<{ url: string }>(path, form, onProgress);
  }
  // Kamera fotoğrafları büyük olur: küçültülüp JPEG olarak sıkıştırılır (yükleme hızlı, sunucu sınırına takılmaz)
  let uri = asset.uri;
  let type = asset.mimeType ?? 'image/jpeg';
  let name = asset.fileName ?? 'foto.jpg';
  if (type !== 'image/gif') {
    try {
      const w = asset.width ?? 0;
      const h = asset.height ?? 0;
      const resize = Math.max(w, h) > UPLOAD_MAX_SIDE ? [{ resize: w >= h ? { width: UPLOAD_MAX_SIDE } : { height: UPLOAD_MAX_SIDE } }] : [];
      const out = await manipulateAsync(uri, resize, { compress: 0.82, format: SaveFormat.JPEG });
      uri = out.uri;
      type = 'image/jpeg';
      name = name.replace(/\.[a-z0-9]+$/i, '') + '.jpg';
    } catch {
      // Küçültülemezse özgün dosya gönderilir
    }
  }
  form.append('file', { uri, name, type } as unknown as Blob);
  if (Platform.OS === 'web') return api<{ url: string }>(path, { method: 'POST', form });
  return upload<{ url: string }>(path, form, onProgress);
}

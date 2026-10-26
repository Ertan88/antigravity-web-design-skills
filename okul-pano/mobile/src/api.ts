import { Platform } from 'react-native';
import { storage } from './storage.ts';

/**
 * Sunucu adresi kuruluma göre değişir (SaaS): girişte yazılır ve saklanır. Varsayılan, derleme sırasında
 * EXPO_PUBLIC_API_URL ile verilebilir; web sürümü (sunucunun /app/ adresi) kendi adresini kullanır.
 * Koda hiçbir okulun adresi gömülmez.
 */
export const DEFAULT_SERVER =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : '');

const KEYS = { server: 'okulpano.server', refresh: 'okulpano.refresh', school: 'okulpano.school' } as const;

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
let onSignedOut: (() => void) | null = null;

export const session = {
  async load() {
    server = (await storage.get(KEYS.server)) ?? DEFAULT_SERVER;
    refreshToken = await storage.get(KEYS.refresh);
    return { server, hasSession: Boolean(refreshToken), schoolId: await storage.get(KEYS.school) };
  },
  get server() {
    return server;
  },
  get token() {
    return accessToken;
  },
  async setServer(url: string) {
    server = normalizeServer(url);
    await storage.set(KEYS.server, server);
  },
  async setTokens(access: string | null, refresh: string | null) {
    accessToken = access;
    refreshToken = refresh;
    await storage.set(KEYS.refresh, refresh);
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
    try {
      const res = await fetch(`${server}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { accessToken: string; refreshToken: string };
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

export async function login(email: string, password: string) {
  const json = await api<{ accessToken: string; refreshToken: string }>('/api/auth/login', {
    method: 'POST',
    body: { email, password, client: 'mobile' },
  });
  await session.setTokens(json.accessToken, json.refreshToken);
}

export async function logout() {
  const token = refreshToken;
  await session.setTokens(null, null);
  if (token) await fetch(`${server}/api/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) }).catch(() => undefined);
}

/** Fotoğraf yükleme (duyuru / başarı): telefonda dosya adresi, web önizlemesinde dosyanın kendisi */
export async function uploadImage(schoolId: string, asset: { uri: string; mimeType?: string | null; fileName?: string | null; file?: File }) {
  const form = new FormData();
  if (asset.file) form.append('file', asset.file);
  else form.append('file', { uri: asset.uri, name: asset.fileName ?? 'foto.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  return api<{ url: string }>(`/api/schools/${schoolId}/uploads`, { method: 'POST', form });
}

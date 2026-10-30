/**
 * API istemcisi. Erişim anahtarı yalnızca bellekte tutulur (XSS'e karşı); yenileme anahtarı
 * httpOnly çerezdedir. 401 alınırsa bir kez sessizce yenilenir ve istek tekrarlanır.
 */

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export const sessionEvents = new EventTarget();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
}

export async function api<T = unknown>(path: string, { method = 'GET', body, form }: Options = {}): Promise<T> {
  const send = () =>
    fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });

  let res: Response;
  try {
    res = await send();
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.');
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    if (await refreshSession()) res = await send();
    else sessionEvents.dispatchEvent(new Event('expired'));
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { message?: string; issues?: { path: string; message: string }[] } | null;
  if (!res.ok) throw new ApiError(res.status, data?.message ?? 'Beklenmeyen bir hata oluştu.', data?.issues);
  return data as T;
}

export async function uploadImage(schoolId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const { url } = await api<{ url: string }>(`/api/schools/${schoolId}/uploads`, { method: 'POST', form });
  return url;
}

/**
 * Kimlik doğrulamalı dosya indirme (Excel şablonu, dışa aktarma). Dosya adı sunucunun
 * Content-Disposition başlığından alınır; Türkçe karakterler korunur.
 */
export async function downloadFile(path: string, name: string): Promise<void> {
  const send = () =>
    fetch(path, { credentials: 'same-origin', headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, data?.message ?? 'Dosya indirilemedi.');
  }
  // Dosya adını panel verir ("Okul Adı - Nöbet Çizelgesi.xlsx"); sunucunun ASCII adı yalnızca doğrudan bağlantılar için
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * İndirilen Excel dosyasının adı: "<Okul adı> - <Modül>.xlsx".
 * Dosya sistemlerinde yasak karakterler ( / \ : * ? " < > | ) atılır.
 */
export function excelFileName(schoolName: string | undefined, module: string): string {
  const clean = (t: string) => t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${[clean(schoolName ?? ''), clean(module)].filter(Boolean).join(' - ')}.xlsx`;
}

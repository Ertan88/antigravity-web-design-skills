/**
 * API istemcisi. Erişim anahtarı yalnızca bellekte tutulur (XSS'e karşı); yenileme anahtarı
 * httpOnly çerezdedir. 401 alınırsa bir kez sessizce yenilenir ve istek tekrarlanır.
 */
import { pacedUpload } from '@okulpano/shared';

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

/** Yükleme aşaması: dosya gönderiliyor (gerçek yüzde) ya da gönderildi, sunucu okuyor (süre bilinmez) */
export type UploadProgress = { phase: 'upload'; percent: number } | { phase: 'reading' };

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** Dosya yüklemesinde aşama ve gönderim yüzdesi (fetch yüzde vermez; bu durumda XMLHttpRequest kullanılır) */
  onProgress?: (p: UploadProgress) => void;
}

/** Yüzdeli gönderim: Response benzeri sonuç döner (yalnızca status ve json) */
function sendWithProgress(path: string, method: string, form: FormData, onProgress: (p: UploadProgress) => void): Promise<{ status: number; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, path);
    xhr.withCredentials = true;
    if (accessToken) xhr.setRequestHeader('authorization', `Bearer ${accessToken}`);
    // Yüzde ekranda okunabilsin diye en az ~1,2 sn gösterilir (bkz. pacedUpload)
    const pace = pacedUpload(onProgress);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) pace.progress(Math.round((e.loaded / e.total) * 100));
    };
    // Gönderim bitti: sunucu dosyayı okuyor (ne kadar süreceği bilinemez)
    xhr.upload.onload = () => pace.sent();
    xhr.onload = () => {
      pace.sent();
      void pace.ready().then(() =>
        resolve({
          status: xhr.status,
          json: async () => {
            try {
              return JSON.parse(xhr.responseText) as unknown;
            } catch {
              return null;
            }
          },
        }),
      );
    };
    xhr.onerror = () => {
      pace.stop();
      reject(new Error('network'));
    };
    xhr.send(form);
  });
}

/**
 * Formdaki dosyalar gönderilmeden önce belleğe okunur. Android'de Google Drive gibi bulut klasöründen seçilen dosya
 * telefonda hazır durmaz; tarayıcı gönderirken okumaya çalışır, bu sırada dosya bilgisi değiştiği için istek
 * yarıda kesilir ve "sunucuya ulaşılamıyor" gibi görünür. Önceden okumak dosyayı indirir ve sabitler; okunamazsa
 * kişiye ne yapacağı söylenir.
 */
async function readFormFiles(form: FormData): Promise<FormData> {
  const out = new FormData();
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      out.append(key, value);
      continue;
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await value.arrayBuffer();
    } catch {
      throw new ApiError(0, 'Dosya okunamadı. Google Drive gibi bir bulut klasöründeki dosyayı önce telefona indirin, sonra İndirilenler klasöründen seçin.');
    }
    out.append(key, new File([bytes], value.name, { type: value.type, lastModified: value.lastModified }));
  }
  return out;
}

export async function api<T = unknown>(path: string, { method = 'GET', body, form: rawForm, onProgress }: Options = {}): Promise<T> {
  const form = rawForm ? await readFormFiles(rawForm) : undefined;
  const send = (): Promise<{ status: number; ok?: boolean; json: () => Promise<unknown> }> =>
    form && onProgress ? sendWithProgress(path, method, form, onProgress) : fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });

  let res: { status: number; json: () => Promise<unknown> };
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
  if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, data?.message ?? 'Beklenmeyen bir hata oluştu.', data?.issues);
  return data as T;
}

export async function uploadImage(schoolId: string, file: File, onProgress?: (p: UploadProgress) => void): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const { url } = await api<{ url: string }>(`/api/schools/${schoolId}/uploads`, { method: 'POST', form, onProgress });
  return url;
}

/**
 * Kimlik doğrulamalı dosya indirme (Excel şablonu, dışa aktarma). Dosya adı sunucunun
 * Content-Disposition başlığından alınır; Türkçe karakterler korunur.
 */
/** Oturumla birlikte bir dosyayı indirir ve içeriğini döndürür (önizleme ve indirme için) */
export async function fetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const send = () =>
    fetch(path, { credentials: 'same-origin', signal, headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(res.status, data?.message ?? 'Dosya indirilemedi.');
  }
  return res.blob();
}

/** Elde olan bir dosyayı verilen adla kaydettirir */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFile(path: string, name: string): Promise<void> {
  // Dosya adını panel verir ("Okul Adı - Nöbet Çizelgesi.xlsx"); sunucunun ASCII adı yalnızca doğrudan bağlantılar için
  saveBlob(await fetchBlob(path), name);
}


/**
 * İndirilen Excel dosyasının adı: "<Okul adı> - <Modül>.xlsx".
 * Dosya sistemlerinde yasak karakterler ( / \ : * ? " < > | ) atılır.
 */
export function excelFileName(schoolName: string | undefined, module: string): string {
  const clean = (t: string) => t.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${[clean(schoolName ?? ''), clean(module)].filter(Boolean).join(' - ')}.xlsx`;
}

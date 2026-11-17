import { createSign } from 'node:crypto';

/**
 * Firebase Cloud Messaging (HTTP v1): sunucu, Firebase hizmet hesabıyla kısa ömürlü bir erişim anahtarı alır
 * (OAuth 2, JWT; 1 saat, önbellekte) ve her telefona ayrı istek gönderir. Hizmet hesabı yalnızca ortam değişkeninden
 * okunur (FIREBASE_SERVICE_ACCOUNT); içeriği loglanmaz, hata mesajlarına yazılmaz.
 */
export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!v.project_id || !v.client_email || !v.private_key) return null;
    return { project_id: v.project_id, client_email: v.client_email, private_key: v.private_key.replace(/\\n/g, '\n'), token_uri: v.token_uri };
  } catch {
    return null;
  }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

let cached: { email: string; token: string; until: number } | null = null;

async function accessToken(sa: ServiceAccount, fetchFn: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.until > now + 60) return cached.token;
  const aud = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetchFn(aud, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Firebase erişim anahtarı alınamadı (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { email: sa.client_email, token: json.access_token, until: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

export interface FcmMessage {
  title: string;
  body: string;
  data: Record<string, string>;
}

/**
 * Telefonlara gönderir; artık geçersiz olan (uygulama silinmiş) anahtarları döndürür ki sunucu onları silsin.
 * Bildirim, uygulamanın sesli kanalına (okul-yayin) yüksek öncelikle gider.
 */
export async function sendFcm(sa: ServiceAccount, tokens: readonly string[], msg: FcmMessage, fetchFn: typeof fetch = fetch): Promise<{ gone: string[] }> {
  if (!tokens.length) return { gone: [] };
  const auth = await accessToken(sa, fetchFn);
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`;
  const gone: string[] = [];
  await Promise.all(
    tokens.map(async (token) => {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            data: msg.data,
            android: { priority: 'HIGH', notification: { channel_id: 'okul-yayin', sound: 'okul_yayin' } },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return;
      const err = (await res.json().catch(() => null)) as { error?: { status?: string; details?: { errorCode?: string }[] } } | null;
      const code = err?.error?.details?.find((d) => d.errorCode)?.errorCode ?? err?.error?.status;
      if (code === 'UNREGISTERED' || (res.status === 404 && code === 'NOT_FOUND')) gone.push(token);
      else console.warn(`Firebase bildirimi gönderilemedi (${res.status} ${code ?? ''})`);
    }),
  );
  return { gone };
}

/** Testler için önbelleği temizler */
export function resetFcmCache() {
  cached = null;
}

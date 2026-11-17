import { generateKeyPairSync, createVerify } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { pushTokens, users } from '../src/db/schema.ts';
import { parseServiceAccount, resetFcmCache, sendFcm } from '../src/lib/fcm.ts';
import { sendToTokens } from '../src/lib/push.ts';
import { createTestApp, SUPER, type TestCtx } from './helpers.ts';

/* Doğrudan Firebase (FCM v1): erişim anahtarı (JWT), gönderim biçimi, geçersiz anahtarın silinmesi */

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = JSON.stringify({
  type: 'service_account',
  project_id: 'deneme-proje',
  client_email: 'bildirim@deneme-proje.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
});
const GOOD = `fcm_${'a'.repeat(140)}`;
const GONE = `fcm_${'b'.repeat(140)}`;

function fakeFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'erisim', expires_in: 3600 }), { status: 200 });
    const body = JSON.parse(String(init.body)) as { message: { token: string } };
    if (body.message.token === GONE)
      return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 });
    return new Response(JSON.stringify({ name: 'projects/deneme-proje/messages/1' }), { status: 200 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

let t: TestCtx;
beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await t.app.close();
  await t.database.close();
});

describe('Firebase (FCM v1)', () => {
  it('hizmet hesabı okunur; eksik ya da bozuksa kullanılmaz', () => {
    expect(parseServiceAccount(SA)?.project_id).toBe('deneme-proje');
    expect(parseServiceAccount('{"project_id":"x"}')).toBeNull();
    expect(parseServiceAccount('bozuk')).toBeNull();
    expect(parseServiceAccount(undefined)).toBeNull();
  });

  it('imzalı JWT ile erişim anahtarı alınır, bildirim yüksek öncelikle uygulamanın kanalına gider', async () => {
    resetFcmCache();
    const f = fakeFetch();
    const r = await sendFcm(parseServiceAccount(SA)!, [GOOD, GONE], { title: 'Başlık', body: 'Gövde', data: { url: '/onaylar', userId: 'u1' } }, f.fn);
    expect(r.gone).toEqual([GONE]);
    const auth = f.calls.find((c) => c.url.includes('oauth2'))!;
    const assertion = new URLSearchParams(String(auth.init.body)).get('assertion')!;
    const [h, c, sig] = assertion.split('.');
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(sig!.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))).toBe(true);
    expect(JSON.parse(Buffer.from(c!, 'base64').toString()).scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
    const send = f.calls.find((x) => x.url.includes('fcm.googleapis.com') && String(x.init.body).includes(GOOD))!;
    expect(send.url).toBe('https://fcm.googleapis.com/v1/projects/deneme-proje/messages:send');
    expect((send.init.headers as Record<string, string>).authorization).toBe('Bearer erisim');
    const msg = JSON.parse(String(send.init.body)).message;
    expect(msg.notification).toEqual({ title: 'Başlık', body: 'Gövde' });
    expect(msg.data).toEqual({ url: '/onaylar', userId: 'u1' });
    expect(msg.android).toEqual({ priority: 'HIGH', notification: { channel_id: 'okul-yayin', sound: 'okul_yayin' } });
    // Anahtar önbellekte: ikinci gönderimde yeniden alınmaz
    await sendFcm(parseServiceAccount(SA)!, [GOOD], { title: 'İki', body: 'b', data: {} }, f.fn);
    expect(f.calls.filter((x) => x.url.includes('oauth2'))).toHaveLength(1);
  });

  it('sunucu Firebase anahtarlarını Firebase ile gönderir, geçersiz olanı siler', async () => {
    resetFcmCache();
    const db = t.database.db;
    const [root] = await db.select({ id: users.id }).from(users).where(eq(users.email, SUPER.email));
    await db.insert(pushTokens).values([
      { userId: root!.id, token: GOOD, platform: 'android' },
      { userId: root!.id, token: GONE, platform: 'android' },
    ]);
    const f = fakeFetch();
    vi.stubGlobal('fetch', f.fn);
    await sendToTokens({ db, env: { ...t.app.deps.env, PUSH_URL: 'https://exp.host/--/api/v2/push/send', FIREBASE_SERVICE_ACCOUNT: SA } }, [GOOD, GONE], { title: 'T', body: 'B' });
    expect(f.calls.some((c) => c.url.includes('exp.host'))).toBe(false);
    const left = (await db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, root!.id))).map((r) => r.token);
    expect(left).toEqual([GOOD]);
  });
});

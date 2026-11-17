import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sentPushes, notifyUsers } from '../src/lib/push.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Hızlı hesap geçişi: aynı telefon iki hesaba bağlıdır, iki hesabın bildirimi de gelir; biri kaldırılınca diğeri sürer */

let t: TestCtx;
const TOKEN = 'ExponentPushToken[ayni-telefon]';
let schoolUser: { id: string; refresh: string; c: ReturnType<typeof client> };
let platformRefresh: string;
let platformId: string;

const mobileLogin = async (email: string, password: string) => {
  const res = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password, client: 'mobile' } });
  expectStatus(res, 200);
  return res.json() as { accessToken: string; refreshToken: string };
};

beforeAll(async () => {
  t = await createTestApp({ PUSH_URL: 'memory' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  expectStatus(await root.post('/api/platform/schools', { name: 'Bildirim Lisesi', slug: 'bildirim-lisesi', ownerEmail: 'okul@bildirim.test', ownerName: 'Okul Hesabı', ownerPassword: 'OkulSifre42' }), 201);
  const s = await mobileLogin('okul@bildirim.test', 'OkulSifre42');
  const c = client(t.app, s.accessToken);
  schoolUser = { id: (await c.get('/api/me')).json().user.id, refresh: s.refreshToken, c };
  const p = await mobileLogin(SUPER.email, SUPER.password);
  platformRefresh = p.refreshToken;
  platformId = (await client(t.app, p.accessToken).get('/api/me')).json().user.id;
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const sentTo = (userId: string) => sentPushes.filter((p) => p.userId === userId && p.to.includes(TOKEN));
const flush = () => new Promise((r) => setTimeout(r, 50));

describe('bir telefonda birden fazla hesap', () => {
  it('etkin hesap ve kayıtlı diğer hesap aynı telefona bağlanır; ikisinin bildirimi de gelir', async () => {
    expectStatus(await schoolUser.c.post('/api/me/push-tokens', { token: TOKEN, platform: 'android' }), 204);
    // Etkin olmayan hesap yenileme anahtarıyla bağlanır (anahtar değişmez)
    expectStatus(await t.app.inject({ method: 'POST', url: '/api/auth/device-account', payload: { refreshToken: platformRefresh, op: 'link', token: TOKEN } }), 200);
    sentPushes.length = 0;
    notifyUsers(t.app.deps, [schoolUser.id], { title: 'Deneme', body: 'Gövde', url: '/' });
    notifyUsers(t.app.deps, [platformId], { title: 'Deneme', body: 'Gövde', url: '/' });
    await flush();
    expect(sentTo(schoolUser.id)[0]?.message.title).toBe('Deneme');
    expect(sentTo(platformId)[0]?.message.title).toBe('Platform · Deneme');
    // Aynı bildirim aynı telefondaki iki hesaba birden gidiyorsa telefona bir kez gönderilir
    sentPushes.length = 0;
    notifyUsers(t.app.deps, [schoolUser.id, platformId], { title: 'Ortak', body: 'Gövde' });
    await flush();
    expect(sentPushes.filter((p) => p.to.includes(TOKEN))).toHaveLength(1);
    // Okunmamış sayısı anahtarla okunur
    const sum = await t.app.inject({ method: 'POST', url: '/api/auth/device-account', payload: { refreshToken: platformRefresh, op: 'summary' } });
    expect(typeof sum.json().unread).toBe('number');
  });

  it('bir hesap telefondan kaldırılınca yalnızca onun bildirimi kesilir', async () => {
    expectStatus(await t.app.inject({ method: 'POST', url: '/api/auth/device-account', payload: { refreshToken: platformRefresh, op: 'unlink', token: TOKEN } }), 200);
    sentPushes.length = 0;
    notifyUsers(t.app.deps, [schoolUser.id, platformId], { title: 'İkinci', body: 'Gövde' });
    await flush();
    expect(sentTo(schoolUser.id)).toHaveLength(1);
    expect(sentTo(platformId)).toHaveLength(0);
    // Geçersiz anahtarla işlem yapılamaz
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/device-account', payload: { refreshToken: 'rt_yanlis_anahtar_1234', op: 'summary' } })).statusCode).toBe(401);
  });
});

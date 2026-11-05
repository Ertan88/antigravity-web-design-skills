import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runScreenKeyExpiry, SCREEN_KEY_IDLE_DAYS } from '../src/lib/screenSecurity.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Pano güvenliği: yeni eşleşme bildirimi, anahtarın iki adresten kullanılması uyarısı, uzun süre bağlanmayan panonun anahtarı */

let t: TestCtx;
let owner: ReturnType<typeof client>;
let base: string;
let token: string;

const state = (ip: string) => t.app.inject({ method: 'GET', url: '/api/display/state', headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': ip } });
const titles = async () => {
  const r = (await owner.get(`${base}/inbox`)).json() as { items?: { title: string }[] } | { title: string }[];
  return (Array.isArray(r) ? r : (r.items ?? [])).map((n) => n.title);
};

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Güvenlik Ortaokulu', slug: 'guvenlik', ownerEmail: 'mudur@guvenlik.test', ownerName: 'Müdür', ownerPassword: 'MudurSifre42' });
  expectStatus(res, 201);
  base = `/api/schools/${res.json().id}`;
  owner = client(t.app, (await login(t.app, 'mudur@guvenlik.test', 'MudurSifre42')).token);
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('pano güvenliği', () => {
  it('yeni cihaz eşleşince ekranları yönetenlere bildirim gider', async () => {
    const start = await t.app.inject({ method: 'POST', url: '/api/display/pairings', headers: { 'x-forwarded-for': '198.51.100.10' } });
    const { id, code, pollSecret } = start.json();
    expectStatus(await owner.post(`${base}/screens/pair`, { code, name: 'Giriş Holü' }), 201);
    const paired = await t.app.inject({ method: 'GET', url: `/api/display/pairings/${id}`, headers: { 'x-poll-secret': pollSecret, 'x-forwarded-for': '198.51.100.10' } });
    token = paired.json().token;
    await new Promise((r) => setTimeout(r, 50));
    expect(await titles()).toContain('Yeni pano eşleşti');
  });

  it('aynı anahtar kısa sürede başka bir adresten kullanılırsa uyarı (günde bir kez)', async () => {
    expectStatus(await state('198.51.100.10'), 200);
    expect(await titles()).not.toContain('Pano başka bir yerden açıldı');
    expectStatus(await state('203.0.113.77'), 200);
    expect((await titles()).filter((x) => x === 'Pano başka bir yerden açıldı')).toHaveLength(1);
    // Gidip gelse de aynı gün ikinci uyarı yok
    expectStatus(await state('198.51.100.10'), 200);
    expectStatus(await state('203.0.113.77'), 200);
    expect((await titles()).filter((x) => x === 'Pano başka bir yerden açıldı')).toHaveLength(1);
  });

  it(`${SCREEN_KEY_IDLE_DAYS} gün bağlanmayan panonun anahtarı iptal edilir`, async () => {
    expect(await runScreenKeyExpiry(t.app.deps)).toBe(0);
    expect(await runScreenKeyExpiry(t.app.deps, new Date(Date.now() + (SCREEN_KEY_IDLE_DAYS + 1) * 86400_000))).toBe(1);
    expect((await state('198.51.100.10')).statusCode).toBe(401);
    const screens = (await owner.get(`${base}/screens`)).json() as { hasKey: boolean }[];
    expect(screens[0]!.hasKey).toBe(false);
    expect(await titles()).toContain('Pano anahtarı iptal edildi');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, SUPER, type TestCtx } from './helpers.ts';

/* Panelden uygulamanın web sürümüne geçiş: paneldeki çerez oturumundan ayrı bir yenileme anahtarı alınır */
let t: TestCtx;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

async function panelCookie() {
  const res = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: SUPER.email, password: SUPER.password } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'op_refresh');
  expect(cookie).toBeTruthy();
  return `op_refresh=${cookie!.value}`;
}

describe('panelden /app oturumu', () => {
  it('çerezle ve özel başlıkla yeni bir yenileme anahtarı verir; anahtar /app tarafında çalışır', async () => {
    const cookie = await panelCookie();
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/app-session', headers: { cookie, 'x-okul-handoff': '1' } });
    expect(res.statusCode).toBe(200);
    const { refreshToken, userId } = res.json() as { refreshToken: string; userId: string };
    expect(refreshToken).toMatch(/^rt/);
    expect(userId).toBeTruthy();
    // /app anahtarı gövdede gönderir (mobil istemci gibi)
    const refreshed = await t.app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().refreshToken).toBeTruthy();
    // Paneldeki oturum bozulmaz
    const panel = await t.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
    expect(panel.statusCode).toBe(200);
  });

  it('özel başlık ya da çerez yoksa reddeder', async () => {
    const cookie = await panelCookie();
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/app-session', headers: { cookie } })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/app-session', headers: { 'x-okul-handoff': '1' } })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/app-session', headers: { cookie: 'op_refresh=rt_gecersiz', 'x-okul-handoff': '1' } })).statusCode).toBe(401);
  });

  it('/indir telefon uygulamasının indirme adresine yönlendirir', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/indir' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/\.apk$/);
  });
});

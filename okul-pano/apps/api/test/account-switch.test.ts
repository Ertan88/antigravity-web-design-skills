import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountLinks } from '../src/db/schema.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Platform yöneticisinin web hesap geçişi: yalnızca platform rolüne açık, okul hesabının şifresiyle bağlanır */
let t: TestCtx;
const OWNER = { email: 'mudur@gecis.local', password: 'MudurGC123!' };

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  expectStatus(
    await root.post('/api/platform/schools', { name: 'Geçiş Okulu', slug: 'gecis-okulu', ownerEmail: OWNER.email, ownerName: 'Ayşe YILMAZ', ownerPassword: OWNER.password }),
    201,
  );
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const H = (cookie: string) => ({ cookie: `op_refresh=${cookie}`, 'x-okul-switch': '1' });
const call = (method: 'GET' | 'POST' | 'DELETE', url: string, cookie: string, payload?: object) =>
  t.app.inject({ method, url, headers: H(cookie), ...(payload ? { payload } : {}) });
const newCookie = (res: { cookies: { name: string; value: string }[] }) => res.cookies.find((c) => c.name === 'op_refresh')!.value;
const me = async (token: string) => (await client(t.app, token).get('/api/me')).json() as { user: { email: string; isSuperAdmin: boolean } };

describe('hesap geçişi', () => {
  it('özel başlık ya da çerez yoksa reddeder', async () => {
    const { refreshCookie } = await login(t.app, SUPER.email, SUPER.password);
    expect((await t.app.inject({ method: 'GET', url: '/api/auth/linked-account', headers: { cookie: `op_refresh=${refreshCookie}` } })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/switch-account', headers: { 'x-okul-switch': '1' } })).statusCode).toBe(401);
  });

  it('okul hesabı bağlantı kuramaz, geçiş yapamaz', async () => {
    const { refreshCookie } = await login(t.app, OWNER.email, OWNER.password);
    expect((await call('GET', '/api/auth/linked-account', refreshCookie)).json()).toMatchObject({ side: 'none', linked: false });
    expect((await call('POST', '/api/auth/linked-account', refreshCookie, { email: SUPER.email, password: SUPER.password })).statusCode).toBe(403);
    expect((await call('POST', '/api/auth/switch-account', refreshCookie, {})).statusCode).toBe(403);
  });

  it('yanlış şifre ve platform hesabı bağlanamaz', async () => {
    const { refreshCookie } = await login(t.app, SUPER.email, SUPER.password);
    expect((await call('POST', '/api/auth/linked-account', refreshCookie, { email: OWNER.email, password: 'yanlis-sifre' })).statusCode).toBe(400);
    expect((await call('POST', '/api/auth/linked-account', refreshCookie, { email: SUPER.email, password: SUPER.password })).statusCode).toBe(400);
  });

  it('bağlar, okul hesabına geçer, yalnızca geçişle gelen oturum geri döner', async () => {
    const { refreshCookie } = await login(t.app, SUPER.email, SUPER.password);
    const linked = await call('POST', '/api/auth/linked-account', refreshCookie, { email: OWNER.email, password: OWNER.password });
    expectStatus(linked, 200);
    expect(linked.json()).toMatchObject({ side: 'platform', linked: true, name: 'Ayşe YILMAZ', needsPassword: false });
    expect(linked.json().schoolName).toContain('Geçiş Okulu');

    const toSchool = await call('POST', '/api/auth/switch-account', refreshCookie, {});
    expectStatus(toSchool, 200);
    expect((await me(toSchool.json().accessToken)).user).toMatchObject({ email: OWNER.email, isSuperAdmin: false });
    const schoolCookie = newCookie(toSchool);
    // Eski platform oturumu kapanır
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: `op_refresh=${refreshCookie}` } })).statusCode).toBe(401);

    // Yenilenen okul oturumu geri dönüş bilgisini korur
    const refreshed = await t.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: `op_refresh=${schoolCookie}` } });
    expectStatus(refreshed, 200);
    const schoolCookie2 = newCookie(refreshed);
    expect((await call('GET', '/api/auth/linked-account', schoolCookie2)).json()).toMatchObject({ side: 'school', linked: true });

    // Okul hesabıyla doğrudan girişte dönüş yok
    const direct = await login(t.app, OWNER.email, OWNER.password);
    expect((await call('GET', '/api/auth/linked-account', direct.refreshCookie)).json()).toMatchObject({ side: 'none' });
    expect((await call('POST', '/api/auth/switch-account', direct.refreshCookie, {})).statusCode).toBe(403);

    const back = await call('POST', '/api/auth/switch-account', schoolCookie2, {});
    expectStatus(back, 200);
    expect((await me(back.json().accessToken)).user).toMatchObject({ email: SUPER.email, isSuperAdmin: true });
  });

  it('12 saatten eski doğrulamada platform şifresi sorulur', async () => {
    const { refreshCookie } = await login(t.app, SUPER.email, SUPER.password);
    await t.database.db.update(accountLinks).set({ verifiedAt: new Date(Date.now() - 13 * 3600 * 1000) });
    expect((await call('GET', '/api/auth/linked-account', refreshCookie)).json()).toMatchObject({ needsPassword: true });
    const ask = await call('POST', '/api/auth/switch-account', refreshCookie, {});
    expect(ask.statusCode).toBe(403);
    expect(ask.json().error).toBe('reauth');
    // Okul hesabının şifresi yetmez; platform hesabınınki istenir
    expect((await call('POST', '/api/auth/switch-account', refreshCookie, { password: OWNER.password })).json().error).toBe('reauth');
    const ok = await call('POST', '/api/auth/switch-account', refreshCookie, { password: SUPER.password });
    expectStatus(ok, 200);
    expect((await me(ok.json().accessToken)).user.email).toBe(OWNER.email);
  });

  it('bağlantı kaldırılınca geri dönüş de kapanır', async () => {
    const { refreshCookie } = await login(t.app, SUPER.email, SUPER.password);
    const toSchool = await call('POST', '/api/auth/switch-account', refreshCookie, {});
    expectStatus(toSchool, 200);
    const schoolCookie = newCookie(toSchool);
    const platform = await login(t.app, SUPER.email, SUPER.password);
    expect((await call('DELETE', '/api/auth/linked-account', platform.refreshCookie)).statusCode).toBe(204);
    expect(await t.database.db.select().from(accountLinks)).toHaveLength(0);
    expect((await call('POST', '/api/auth/switch-account', schoolCookie, {})).statusCode).toBe(403);
  });
});

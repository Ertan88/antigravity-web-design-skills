import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountLinks } from '../src/db/schema.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Okul hesabının şifresi değişince ya da sıfırlanınca platform bağlantısı kalkar (eski şifreyle doğrulanmıştı) */
let t: TestCtx;
const OWNER = { email: 'mudur@sifrebag.local', password: 'MudurSB123!' };
let root: ReturnType<typeof client>;
let schoolId = '';

beforeAll(async () => {
  t = await createTestApp();
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Bağ Okulu', slug: 'bag-okulu', ownerEmail: OWNER.email, ownerName: 'Ayşe YILMAZ', ownerPassword: OWNER.password });
  expectStatus(res, 201);
  schoolId = res.json().id;
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const H = (cookie: string) => ({ cookie: `op_refresh=${cookie}`, 'x-okul-switch': '1' });
const call = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object) =>
  t.app.inject({ method, url, headers: H(cookie), ...(payload ? { payload } : {}) });

describe('şifre değişince hesap bağlantısı', () => {
  it('okul hesabının şifresi değişince bağlantı kalkar', async () => {
    const { refreshCookie } = await login(t.app, SUPER.email, SUPER.password);
    expectStatus(await call('POST', '/api/auth/linked-account', refreshCookie, { email: OWNER.email, password: OWNER.password }), 200);
    const owner = client(t.app, (await login(t.app, OWNER.email, OWNER.password)).token);
    expectStatus(await owner.post('/api/me/password', { currentPassword: OWNER.password, newPassword: 'YeniMudur456!' }), 200);
    expect(await t.database.db.select().from(accountLinks)).toHaveLength(0);
    expect((await call('GET', '/api/auth/linked-account', refreshCookie)).json()).toMatchObject({ side: 'platform', linked: false });
  });

  it('platform yöneticisi okul hesabının şifresini yenileyince de bağlantı kalkar', async () => {
    const { refreshCookie } = await login(t.app, SUPER.email, SUPER.password);
    expectStatus(await call('POST', '/api/auth/linked-account', refreshCookie, { email: OWNER.email, password: 'YeniMudur456!' }), 200);
    const acc = (await root.get(`/api/platform/accounts?email=${encodeURIComponent(OWNER.email)}`)).json() as { id: string };
    expect(acc.id).toBeTruthy();
    expectStatus(await root.post(`/api/platform/accounts/${acc!.id}/password`, {}), 200);
    expect(await t.database.db.select().from(accountLinks)).toHaveLength(0);
    expect(schoolId).toBeTruthy();
  });
});

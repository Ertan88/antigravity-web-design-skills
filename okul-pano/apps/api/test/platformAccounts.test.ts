import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { memberships, users } from '../src/db/schema.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Platform: hesabı tam e-postayla bul, müdür olmayan hesabı sil, yeni şifre ver */

let t: TestCtx;
let root: ReturnType<typeof client>;
let schoolId: string;

beforeAll(async () => {
  t = await createTestApp({ SMTP_HOST: 'json' });
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Hesap Lisesi', slug: 'hesap-lisesi', ownerEmail: 'mudur@hesap.test', ownerName: 'Hesap Müdürü', ownerPassword: 'MudurSifre42' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  const owner = client(t.app, (await login(t.app, 'mudur@hesap.test', 'MudurSifre42')).token);
  expectStatus(await owner.post(`/api/schools/${schoolId}/members`, { email: 'yardimci@hesap.test', fullName: 'Yardımcı Kişi', password: 'YardimciSifre42', role: 'admin', permissions: [] }), 201);
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const find = (email: string) => root.get(`/api/platform/accounts?email=${encodeURIComponent(email)}`);

describe('platform hesap bul', () => {
  it('tam e-postayla bulur, okul ve rolü gösterir; yoksa Türkçe 404', async () => {
    const res = await find('Yardimci@Hesap.test');
    expectStatus(res, 200);
    expect(res.json()).toMatchObject({ email: 'yardimci@hesap.test', fullName: 'Yardımcı Kişi', memberships: [{ schoolName: 'Hesap Lisesi', role: 'admin' }] });
    const none = await find('yok@hesap.test');
    expect(none.statusCode).toBe(404);
    expect(none.json().message).toContain('kayıtlı hesap yok');
    expect((await find('hesap')).statusCode).toBe(400);
  });

  it('okul müdürü ve platform yöneticisi silinemez; okul yöneticileri göremez', async () => {
    const owner = (await find('mudur@hesap.test')).json();
    const res = await root.del(`/api/platform/accounts/${owner.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain('Müdürü değiştir');
    const me = (await find(SUPER.email)).json();
    expect((await root.del(`/api/platform/accounts/${me.id}`)).statusCode).toBe(400);
    const ownerC = client(t.app, (await login(t.app, 'mudur@hesap.test', 'MudurSifre42')).token);
    expect((await ownerC.get('/api/platform/accounts?email=yardimci@hesap.test')).statusCode).toBe(403);
  });

  it('yeni şifre verir, sonra hesabı siler (giriş kapanır, okul listesinden çıkar)', async () => {
    const acc = (await find('yardimci@hesap.test')).json();
    const pw = await root.post(`/api/platform/accounts/${acc.id}/password`, {});
    expectStatus(pw, 200);
    const { password } = pw.json();
    expect((await login(t.app, 'yardimci@hesap.test', password)).token).toBeTruthy();
    expectStatus(await root.del(`/api/platform/accounts/${acc.id}`), 204);
    expect((await find('yardimci@hesap.test')).statusCode).toBe(404);
    const ownerC = client(t.app, (await login(t.app, 'mudur@hesap.test', 'MudurSifre42')).token);
    const list = (await ownerC.get(`/api/schools/${schoolId}/members`)).json() as { email: string }[];
    expect(list.map((m) => m.email)).not.toContain('yardimci@hesap.test');
  });

  it('eski kayıtlardan kalan ikinci müdür kaydı silinebilir (okulun başka müdürü var)', async () => {
    const owner = client(t.app, (await login(t.app, 'mudur@hesap.test', 'MudurSifre42')).token);
    expectStatus(await owner.post(`/api/schools/${schoolId}/members`, { email: 'eskimudur@hesap.test', fullName: 'Eski Kayıt Müdür', password: 'EskiSifre4242', role: 'admin', permissions: [] }), 201);
    const db = t.app.deps.db;
    const [u] = await db.select().from(users).where(eq(users.email, 'eskimudur@hesap.test'));
    await db.update(memberships).set({ role: 'owner' }).where(eq(memberships.userId, u!.id));
    const acc = (await find('eskimudur@hesap.test')).json();
    expect(acc.memberships[0]).toMatchObject({ role: 'owner', soleOwner: false });
    expect((await find('mudur@hesap.test')).json().memberships[0].soleOwner).toBe(false);
    expectStatus(await root.del(`/api/platform/accounts/${acc.id}`), 204);
    // Artık tek müdür kalan hesap silinemez
    const left = (await find('mudur@hesap.test')).json();
    expect(left.memberships[0].soleOwner).toBe(true);
    expect((await root.del(`/api/platform/accounts/${left.id}`)).statusCode).toBe(409);
  });
});

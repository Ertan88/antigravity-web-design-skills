import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memberships, users } from '../src/db/schema.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* KVKK: platform yöneticisi hesabı okula üye olamaz; okulda da çalışan platform yöneticisi hesabını ayırır */

let t: TestCtx;
let root: ReturnType<typeof client>;
let base: string;
let schoolId: string;

beforeAll(async () => {
  t = await createTestApp();
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Ayrım Lisesi', slug: 'ayrim-lisesi', ownerEmail: 'mudur@ayrim.test', ownerName: 'Müdür', ownerPassword: 'MudurSifre42' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  base = `/api/schools/${schoolId}`;
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('platform ve okul hesabı ayrımı', () => {
  it('platform yöneticisi okula üye yapılamaz, okul müdürü de olamaz', async () => {
    const owner = client(t.app, (await login(t.app, 'mudur@ayrim.test', 'MudurSifre42')).token);
    const add = await owner.post(`${base}/members`, { email: SUPER.email, fullName: 'Kök', role: 'editor', permissions: [] });
    expect(add.statusCode).toBe(400);
    expect(add.json().message).toContain('Platform yöneticisi');
    const school = await root.post('/api/platform/schools', { name: 'Başka Lise', slug: 'baska-lise', ownerEmail: SUPER.email, ownerName: 'Kök', ownerPassword: 'X' });
    expect(school.statusCode).toBe(400);
  });

  it('okula üye (eski kayıt) platform yöneticisi hesabını ayırır: okul hesabı kalır, platform yeni e-postaya geçer', async () => {
    const db = t.database.db;
    const [rootUser] = await db.select().from(users).where(eq(users.email, SUPER.email));
    // Kural öncesinden kalan üyelik
    await db.insert(memberships).values({ userId: rootUser!.id, schoolId, role: 'editor', permissions: [] });

    expect((await root.post('/api/platform/split', { email: 'platform@test.local', password: 'PlatformSifre42', currentPassword: 'yanlis' })).statusCode).toBe(400);
    expect((await root.post('/api/platform/split', { email: 'mudur@ayrim.test', password: 'PlatformSifre42', currentPassword: SUPER.password })).statusCode).toBe(409);
    const ok = await root.post('/api/platform/split', { email: 'platform@test.local', password: 'PlatformSifre42', currentPassword: SUPER.password });
    expectStatus(ok, 200);
    expect(ok.json().platformEmail).toBe('platform@test.local');

    // Eski hesap okul hesabıdır: yeniden girişte platform yetkisi yok, okulu görür
    const schoolAcc = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
    const me = (await schoolAcc.get('/api/me')).json();
    expect(me.user.isSuperAdmin).toBe(false);
    expect(me.schools.map((s: { id: string }) => s.id)).toEqual([schoolId]);
    expect((await schoolAcc.get('/api/platform/accounts?email=mudur@ayrim.test')).statusCode).toBe(403);

    // Yeni hesap platform yöneticisidir, okula üye değildir
    const platform = client(t.app, (await login(t.app, 'platform@test.local', 'PlatformSifre42')).token);
    const pm = (await platform.get('/api/me')).json();
    expect(pm.user.isSuperAdmin).toBe(true);
    expect(pm.schools.filter((s: { support?: boolean }) => !s.support)).toHaveLength(0);
    // Okul hesabı artık ayıramaz (platform yöneticisi değil)
    expect((await schoolAcc.post('/api/platform/split', { email: 'x@test.local', password: 'Sifre12345', currentPassword: SUPER.password })).statusCode).toBe(403);
  });
});

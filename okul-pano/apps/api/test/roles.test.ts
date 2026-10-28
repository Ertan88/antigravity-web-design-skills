import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
let admin: ReturnType<typeof client>;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Rol Ortaokulu', slug: 'rol', ownerEmail: 'mudur@rol.local', ownerName: 'Müdür', ownerPassword: 'RolMudur2026!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@rol.local', 'RolMudur2026!')).token);
  expectStatus(await owner.post(path('members'), { email: 'yard@rol.local', fullName: 'Müdür Yardımcısı', role: 'admin', password: 'Yardimci2026!' }), 201);
  admin = client(t.app, (await login(t.app, 'yard@rol.local', 'Yardimci2026!')).token);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('roller', () => {
  it('yönetici editör ekler ve yetki verir; yönetici atayamaz, yöneticileri değiştiremez', async () => {
    expect((await admin.post(path('members'), { email: 'baska@rol.local', fullName: 'Başka Yönetici', role: 'admin', password: 'Baska2026!x' })).statusCode).toBe(403);
    const ed = await admin.post(path('members'), { email: 'editor@rol.local', fullName: 'Editör', role: 'editor', permissions: ['announcements.manage'], password: 'Editor2026!' });
    expectStatus(ed, 201);
    expectStatus(await admin.patch(path(`members/${ed.json().id}`), { permissions: ['announcements.manage', 'highlights.manage'] }), 200);
    expect((await admin.patch(path(`members/${ed.json().id}`), { role: 'admin' })).statusCode).toBe(403);
    // Müdür yönetici atar
    expectStatus(await owner.patch(path(`members/${ed.json().id}`), { role: 'admin' }), 200);
    expect((await admin.patch(path(`members/${ed.json().id}`), { role: 'editor' })).statusCode).toBe(403);
  });

  it('destek erişimini yalnızca okul sahibi (müdür) verir', async () => {
    expect((await admin.post(path('support-access'), { hours: 24 })).statusCode).toBe(403);
    expectStatus(await owner.post(path('support-access'), { hours: 24 }), 200);
    expectStatus(await owner.post(path('support-access'), { hours: 0 }), 200);
  });

  it('herkes profilini günceller; e-posta değişikliği şifreyle onaylanır', async () => {
    const res = await admin.patch('/api/me', { fullName: 'Ayşe Yardımcı' });
    expect(res.json()).toMatchObject({ fullName: 'Ayşe Yardımcı', email: 'yard@rol.local' });
    expect((await admin.patch('/api/me', { email: 'yeni@rol.local' })).statusCode).toBe(400);
    expect((await admin.patch('/api/me', { email: 'mudur@rol.local', currentPassword: 'Yardimci2026!' })).statusCode).toBe(409);
    expect((await admin.patch('/api/me', { email: 'yeni@rol.local', currentPassword: 'Yardimci2026!' })).json()).toMatchObject({ email: 'yeni@rol.local' });
    expectStatus(await admin.post('/api/me/password', { currentPassword: 'Yardimci2026!', newPassword: 'YeniSifre2026!' }), 200);
    expect((await login(t.app, 'yeni@rol.local', 'YeniSifre2026!')).token).toBeTruthy();
  });
});

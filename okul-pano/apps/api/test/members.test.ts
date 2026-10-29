import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

beforeAll(async () => {
  // SMTP_HOST=json: e-posta gerçekten gönderilmeden üretilir
  t = await createTestApp({ SMTP_HOST: 'json' });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Şifre Okulu', slug: 'sifre-okulu', ownerEmail: 'mudur@sifre.local', ownerName: 'Müdür', ownerPassword: 'MudurSF123!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@sifre.local', 'MudurSF123!')).token);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const tryLogin = (email: string, password: string) => t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });

describe('kullanıcı şifreleri', () => {
  it('yönetici şifreyi sıfırlar: eski şifre geçersiz, yenisi geçerli, e-postayla gönderilebilir', async () => {
    const created = await owner.post(path('members'), { email: 'ogretmen@sifre.local', fullName: 'Ayşe Öğretmen', password: 'IlkSifre123', role: 'editor', permissions: [] });
    expectStatus(created, 201);
    expect(created.json().existingUser).toBe(false);
    const memberId = created.json().id as string;
    const teacher = client(t.app, (await login(t.app, 'ogretmen@sifre.local', 'IlkSifre123')).token);

    // Kendi şifresini mevcut şifreyle değiştirir
    expectStatus(await teacher.post('/api/me/password', { currentPassword: 'IlkSifre123', newPassword: 'IkinciSifre456' }), 200);
    expect((await teacher.post('/api/me/password', { currentPassword: 'IlkSifre123', newPassword: 'X'.repeat(9) })).statusCode).toBe(400);

    const reset = await owner.post(path(`members/${memberId}/password`), { sendEmail: true });
    expectStatus(reset, 200);
    const { password, emailed } = reset.json() as { password: string; emailed: boolean };
    expect(emailed).toBe(true);
    expect(password).toMatch(/^[A-Za-z2-9]{10}$/);
    expect((await tryLogin('ogretmen@sifre.local', 'IkinciSifre456')).statusCode).toBe(401);
    expect((await tryLogin('ogretmen@sifre.local', password)).statusCode).toBe(200);

    // Belirli bir şifre de verilebilir
    expectStatus(await owner.post(path(`members/${memberId}/password`), { password: 'BelirliSifre789' }), 200);
    expect((await tryLogin('ogretmen@sifre.local', 'BelirliSifre789')).statusCode).toBe(200);
  });

  it('davet yoksa ve şifre verilmezse geçici şifre üretilir ve bir kez döner (mobil uygulama)', async () => {
    const res = await owner.post(path('members'), { email: 'uretilen@sifre.local', fullName: 'Üretilen Şifre', role: 'editor', permissions: [] });
    expectStatus(res, 201);
    const { password, existingUser } = res.json() as { password: string; existingUser: boolean };
    expect(existingUser).toBe(false);
    expect(password).toMatch(/^[A-Za-z2-9]{10}$/);
    expect((await tryLogin('uretilen@sifre.local', password)).statusCode).toBe(200);
    // Şifre verilince yanıtta şifre dönmez
    const given = await owner.post(path('members'), { email: 'verilen@sifre.local', fullName: 'Verilen Şifre', password: 'VerilenSifre123', role: 'editor', permissions: [] });
    expect(given.json().password).toBeUndefined();
  });

  it('sistemde kayıtlı e-posta eklenince girilen şifre kullanılmaz ve bu bildirilir', async () => {
    const res = await owner.post(path('members'), { email: SUPER.email, fullName: 'Kök', password: 'BaskaSifre123', role: 'editor', permissions: [] });
    expectStatus(res, 201);
    expect(res.json().existingUser).toBe(true);
    expect((await tryLogin(SUPER.email, SUPER.password)).statusCode).toBe(200);
  });

  it('okul sahibinin ve kendi şifresi buradan sıfırlanamaz', async () => {
    const members = (await owner.get(path('members'))).json() as { id: string; role: string }[];
    const own = members.find((m) => m.role === 'owner')!;
    expect((await owner.post(path(`members/${own.id}/password`), {})).statusCode).toBe(403);
  });
});

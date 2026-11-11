import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let schoolId: string;
let owner: ReturnType<typeof client>;
let root: ReturnType<typeof client>;
const path = (p: string) => `/api/schools/${schoolId}/${p}`;

beforeAll(async () => {
  // SMTP_HOST=json: e-posta gerçekten gönderilmeden üretilir
  t = await createTestApp({ SMTP_HOST: 'json' });
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
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

  it('okul müdürünün ve kendi şifresi buradan sıfırlanamaz', async () => {
    const members = (await owner.get(path('members'))).json() as { id: string; role: string }[];
    const own = members.find((m) => m.role === 'owner')!;
    expect((await owner.post(path(`members/${own.id}/password`), {})).statusCode).toBe(403);
  });
});

describe('silinen kullanıcıyı yeniden ekleme', () => {
  type Row = { id: string; email: string; fullName: string; invitePending: boolean };
  const list = async () => (await owner.get(path('members'))).json() as Row[];

  it('başka okulda hesabı yoksa silinince hesabı da kalkar; yeniden eklenince yeni ad ve davetle açılır', async () => {
    const first = await owner.post(path('members'), { email: 'eski@sifre.local', fullName: 'Eski Ad', password: 'EskiSifre123', role: 'editor', permissions: [] });
    expectStatus(first, 201);
    const m = (await list()).find((r) => r.email === 'eski@sifre.local')!;
    expectStatus(await owner.del(path(`members/${m.id}`)), 204);
    expect((await tryLogin('eski@sifre.local', 'EskiSifre123')).statusCode).toBe(401);

    const again = await owner.post(path('members'), { email: 'eski@sifre.local', fullName: 'Yeni Ad', role: 'editor', permissions: [], invite: true });
    expectStatus(again, 201);
    expect(again.json()).toMatchObject({ existingUser: false });
    expect(again.json().invite.inviteUrl).toBeTruthy();
    expect((await list()).find((r) => r.email === 'eski@sifre.local')).toMatchObject({ fullName: 'Yeni Ad', invitePending: true });
  });

  it('daha önce sahipsiz kalmış hesap da yeni hesap gibi ele alınır (eski şifre geçersiz olur)', async () => {
    const { users } = await import('../src/db/schema.ts');
    await t.database.db.insert(users).values({ email: 'sahipsiz@sifre.local', fullName: 'Eski İsim', passwordHash: 'x' });
    const res = await owner.post(path('members'), { email: 'sahipsiz@sifre.local', fullName: 'Doğru İsim', password: 'DogruSifre123', role: 'editor', permissions: [] });
    expect(res.json().existingUser).toBe(false);
    expect((await list()).find((r) => r.email === 'sahipsiz@sifre.local')?.fullName).toBe('Doğru İsim');
    expect((await tryLogin('sahipsiz@sifre.local', 'DogruSifre123')).statusCode).toBe(200);
  });

  it('başka okulda hesabı olan kişinin adı ve şifresi değişmez; silinince yalnızca bu okuldan çıkar', async () => {
    expectStatus(await root.post('/api/platform/schools', { name: 'Diğer Okul', slug: 'diger-okul', ownerEmail: 'iki@okul.local', ownerName: 'İki Okullu', ownerPassword: 'IkiOkul123!' }), 201);
    const res = await owner.post(path('members'), { email: 'iki@okul.local', fullName: 'Başka Ad', password: 'BaskaSifre123', role: 'editor', permissions: [] });
    expect(res.json().existingUser).toBe(true);
    const m = (await list()).find((r) => r.email === 'iki@okul.local')!;
    expect(m.fullName).toBe('İki Okullu');
    expectStatus(await owner.del(path(`members/${m.id}`)), 204);
    // Hesap ve diğer okuldaki bağı durur (giriş deneme sınırına takılmamak için veritabanından bakılır)
    const { users } = await import('../src/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    const [u] = await t.database.db.select({ fullName: users.fullName }).from(users).where(eq(users.email, 'iki@okul.local'));
    expect(u?.fullName).toBe('İki Okullu');
  });
});

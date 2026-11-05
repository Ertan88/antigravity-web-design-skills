import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* Öğretmen hesabı açma: kişi başı giriş kodu (A) ve toplantı QR'ı + onay (B); e-posta doğrulama kodu */

let t: TestCtx;
let owner: ReturnType<typeof client>;
let anon: ReturnType<typeof client>;
let base: string;
const ids: Record<string, string> = {};
const mails: { to: string; text: string }[] = [];

beforeAll(async () => {
  // E-posta Brevo üzerinden gidiyormuş gibi: istekler yakalanır, doğrulama kodu e-postadan okunur
  t = await createTestApp({ PUSH_URL: 'memory', BREVO_API_KEY: 'test-key', BREVO_API_URL: 'https://brevo.test/send' });
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) === 'https://brevo.test/send') {
      const body = JSON.parse(String(init?.body)) as { to: { email: string }[]; textContent: string };
      mails.push({ to: body.to[0]!.email, text: body.textContent });
      return new Response('{}', { status: 201 });
    }
    return realFetch(input, init);
  });
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Katılım Lisesi', slug: 'katilim-lisesi', ownerEmail: 'mudur@katilim.test', ownerName: 'Müdür Bey', ownerPassword: 'MudurSifre42' });
  base = `/api/schools/${res.json().id}`;
  owner = client(t.app, (await login(t.app, 'mudur@katilim.test', 'MudurSifre42')).token);
  anon = client(t.app, '');
  const title = (await owner.post(`${base}/teacher-titles`, { name: 'Müdür Yardımcısı Örnek' })).json();
  ids.title = title.id;
  for (const [key, body] of Object.entries({
    ayse: { fullName: 'Ayşe Kodlu', email: 'ayse.kadro@okul.test', phone: '0555 111 22 33' },
    kerem: { fullName: 'Kerem Toplantı', titleId: title.id },
    deniz: { fullName: 'Deniz Başka' },
  })) {
    const r = await owner.post(`${base}/teachers`, body);
    expectStatus(r, 201);
    ids[key] = r.json().id;
  }
  // Ünvan → önerilen rol eşleştirmesi okul ayarından
  expectStatus(await owner.patch(base, { settings: { titleRoles: { [title.id]: 'admin' } } }), 200);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await t.app.close();
  await t.database.close();
});

const lastCode = (email: string) => /kodunuz: (\d{6})/.exec([...mails].reverse().find((m) => m.to === email)?.text ?? '')?.[1];

describe('kadro iletişim bilgisi', () => {
  it('e-posta ve telefon yalnızca yetkiliye görünür', async () => {
    const list = (await owner.get(`${base}/teachers`)).json() as { id: string; email: string | null; phone: string | null }[];
    expect(list.find((x) => x.id === ids.ayse)).toMatchObject({ email: 'ayse.kadro@okul.test', phone: '05551112233' });
  });
});

describe('A · kişi başı giriş kodu', () => {
  let code: string;
  it('yetkili kod üretir; kod bir kez kullanılır', async () => {
    const res = await owner.post(`${base}/enrollments/code`, { teacherId: ids.ayse, role: 'teacher' });
    expectStatus(res, 200);
    code = res.json().code;
    expect(code).toHaveLength(8);
    expect(res.json().url).toContain(`/app/katil?kod=${code}`);
    const start = await anon.post('/api/enroll/code', { code });
    expectStatus(start, 200);
    expect(start.json()).toMatchObject({ fullName: 'Ayşe Kodlu', suggestedEmail: 'ayse.kadro@okul.test', kind: 'code' });
    expectStatus(await anon.post('/api/enroll/code', { code }), 401);
    ids.tokenA = start.json().token;
  });

  it('e-postaya doğrulama kodu gider; yanlış kod reddedilir; doğru kodla hesap açılır', async () => {
    const em = await anon.post('/api/enroll/email', { token: ids.tokenA, email: 'Ayse.Yeni@okul.test' });
    expectStatus(em, 200);
    expect(em.json()).toMatchObject({ verify: true, existing: false });
    const real = lastCode('ayse.yeni@okul.test')!;
    expect(real).toMatch(/^\d{6}$/);
    expectStatus(await anon.post('/api/enroll/finish', { token: ids.tokenA, emailCode: real === '000000' ? '111111' : '000000', password: 'YeniSifre42' }), 401);
    const fin = await anon.post('/api/enroll/finish', { token: ids.tokenA, emailCode: real, password: 'YeniSifre42' });
    expectStatus(fin, 200);
    expect(fin.json().status).toBe('done');
    const me = client(t.app, (await login(t.app, 'ayse.yeni@okul.test', 'YeniSifre42')).token);
    const meRes = (await me.get('/api/me')).json();
    expect(meRes.schools[0]).toMatchObject({ role: 'editor', teacherId: ids.ayse });
    // Kadro kartına doğrulanan e-posta yazılır
    const list = (await owner.get(`${base}/teachers`)).json() as { id: string; email: string | null }[];
    expect(list.find((x) => x.id === ids.ayse)?.email).toBe('ayse.yeni@okul.test');
    // Hesabı olan öğretmene yeniden kod verilmez
    expectStatus(await owner.post(`${base}/enrollments/code`, { teacherId: ids.ayse }), 409);
  });
});

describe('B · toplantı QR’ı ve onay', () => {
  let link: string;
  it('QR hesabı olmayan öğretmenleri listeler; seçilen öğretmen onaya düşer', async () => {
    const res = await owner.post(`${base}/enrollments/meeting`, {});
    link = new URL(res.json().url).searchParams.get('okul')!;
    const list = await anon.post('/api/enroll/meeting', { link });
    expectStatus(list, 200);
    const names = (list.json().teachers as { fullName: string }[]).map((x) => x.fullName);
    expect(names).toEqual(['Deniz Başka', 'Kerem Toplantı']);
    const start = await anon.post('/api/enroll/meeting/start', { link, teacherId: ids.kerem });
    expectStatus(start, 200);
    const token = start.json().token;
    expectStatus(await anon.post('/api/enroll/email', { token, email: 'kerem@okul.test' }), 200);
    const fin = await anon.post('/api/enroll/finish', { token, emailCode: lastCode('kerem@okul.test'), password: 'KeremSifre42' });
    expect(fin.json().status).toBe('pending');
    // Onaylanmadan giriş yapılamaz
    expectStatus(await anon.post('/api/auth/login', { email: 'kerem@okul.test', password: 'KeremSifre42' }), 401);
    // Onay bekleyen öğretmen QR listesinden düşer
    expect(((await anon.post('/api/enroll/meeting', { link })).json().teachers as { fullName: string }[]).map((x) => x.fullName)).toEqual(['Deniz Başka']);
  });

  it('yetkili onaylar; ünvandan önerilen rol (Yönetici) uygulanır', async () => {
    const pending = (await owner.get(`${base}/enrollments`)).json().items as { id: string; status: string; role: string; email: string }[];
    const p = pending.find((x) => x.status === 'pending')!;
    expect(p).toMatchObject({ email: 'kerem@okul.test', role: 'admin' });
    expectStatus(await owner.post(`${base}/enrollments/${p.id}/approve`, {}), 200);
    const me = client(t.app, (await login(t.app, 'kerem@okul.test', 'KeremSifre42')).token);
    expect((await me.get('/api/me')).json().schools[0]).toMatchObject({ role: 'admin', teacherId: ids.kerem });
  });

  it('başka bir hesaba ait e-posta için o hesabın şifresi istenir', async () => {
    const start = await anon.post('/api/enroll/meeting/start', { link, teacherId: ids.deniz });
    const token = start.json().token;
    const em = await anon.post('/api/enroll/email', { token, email: 'mudur@katilim.test' });
    expect(em.json()).toMatchObject({ existing: true });
    expectStatus(await anon.post('/api/enroll/finish', { token, existingPassword: 'yanlis-sifre' }), 401);
  });

  it('süresi kapatılan QR çalışmaz', async () => {
    expectStatus(await owner.del(`${base}/enrollments/meeting`), 204);
    expectStatus(await anon.post('/api/enroll/meeting', { link }), 401);
  });
});

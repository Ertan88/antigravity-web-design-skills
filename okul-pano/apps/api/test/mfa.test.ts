import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '../src/db/schema.ts';
import { base32Encode, currentStep, totpAt, verifyTotp } from '../src/lib/totp.ts';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

/* İki adımlı doğrulama (doğrulayıcı uygulama, yedek kod, cihazı hatırla) ve Oturumlarım */
let t: TestCtx;
let root: ReturnType<typeof client>;
const OWNER = { email: 'mudur@mfa.local', password: 'MudurMF123!' };

beforeAll(async () => {
  t = await createTestApp();
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  expectStatus(await root.post('/api/platform/schools', { name: 'Kod Okulu', slug: 'kod-okulu', ownerEmail: OWNER.email, ownerName: 'Ayşe YILMAZ', ownerPassword: OWNER.password }), 201);
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const rawLogin = (payload: object, cookie?: string) =>
  t.app.inject({ method: 'POST', url: '/api/auth/login', payload, ...(cookie ? { headers: { cookie } } : {}) });
let secret = '';
let recovery: string[] = [];

describe('doğrulayıcı kodu', () => {
  it('RFC 6238 örneğiyle aynı kodu üretir; aynı adım ikinci kez kabul edilmez', () => {
    const s = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpAt(s, 1)).toBe('287082');
    const now = 59_000;
    expect(verifyTotp(s, '287082', { now })).toBe(1);
    expect(verifyTotp(s, '287082', { now, afterStep: 1 })).toBeNull();
    expect(verifyTotp(s, '12345', { now })).toBeNull();
  });
});

describe('iki adımlı doğrulama', () => {
  it('şifreyle kurulur, kodla açılır, 10 yedek kod verir', async () => {
    const owner = client(t.app, (await login(t.app, OWNER.email, OWNER.password)).token);
    expect((await owner.post('/api/me/mfa/setup', { password: 'yanlis' })).statusCode).toBe(400);
    const setup = await owner.post('/api/me/mfa/setup', { password: OWNER.password });
    expectStatus(setup, 200);
    secret = setup.json().secret;
    expect(setup.json().otpauthUrl).toContain('otpauth://totp/');
    expect((await owner.post('/api/me/mfa/enable', { code: '000000' })).statusCode).toBe(400);
    const en = await owner.post('/api/me/mfa/enable', { code: totpAt(secret, currentStep()) });
    expectStatus(en, 200);
    recovery = en.json().recoveryCodes;
    expect(recovery).toHaveLength(10);
    expect((await owner.get('/api/me')).json().user.mfaEnabled).toBe(true);
  });

  it('girişte oturum açılmaz, kod istenir; doğru kodla ve "hatırla" ile cihaz hatırlanır', async () => {
    const first = await rawLogin(OWNER);
    expectStatus(first, 200);
    expect(first.json().mfaRequired).toBe(true);
    expect(first.json().accessToken).toBeUndefined();
    expect(first.cookies.find((c) => c.name === 'op_refresh')).toBeUndefined();
    const { mfaToken } = first.json();
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/mfa', payload: { mfaToken, code: '111111' } })).statusCode).toBe(400);
    const ok = await t.app.inject({ method: 'POST', url: '/api/auth/mfa', payload: { mfaToken, code: totpAt(secret, currentStep() + 1), remember: true } });
    expectStatus(ok, 200);
    expect(ok.json().accessToken).toBeTruthy();
    const trust = ok.cookies.find((c) => c.name === 'op_trust');
    expect(trust).toBeTruthy();
    // Aynı kod ikinci kez işe yaramaz
    const again = await rawLogin(OWNER);
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/mfa', payload: { mfaToken: again.json().mfaToken, code: totpAt(secret, currentStep() + 1) } })).statusCode).toBe(400);
    // Hatırlanan cihazda kod sorulmaz
    const remembered = await rawLogin(OWNER, `op_trust=${trust!.value}`);
    expect(remembered.json().accessToken).toBeTruthy();
  });

  it('yedek kod bir kez çalışır; mobilde hatırlama anahtarı gövdede döner', async () => {
    const a = await rawLogin({ ...OWNER, client: 'mobile' });
    const ok = await t.app.inject({ method: 'POST', url: '/api/auth/mfa', payload: { mfaToken: a.json().mfaToken, recoveryCode: recovery[0]!.toLowerCase(), remember: true, client: 'mobile' } });
    expectStatus(ok, 200);
    expect(ok.json().refreshToken).toBeTruthy();
    const trustToken = ok.json().trustToken as string;
    expect(trustToken).toMatch(/^td_/);
    const b = await rawLogin({ ...OWNER, client: 'mobile' });
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/mfa', payload: { mfaToken: b.json().mfaToken, recoveryCode: recovery[0] } })).statusCode).toBe(400);
    expect((await rawLogin({ ...OWNER, client: 'mobile', trustToken })).json().refreshToken).toBeTruthy();
  });

  it('art arda 5 hatalı kodda bekletir', async () => {
    const a = await rawLogin({ ...OWNER, client: 'mobile', trustToken: 'td_yok' });
    const results: number[] = [];
    for (let i = 0; i < 6; i++) results.push((await t.app.inject({ method: 'POST', url: '/api/auth/mfa', payload: { mfaToken: a.json().mfaToken, code: '999999' } })).statusCode);
    expect(results.at(-1)).toBe(429);
  });
});

describe('Oturumlarım', () => {
  it('oturumları listeler, bu cihazı işaretler, diğerlerini kapatır', async () => {
    const mine = await login(t.app, SUPER.email, SUPER.password);
    const c = client(t.app, mine.token);
    const sec = (await c.get('/api/me/security')).json() as { sessions: { id: string; current: boolean; device: string }[] };
    expect(sec.sessions.length).toBeGreaterThan(1);
    const current = sec.sessions.filter((s) => s.current);
    expect(current).toHaveLength(1);
    expect((await c.del(`/api/me/sessions/${current[0]!.id}`)).statusCode).toBe(400);
    const other = sec.sessions.find((s) => !s.current)!;
    expect((await c.del(`/api/me/sessions/${other.id}`)).statusCode).toBe(204);
    expectStatus(await c.post('/api/me/sessions/others', {}), 200);
    const after = (await c.get('/api/me/security')).json() as { sessions: unknown[] };
    expect(after.sessions).toHaveLength(1);
    // Kendi oturumu çalışmaya devam eder
    expect((await t.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: `op_refresh=${mine.refreshCookie}` } })).statusCode).toBe(200);
  });

  it('platform yöneticisi okul hesabının doğrulamasını kapatabilir', async () => {
    // Erişim anahtarı oturumdan bağımsızdır (15 dk); giriş hız sınırına takılmamak için ilk anahtar kullanılır
    const admin = root;
    const acc = (await admin.get(`/api/platform/accounts?email=${encodeURIComponent(OWNER.email)}`)).json() as { id: string; mfaEnabled: boolean };
    expect(acc.mfaEnabled).toBe(true);
    expectStatus(await admin.post(`/api/platform/accounts/${acc.id}/mfa-reset`, {}), 200);
    // (Bu dosyada giriş hız sınırına yaklaşıldığı için yeniden giriş yerine kayıt denetlenir)
    const [row] = await t.database.db.select().from(users).where(eq(users.email, OWNER.email));
    expect(row!.totpSecret).toBeNull();
    expect(row!.totpEnabledAt).toBeNull();
  });
});

describe('platform yöneticisinde zorunlu', () => {
  it('doğrulama açılmadan platform uçları kapalı, /api/me açık; açınca yeni anahtarla açılır', async () => {
    const strict = await createTestApp({ PLATFORM_MFA: 'required' });
    try {
      const c = client(strict.app, (await login(strict.app, SUPER.email, SUPER.password)).token);
      const blocked = await c.get('/api/platform/schools');
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().error).toBe('mfa_setup');
      expect((await c.get('/api/me')).json().user.mfaRequired).toBe(true);
      expect((await c.post('/api/me/mfa/disable', { password: SUPER.password })).statusCode).toBe(403);
      const setup = (await c.post('/api/me/mfa/setup', { password: SUPER.password })).json() as { secret: string };
      const en = await c.post('/api/me/mfa/enable', { code: totpAt(setup.secret, currentStep()) });
      expectStatus(en, 200);
      expectStatus(await client(strict.app, en.json().accessToken).get('/api/platform/schools'), 200);
    } finally {
      await strict.app.close();
      await strict.database.close();
    }
  });
});

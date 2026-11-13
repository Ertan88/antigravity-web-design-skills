import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, SUPER, type TestCtx } from './helpers.ts';

/* Giriş güvenliği: hesap başına art arda hatalı giriş kilidi, HTML sayfalarında CSP başlığı */

let t: TestCtx;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('giriş güvenliği', () => {
  it('bir hesaba art arda 5 hatalı girişte doğru şifre de bir süre kabul edilmez; başka hesap etkilenmez', async () => {
    const tryLogin = (email: string, password: string) => t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
    for (let i = 0; i < 5; i++) expect((await tryLogin(SUPER.email, 'yanlis-sifre')).statusCode).toBe(401);
    const locked = await tryLogin(SUPER.email, SUPER.password);
    expect(locked.statusCode).toBe(429);
    expect(locked.json().message).toContain('dakika sonra');
    // Aynı ağdan başka hesap girebilir (okuldaki diğer öğretmenler)
    expect((await tryLogin('baska@ornek.test', 'yanlis-sifre')).statusCode).toBe(401);
  });

  it('API yanıtlarında CSP başlığı yok (yalnızca HTML sayfalarına eklenir)', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(r.headers['content-security-policy']).toBeUndefined();
  });
});

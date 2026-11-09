import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers.ts';

/* Kullanıcıya giden hata mesajları Türkçe: doğrulama, Fastify eklentileri ve bozuk istekler */

let t: TestCtx;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

const ENGLISH = /\b(invalid|expected|received|body|cannot|unexpected|json|must|required)\b/i;

describe('Türkçe hata mesajları', () => {
  it('doğrulama hatası alan adıyla Türkçe', async () => {
    // Şemada özel mesaj varsa o kullanılır (alan adı zaten içinde)
    const login = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'yanlis', password: 'x' } });
    expect(login.statusCode).toBe(400);
    expect(login.json().message).toBe('Geçerli bir e-posta girin');
    // Özel mesaj yoksa Türkçe varsayılan mesajın başına alanın adı yazılır
    const code = await t.app.inject({ method: 'POST', url: '/api/enroll/code', payload: { code: 'AB' } });
    expect(code.json().message).toBe('Kod: En az 6 karakter olmalı.');
    const missing = await t.app.inject({ method: 'POST', url: '/api/enroll/code', payload: {} });
    expect(missing.json().message).toBe('Kod: Bu alan zorunlu.');
  });

  it('bozuk JSON ve boş gövde İngilizce mesaj döndürmez', async () => {
    const bad = await t.app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' }, payload: '{bozuk' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).not.toMatch(ENGLISH);
    const empty = await t.app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' }, payload: '' });
    expect(empty.json().message).not.toMatch(ENGLISH);
    const type = await t.app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'text/xml' }, payload: '<a/>' });
    expect(type.statusCode).toBe(415);
    expect(type.json().message).toBe('Gönderilen içerik türü desteklenmiyor.');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let root: ReturnType<typeof client>;
/** Okul sahibi: okul içeriğini o yönetir (platform yöneticisi üye değilse erişemez) */
let owner: ReturnType<typeof client>;
let base: string;

beforeAll(async () => {
  t = await createTestApp();
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Deneme Okulu', slug: 'deneme-okulu', ownerEmail: 'sahip@deneme.test', ownerName: 'Okul Sahibi', ownerPassword: 'SahipSifre42' });
  expectStatus(res, 201);
  base = `/api/schools/${res.json().id}`;
  owner = client(t.app, (await login(t.app, 'sahip@deneme.test', 'SahipSifre42')).token);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('kaydedilen ayarlar geri dönmez', () => {
  it('bir sayfadaki ayarı kaydetmek diğer sayfaların ayarlarını sıfırlamaz', async () => {
    expectStatus(await owner.patch(base, { settings: { schoolType: 'Fen Lisesi' } }), 200);
    expectStatus(await owner.patch(base, { settings: { tickerHistory: true, tickerQuote: true } }), 200);
    expectStatus(await owner.patch(base, { settings: { hasTransport: true } }), 200);
    const s = (await owner.get(base)).json().settings;
    expect(s).toMatchObject({ schoolType: 'Fen Lisesi', tickerHistory: true, tickerQuote: true, hasTransport: true });
  });

  it('düzenleme formunda olmayan sıra ve yayın durumu korunur', async () => {
    const a = (await owner.post(`${base}/ticker`, { text: 'Birinci' })).json();
    const b = (await owner.post(`${base}/ticker`, { text: 'İkinci' })).json();
    expectStatus(await owner.post(`${base}/ticker/reorder`, { ids: [b.id, a.id] }), 200);
    expectStatus(await owner.patch(`${base}/ticker/${a.id}`, { isActive: false }), 200);
    const before = (await owner.get(`${base}/ticker`)).json().find((x: { id: string }) => x.id === a.id);
    expectStatus(await owner.put(`${base}/ticker/${a.id}`, { text: 'Birinci (düzeltildi)', startsAt: null, endsAt: null }), 200);
    const after = (await owner.get(`${base}/ticker`)).json().find((x: { id: string }) => x.id === a.id);
    expect(after).toMatchObject({ text: 'Birinci (düzeltildi)', sortOrder: before.sortOrder, isActive: false });
  });

  it('başarı kartta ya da duyuruda ayrı gösterilir', async () => {
    const res = await owner.post(`${base}/achievements`, { kind: 'achievement', name: 'Ali K.', title: 'İl birincisi', showCard: false, showSlide: true });
    expectStatus(res, 201);
    expect(res.json()).toMatchObject({ showCard: false, showSlide: true, isActive: true });
  });
});

describe('öğrenci listesini temizle', () => {
  it('onay olmadan silmez, onayla hepsini siler', async () => {
    expectStatus(await owner.post(`${base}/students`, { fullName: 'Deniz Ak', birthDate: '2012-05-04' }), 201);
    expect((await owner.post(`${base}/students/delete-all`, {})).statusCode).toBe(400);
    expect((await owner.post(`${base}/students/delete-all`, { confirm: 'delete-all' })).json()).toEqual({ deleted: 1 });
    expect((await owner.get(`${base}/students`)).json()).toEqual([]);
  });
});

describe('başlıklar', () => {
  it('yalnızca yetkisi olan değiştirir; diğer ayarlar korunur', async () => {
    const mk = async (email: string, permissions: string[]) => {
      expectStatus(await owner.post(`${base}/members`, { email, fullName: 'Editör', role: 'editor', permissions, password: 'EditorSifre42' }), 201);
      return client(t.app, (await login(t.app, email, 'EditorSifre42')).token);
    };
    const plain = await mk('duz@deneme.test', ['duties.manage']);
    const labeler = await mk('baslik@deneme.test', ['labels.manage']);
    expect((await plain.put(`${base}/labels`, { labels: { transport: 'Servis Nöbetçileri' } })).statusCode).toBe(403);
    const res = await labeler.put(`${base}/labels`, { labels: { transport: 'Servis Nöbetçileri', exams: '  ' } });
    expectStatus(res, 200);
    expect(res.json().settings.labels).toEqual({ transport: 'Servis Nöbetçileri' });
    expect(res.json().settings.schoolType).toBe('Fen Lisesi');
    // Ayar yetkisi olmayan başlık editörü okul ayarlarını değiştiremez
    expect((await labeler.patch(base, { settings: { schoolType: 'x' } })).statusCode).toBe(403);
  });
});

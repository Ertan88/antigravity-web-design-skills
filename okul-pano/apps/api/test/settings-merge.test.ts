import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, SUPER, type TestCtx } from './helpers.ts';

let t: TestCtx;
let root: ReturnType<typeof client>;
let base: string;

beforeAll(async () => {
  t = await createTestApp();
  root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Deneme Okulu', slug: 'deneme-okulu', ownerEmail: 'sahip@deneme.test', ownerName: 'Okul Sahibi', ownerPassword: 'SahipSifre42' });
  expectStatus(res, 201);
  base = `/api/schools/${res.json().id}`;
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('kaydedilen ayarlar geri dönmez', () => {
  it('bir sayfadaki ayarı kaydetmek diğer sayfaların ayarlarını sıfırlamaz', async () => {
    expectStatus(await root.patch(base, { settings: { schoolType: 'Fen Lisesi' } }), 200);
    expectStatus(await root.patch(base, { settings: { tickerHistory: true, tickerQuote: true } }), 200);
    expectStatus(await root.patch(base, { settings: { hasTransport: true } }), 200);
    const s = (await root.get(base)).json().settings;
    expect(s).toMatchObject({ schoolType: 'Fen Lisesi', tickerHistory: true, tickerQuote: true, hasTransport: true });
  });

  it('düzenleme formunda olmayan sıra ve yayın durumu korunur', async () => {
    const a = (await root.post(`${base}/ticker`, { text: 'Birinci' })).json();
    const b = (await root.post(`${base}/ticker`, { text: 'İkinci' })).json();
    expectStatus(await root.post(`${base}/ticker/reorder`, { ids: [b.id, a.id] }), 200);
    expectStatus(await root.patch(`${base}/ticker/${a.id}`, { isActive: false }), 200);
    const before = (await root.get(`${base}/ticker`)).json().find((x: { id: string }) => x.id === a.id);
    expectStatus(await root.put(`${base}/ticker/${a.id}`, { text: 'Birinci (düzeltildi)', startsAt: null, endsAt: null }), 200);
    const after = (await root.get(`${base}/ticker`)).json().find((x: { id: string }) => x.id === a.id);
    expect(after).toMatchObject({ text: 'Birinci (düzeltildi)', sortOrder: before.sortOrder, isActive: false });
  });

  it('başarı kartta ya da duyuruda ayrı gösterilir', async () => {
    const res = await root.post(`${base}/achievements`, { kind: 'achievement', name: 'Ali K.', title: 'İl birincisi', showCard: false, showSlide: true });
    expectStatus(res, 201);
    expect(res.json()).toMatchObject({ showCard: false, showSlide: true, isActive: true });
  });
});

describe('öğrenci listesini temizle', () => {
  it('onay olmadan silmez, onayla hepsini siler', async () => {
    expectStatus(await root.post(`${base}/students`, { fullName: 'Deniz Ak', birthDate: '2012-05-04' }), 201);
    expect((await root.post(`${base}/students/delete-all`, {})).statusCode).toBe(400);
    expect((await root.post(`${base}/students/delete-all`, { confirm: 'delete-all' })).json()).toEqual({ deleted: 1 });
    expect((await root.get(`${base}/students`)).json()).toEqual([]);
  });
});

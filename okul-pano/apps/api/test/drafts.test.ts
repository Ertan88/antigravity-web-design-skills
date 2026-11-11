import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, expectStatus, login, multipartBody, PNG_1PX, SUPER, type TestCtx } from './helpers.ts';

/* Duyuru taslakları: yarım kalan duyuru kişiye özel saklanır (sentetik okul) */
let t: TestCtx;
let owner: ReturnType<typeof client>;
let editor: ReturnType<typeof client>;
let schoolId: string;
const path = (p = '') => `/api/schools/${schoolId}/announcement-drafts${p}`;

beforeAll(async () => {
  t = await createTestApp();
  const root = client(t.app, (await login(t.app, SUPER.email, SUPER.password)).token);
  const res = await root.post('/api/platform/schools', { name: 'Taslak Okulu', slug: 'taslak-okulu', ownerEmail: 'mudur@taslak.test', ownerName: 'Müdür', ownerPassword: 'MudurTS123!' });
  expectStatus(res, 201);
  schoolId = res.json().id;
  owner = client(t.app, (await login(t.app, 'mudur@taslak.test', 'MudurTS123!')).token);
  expectStatus(await owner.post(`/api/schools/${schoolId}/members`, { email: 'editor@taslak.test', fullName: 'Editör', password: 'GizliSifre42', role: 'editor', permissions: ['announcements.manage'] }), 201);
  editor = client(t.app, (await login(t.app, 'editor@taslak.test', 'GizliSifre42')).token);
});

afterAll(async () => {
  await t.app.close();
  await t.database.close();
});

describe('duyuru taslakları', () => {
  it('kaydedilir, güncellenir, yalnızca giren kişi görür ve silinir', async () => {
    const created = await editor.post(path(), { step: 1, data: { kind: 'text', title: 'Bilim fuarı' } });
    expectStatus(created, 201);
    const id = created.json().id as string;
    expect((await editor.get(path())).json()).toMatchObject([{ id, step: 1, data: { kind: 'text', title: 'Bilim fuarı' } }]);
    // Başkasının taslağı görünmez, değiştirilemez, silinemez
    expect((await owner.get(path())).json()).toEqual([]);
    expect((await owner.put(path(`/${id}`), { step: 2, data: {} })).statusCode).toBe(404);
    expect((await owner.del(path(`/${id}`))).statusCode).toBe(404);
    expectStatus(await editor.put(path(`/${id}`), { step: 2, data: { kind: 'text', title: 'Bilim fuarı', body: 'Kütüphanede' } }), 200);
    expect((await editor.get(path())).json()[0]).toMatchObject({ step: 2, data: { body: 'Kütüphanede' } });
    expect((await editor.del(path(`/${id}`))).statusCode).toBe(204);
    expect((await editor.get(path())).json()).toEqual([]);
  });

  it('kişi başına en çok 20 taslak kalır', async () => {
    for (let i = 0; i < 22; i++) expectStatus(await owner.post(path(), { step: 0, data: { title: `T${i}` } }), 201);
    const list = (await owner.get(path())).json() as { data: { title: string } }[];
    expect(list).toHaveLength(20);
    expect(list.map((d) => d.data.title)).not.toContain('T0');
  });

  it('destek talebi eki: "Platforma yazar" yetkisi olan görsel yükleyebilir, yetkisi olmayan yükleyemez', async () => {
    expectStatus(await owner.post(`/api/schools/${schoolId}/members`, { email: 'destek@taslak.test', fullName: 'Destek', password: 'GizliSifre42', role: 'editor', permissions: ['support.contact'] }), 201);
    expectStatus(await owner.post(`/api/schools/${schoolId}/members`, { email: 'yok@taslak.test', fullName: 'Yetkisiz', password: 'GizliSifre42', role: 'editor', permissions: [] }), 201);
    const send = async (email: string) => {
      const token = (await login(t.app, email, 'GizliSifre42')).token;
      const png = multipartBody('file', 'ekran.png', PNG_1PX, 'image/png');
      return t.app.inject({ method: 'POST', url: `/api/schools/${schoolId}/uploads`, headers: { ...png.headers, authorization: `Bearer ${token}` }, payload: png.payload });
    };
    expectStatus(await send('destek@taslak.test'), 201);
    expect((await send('yok@taslak.test')).statusCode).toBe(403);
  });
});
